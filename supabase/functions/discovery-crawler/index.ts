import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GPT_SYSTEM_PROMPT = `
You are an expert internet sleuth tasked with discovering unusual, obscure, or local websites where people in Colorado might post items for sale. These could include:

Community bulletin boards
Local classifieds
Estate sale listings
Antique Stores
Pawnshops
Forum-based marketplaces
Hobbyist sites with active For Sale sections
Church or club sale pages
Hyperlocal Facebook Groups (if public)
Rural or regional aggregators

Prioritize unusual or overlooked sources, not major platforms like Craigslist, eBay, or B&H.

Assume the goal is to uncover hidden marketplaces, the "nooks and crannies" of the internet where unexpected deals might surface.
`;

const GPT_USER_PROMPT = `
Identify 10–15 obscure, hyperlocal, or niche websites (not mainstream marketplaces) where people in Colorado might sell or list used items, estate sales, hobby gear, or hard-to-find items.

Focus on:
- Smaller Colorado towns
- Region-specific forums
- Local newspapers with classifieds
- Auctioneers or estate sale firms
- Specialized enthusiast sites

Return a JSON array like this:

[
  {
    "name": "Western Slope Classifieds",
    "search_url": "https://classifieds.westernslope.com/search/{query}",
    "category": "Regional / General",
    "description": "Classified section of a small Colorado newspaper",
    "searchable": true
  },
  {
    "name": "Front Range Farm Estate Sales",
    "search_url": "https://frfarmauctions.com/search?q={query}",
    "category": "Estate Sales / Agriculture",
    "description": "Farm and ranch estate sales site in rural Colorado",
    "searchable": false
  }
]

Include a mix of searchable = true and false — even if a site isn't queryable, it may still be valuable for scraping or crawling manually later.
`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return jsonResponse({ error: "Missing OpenAI API key" }, 500);
  }

  let configId: string | null = null;
  try {
    const body = await req.json();
    configId = body?.searchConfigId ?? null;
  } catch {}

  await logActivity(supabase, "discovery-crawler", configId, "started", "Discovery crawler starting to populate tertiary_sources");

  try {
    const startTime = Date.now();

    // Get active search configs for tagging discovered sources
    const { data: searchConfigs } = await supabase
      .from('search_configs')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    if (!searchConfigs || searchConfigs.length === 0) {
      throw new Error('No active search configs found');
    }

    const refConfigId = searchConfigs[0].id;

    const discoveredSites = await discoverMarketplaceSites(openaiKey, supabase);
    const validatedSites = await validateMarketplaceSites(discoveredSites);

    let savedCount = 0;

    // Save validated marketplace sites as tertiary sources
    for (const site of validatedSites) {
      try {
        console.log(`💾 Saving tertiary source: ${site.name}`);
        
        const { error: insertError } = await supabase.from("tertiary_sources").upsert({
          search_config_id: refConfigId,
          title: `${site.name} Marketplace`,
          price: 0, // Placeholder price - actual prices come from searches
          location: 'Colorado',
          source: site.name,
          url: site.search_url || site.url,
          posted_at: new Date().toISOString(),
          discovered_at: new Date().toISOString(),
          relevance_score: site.score / 100.0,
          discovery_type: site.category.toLowerCase(),
          tier: 3,
          searchable: true,
          searchable_false_reason: null
        }, {
          onConflict: "url",
          ignoreDuplicates: false
        });

        if (insertError) {
          console.error(`❌ Error saving ${site.name}:`, insertError.message);
        } else {
          savedCount++;
          console.log(`✅ Saved tertiary source ${savedCount}: ${site.name}`);
        }
      } catch (error) {
        console.error(`❌ Exception saving ${site.name}:`, error.message);
      }
    }

    const duration = Date.now() - startTime;

    await logActivity(supabase, "discovery-crawler", configId, "success", 
      `Discovered ${discoveredSites.length} sites, validated ${validatedSites.length}, saved ${savedCount} tertiary sources`, 
      {
        sites_discovered: discoveredSites.length,
        sites_validated: validatedSites.length,
        tertiary_sources_added: savedCount,
        region: "colorado"
      }, 
      savedCount, 
      duration
    );

    return jsonResponse({ 
      success: true, 
      sites_discovered: discoveredSites.length,
      sites_validated: validatedSites.length,
      tertiary_sources_added: savedCount
    }, 200);
  } catch (err) {
    console.error("Discovery crawler failure:", err);
    await logActivity(supabase, "discovery-crawler", configId, "failed", err.message || "Unknown error");
    return jsonResponse({ error: err.message }, 500);
  }
});

