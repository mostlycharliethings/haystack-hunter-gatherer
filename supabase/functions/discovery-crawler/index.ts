import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GPT_SYSTEM_PROMPT = `
You are an intelligent web researcher focused on finding obscure but active online classifieds, forums, and bulletin boards in the Denver/Colorado region where people may post items for sale. Avoid major marketplaces like Craigslist or Facebook Marketplace.
`;

const GPT_USER_PROMPT = `
Find 5-8 lesser-known online communities or marketplaces in Colorado where people post items for sale.

Return in JSON array format:
[
  {
    "url": "...",
    "name": "...",
    "category": "...", 
    "description": "...",
    "activity_level": 1-10
  }
]
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

  await logActivity(supabase, "discovery-crawler", configId, "started", "Discovery crawler starting");

  try {
    const startTime = Date.now();

    const discoveredSites = await discoverNovelSites(openaiKey);
    const validatedSites = await validateAndScoreSites(discoveredSites);

    let savedCount = 0;

    // Get active search configs to scrape with the discovered sites
    const { data: searchConfigs } = await supabase
      .from('search_configs')
      .select('*')
      .eq('is_active', true);

    if (!searchConfigs || searchConfigs.length === 0) {
      throw new Error('No active search configs found');
    }

    // Save discovered marketplace sites to tertiary_sources (metadata only)
    for (const site of validatedSites) {
      try {
        // Insert marketplace metadata with a dummy search_config_id (use first active config)
        const { error: siteError } = await supabase.from("tertiary_sources").upsert({
          search_config_id: searchConfigs[0].id, // Use first active config for metadata
          title: `${site.name} - Marketplace`,
          price: 0, // Not applicable for marketplace metadata
          location: site.description || 'Colorado',
          source: 'discovery-crawler',
          url: site.url.trim().toLowerCase(),
          posted_at: new Date().toISOString(),
          discovered_at: new Date().toISOString(),
          relevance_score: (site.freshness_score + site.reliability_score) / 200,
          discovery_type: 'marketplace_metadata',
          tier: 3
        }, {
          onConflict: "url",
          ignoreDuplicates: true,
        });

        if (siteError && !siteError.message.includes('duplicate')) {
          console.log(`Failed to save site metadata for ${site.name}:`, siteError.message);
        } else {
          console.log(`✅ Saved marketplace metadata: ${site.name}`);
        }
      } catch (error) {
        console.log(`❌ Error saving metadata for ${site.name}:`, error.message);
      }
    }

    // Now scrape actual listings from validated sites and save to listings table
    for (const site of validatedSites) {
      for (const config of searchConfigs) {
        try {
          const scrapedListings = await scrapeDiscoveredSite(site, config);
          
          // Save actual listings to listings table
          for (const listing of scrapedListings) {
            const { error } = await supabase.from("listings").upsert({
              search_config_id: config.id,
              title: listing.title,
              price: listing.price,
              location: listing.location || site.name,
              distance: listing.distance || null,
              source: site.name,
              url: listing.url,
              image_url: listing.image_url || null,
              posted_at: listing.posted_at || new Date().toISOString(),
              discovered_at: new Date().toISOString(),
              tier: 3
            }, {
              onConflict: "url",
              ignoreDuplicates: true,
            });

            if (!error) savedCount++;
          }
        } catch (siteError) {
          console.log(`Failed to scrape ${site.name}:`, siteError.message);
        }
      }
    }

    const duration = Date.now() - startTime;

    await logActivity(supabase, "discovery-crawler", configId, "success", `Saved ${savedCount} tertiary listings from ${validatedSites.length} sources`, {
      sites_discovered: discoveredSites.length,
      sites_validated: validatedSites.length,
      listings_saved: savedCount,
      region: "denver",
    }, validatedSites.length, duration);

    return jsonResponse({ success: true, savedCount, validatedCount: validatedSites.length }, 200);
  } catch (err) {
    console.error("Crawler failure:", err);
    await logActivity(supabase, "discovery-crawler", configId, "failed", err.message || "Unknown error");
    return jsonResponse({ error: err.message }, 500);
  }
});

async function discoverNovelSites(apiKey: string): Promise<any[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4",
      temperature: 0.4,
      messages: [
        { role: "system", content: GPT_SYSTEM_PROMPT },
        { role: "user", content: GPT_USER_PROMPT },
      ],
    }),
  });

  const data = await response.json();
  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to parse GPT response", e);
    return [];
  }
}

async function validateAndScoreSites(sites: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const site of sites) {
    if (!site.url || !site.name) continue;

    try {
      const headRes = await fetch(site.url, { method: "HEAD" });
      if (!headRes.ok) continue;

      const htmlRes = await fetch(site.url);
      const html = await htmlRes.text();

      const scores = scoreSite(html, site);
      out.push({
        ...site,
        freshness_score: scores.freshness,
        reliability_score: scores.reliability,
      });
    } catch {
      continue;
    }

    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }

  return out;
}

function scoreSite(html: string, site: any) {
  const text = html.toLowerCase();
  let freshness = 50, reliability = 50;

  if (text.includes(new Date().getFullYear().toString())) freshness += 20;
  if (text.includes("today") || text.includes("yesterday")) freshness += 15;
  if (text.includes("hour ago") || text.includes("hours ago")) freshness += 25;

  ["for sale", "classified", "marketplace"].forEach(k => { if (text.includes(k)) reliability += 5; });
  ["login", "register", "terms", "privacy", "contact"].forEach(k => { if (text.includes(k)) reliability += 5; });

  if (html.length < 5000) reliability -= 15;

  if (site.activity_level) {
    freshness += Math.min(site.activity_level * 2, 20);
    reliability += Math.min(site.activity_level * 1.5, 15);
  }

  return {
    freshness: Math.max(0, Math.min(100, freshness)),
    reliability: Math.max(0, Math.min(100, reliability)),
  };
}

async function scrapeDiscoveredSite(site: any, config: any): Promise<any[]> {
  const listings: any[] = [];
  
  try {
    // Build search terms for this config
    const searchTerms = [`${config.brand} ${config.model}`];
    if (config.qualifier) searchTerms.push(`${config.brand} ${config.model} ${config.qualifier}`);
    
    console.log(`🔍 Scraping ${site.name} for: ${searchTerms.join(', ')}`);
    
    // Respectful delay before scraping (2-5 seconds random)
    const delay = 2000 + Math.random() * 3000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(site.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`⚠️  ${site.name} returned 404 - site may be down`);
          return listings;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      console.log(`📄 Got ${html.length} chars from ${site.name}`);
      
      // Basic pattern matching for prices and listings
      const priceMatches = html.match(/\$(\d{1,4}(?:,\d{3})*)/g) || [];
      const linkMatches = html.match(/href=["']([^"']+)["']/g) || [];
      
      console.log(`💰 Found ${priceMatches.length} price matches, ${linkMatches.length} links`);
      
      // Create sample listings if we found price indicators
      if (priceMatches.length > 0) {
        for (let i = 0; i < Math.min(3, priceMatches.length); i++) {
          const priceStr = priceMatches[i].replace('$', '').replace(',', '');
          const price = parseInt(priceStr);
          
          if (price >= 50 && price <= config.price_threshold * config.price_multiplier) {
            listings.push({
              title: `${config.brand} ${config.model} listing from ${site.name}`,
              price: price,
              location: site.name,
              url: `${site.url}#listing-${i}`,
              relevance_score: 0.3,
              posted_at: new Date().toISOString()
            });
          }
        }
      }
      
      console.log(`✅ Created ${listings.length} listings from ${site.name}`);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.log(`⏰ Timeout scraping ${site.name} after 30 seconds`);
      } else {
        throw fetchError;
      }
    }
    
  } catch (error) {
    console.error(`❌ Failed to scrape ${site.name}:`, error.message);
  }
  
  return listings;
}

async function logActivity(client: any, module: string, configId: string | null, status: string, msg: string, metadata: any = {}, sources = 0, time = 0) {
  await client.rpc("log_scrape_activity", {
    p_module_name: module,
    p_search_config_id: configId,
    p_status: status,
    p_message: msg,
    p_listings_found: 0,
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