async function discoverMarketplaceSites(apiKey: string, supabase: any): Promise<any[]> {
  console.log("🤖 Asking OpenAI to discover marketplace sites...");
  
  // Get existing sources to avoid duplicates
  const existingSources = await getExistingSources(supabase);
  const existingDomains = existingSources.map(s => normalizeDomain(s)).join(', ');
  
  const enhancedPrompt = `${GPT_USER_PROMPT}

AVOID THESE EXISTING SOURCES (we already have them):
${existingDomains}

Focus on discovering NEW sources not in the above list. Prioritize Colorado-specific, hyperlocal, or niche sites we haven't found yet.`;
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: GPT_SYSTEM_PROMPT },
        { role: "user", content: enhancedPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  try {
    const content = data.choices?.[0]?.message?.content || "[]";
    console.log("🤖 OpenAI response:", content);
    
    const parsed = JSON.parse(content);
    const sites = Array.isArray(parsed) ? parsed : [];
    
    console.log(`🔍 Discovered ${sites.length} potential marketplace sites`);
    return sites;
  } catch (e) {
    console.warn("Failed to parse GPT response:", e);
    return [];
  }
}

async function validateMarketplaceSites(sites: any[]): Promise<any[]> {
  const validatedSites: any[] = [];
  
  console.log(`🔍 Validating ${sites.length} discovered sites...`);
  
  for (const site of sites) {
    if (!site.search_url && !site.name) {
      console.log(`⚠️  Skipping site - missing required fields`);
      continue;
    }

    try {
      console.log(`🌐 Validating ${site.name}...`);
      
      // Test the base URL or search URL
      const testUrl = site.search_url ? site.search_url.replace('{query}', 'test') : site.url;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(testUrl, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; marketplace-discovery/1.0)'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const score = scoreMarketplaceSite(site);
        
        if (score >= 60) {
          validatedSites.push({
            ...site,
            score: score,
            url: testUrl,
            validated_at: new Date().toISOString()
          });
          console.log(`✅ Validated ${site.name} (score: ${score})`);
        } else {
          console.log(`❌ ${site.name} scored too low (${score})`);
        }
      } else {
        console.log(`❌ ${site.name} returned HTTP ${response.status}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`⏰ ${site.name} timed out`);
      } else {
        console.log(`❌ ${site.name} validation failed:`, error.message);
      }
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log(`✅ Validated ${validatedSites.length}/${sites.length} sites`);
  return validatedSites;
}

function scoreMarketplaceSite(site: any): number {
  let score = 50; // Base score
  
  // Category bonus
  const categories = {
    'general': 20,
    'cycling': 15,
    'automotive': 15,
    'electronics': 12,
    'sports': 10,
    'furniture': 10
  };
  
  const category = site.category?.toLowerCase() || '';
  score += categories[category] || 5;
  
  // Search URL bonus (means it's scrapeable)
  if (site.search_url && site.search_url.includes('{query}')) {
    score += 25;
  }
  
  // Name quality bonus
  if (site.name && site.name.length > 5 && site.name.length < 50) {
    score += 10;
  }
  
  // Searchable flag bonus
  if (site.searchable === true) {
    score += 15;
  }
  
  // Description quality
  if (site.description && site.description.length > 20) {
    score += 5;
  }
  
  return Math.max(0, Math.min(100, score));
}

// This function is no longer needed since we're populating tertiary_sources 
// with marketplace metadata instead of scraping listings directly

async function logActivity(client: any, module: string, configId: string | null, status: string, msg: string, metadata: any = {}, sources = 0, time = 0) {
  await client.rpc("log_scrape_activity", {
    p_module_name: module,
    p_search_config_id: configId,
    p_status: status,
    p_message: msg,
    p_listings_found: metadata.listings_saved || 0,
    p_sources_processed: sources,
    p_execution_time_ms: time,
    p_metadata: metadata,
  });
}

function jsonResponse(obj: object, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

// Helper function to get existing sources from both tables
async function getExistingSources(supabase: any): Promise<string[]> {
  const sources = new Set<string>();
  
  // Get from secondary_sources
  const { data: secondary } = await supabase
    .from('secondary_sources')
    .select('source');
  
  if (secondary) {
    secondary.forEach((s: any) => sources.add(s.source));
  }
  
  // Get from tertiary_sources  
  const { data: tertiary } = await supabase
    .from('tertiary_sources')
    .select('source');
    
  if (tertiary) {
    tertiary.forEach((s: any) => sources.add(s.source));
  }
  
  return Array.from(sources);
}

// Helper function to normalize domain names for comparison
function normalizeDomain(source: string): string {
  try {
    // If it's a source name, return as-is
    if (!source.includes('.')) return source;
    
    // Extract domain from URL
    const url = source.startsWith('http') ? source : `https://${source}`;
    const domain = new URL(url).hostname;
    
    // Remove www prefix and return
    return domain.replace(/^www\./, '').toLowerCase();
  } catch {
    return source.toLowerCase();
  }
}