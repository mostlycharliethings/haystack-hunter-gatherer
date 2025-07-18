import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { searchConfigId } = await req.json();
    let configId = searchConfigId;

    // If no specific config provided, this is a general discovery run
    if (!configId) {
      console.log('Running general discovery crawler');
    } else {
      console.log(`Running discovery crawler for config: ${configId}`);
    }

    // Log start
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'discovery-crawler',
      p_search_config_id: configId,
      p_status: 'started',
      p_message: 'Starting discovery of novel marketplace websites'
    });

    const startTime = Date.now();

    // Discover novel websites
    const novelSites = await discoverNovelSites();
    console.log(`Discovered ${novelSites.length} potential novel sites`);

    // Validate and score each site
    const validatedSites = await validateAndScoreSites(novelSites);
    console.log(`${validatedSites.length} sites validated successfully`);

    // Store results in tertiary_sources
    let savedCount = 0;
    for (const site of validatedSites) {
      try {
        const { error } = await supabaseClient
          .from('tertiary_sources')
          .upsert({
            url: site.url,
            name: site.name,
            category: site.category,
            region: 'denver', // Phase 1 scope
            success_rate: 0,
            freshness_score: site.freshness_score,
            reliability_score: site.reliability_score,
            is_active: true,
            discovered_by: 'crawler',
            notes: site.description
          }, { 
            onConflict: 'url',
            ignoreDuplicates: true 
          });

        if (!error) savedCount++;
      } catch (error) {
        console.error('Error saving discovered site:', error);
      }
    }

    const executionTime = Date.now() - startTime;

    // Log completion
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'discovery-crawler',
      p_search_config_id: configId,
      p_status: 'success',
      p_message: `Discovered ${savedCount} new tertiary sources`,
      p_listings_found: 0,
      p_sources_processed: savedCount,
      p_execution_time_ms: executionTime,
      p_metadata: {
        sites_discovered: novelSites.length,
        sites_validated: validatedSites.length,
        region: 'denver'
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        sources_discovered: savedCount,
        execution_time_ms: executionTime
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Discovery crawler error:', error);
    
    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function discoverNovelSites(): Promise<any[]> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `Find 5-8 lesser-known online communities, forums, and niche marketplaces in the Denver/Colorado area where people might post items for sale. Focus on:

1. Local community forums and bulletin boards
2. University/college classified sections
3. Hobby-specific forums with for-sale sections
4. Professional/trade community boards
5. Neighborhood-specific sites
6. Local Facebook groups (if they have web presence)

Do NOT include major sites like Craigslist, Facebook Marketplace, eBay, etc.

For each site, provide:
1. Website URL (must be real and accessible)
2. Site name
3. Category (if specific) or null for general
4. Brief description
5. Estimated activity level (1-10)

Format as JSON array:
[
  {
    "url": "https://example.com",
    "name": "Site Name",
    "category": "Electronics" or null,
    "description": "Brief description",
    "activity_level": 7
  }
]

Focus on Colorado/Denver region specifically.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.4
      })
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content.trim();
      
      try {
        const sites = JSON.parse(content);
        return Array.isArray(sites) ? sites : [];
      } catch (parseError) {
        console.error('Failed to parse GPT response as JSON:', parseError);
        return [];
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error discovering novel sites:', error);
    return [];
  }
}

async function validateAndScoreSites(sites: any[]): Promise<any[]> {
  const validatedSites = [];
  
  for (const site of sites) {
    if (!site.url || !site.name) continue;
    
    try {
      console.log(`Validating: ${site.name} (${site.url})`);
      
      // Check if site is accessible
      const response = await fetch(site.url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HaystackBot/1.0)'
        }
      });
      
      if (!response.ok) {
        console.log(`✗ Failed validation: ${site.name} (${response.status})`);
        continue;
      }
      
      // Get page content for scoring
      const contentResponse = await fetch(site.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HaystackBot/1.0)'
        }
      });
      
      if (!contentResponse.ok) {
        console.log(`✗ Failed content fetch: ${site.name}`);
        continue;
      }
      
      const html = await contentResponse.text();
      
      // Score the site
      const scores = scoreSite(html, site);
      
      const validatedSite = {
        url: site.url,
        name: site.name,
        category: site.category,
        description: site.description || `Discovered ${site.name}`,
        freshness_score: scores.freshness,
        reliability_score: scores.reliability,
        activity_level: site.activity_level || 5
      };
      
      validatedSites.push(validatedSite);
      console.log(`✓ Validated: ${site.name} (F:${scores.freshness}, R:${scores.reliability})`);
      
    } catch (error) {
      console.log(`✗ Failed validation: ${site.name} (${error.message})`);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return validatedSites;
}

function scoreSite(html: string, site: any): { freshness: number, reliability: number } {
  let freshness = 50; // Base score
  let reliability = 50; // Base score
  
  const text = html.toLowerCase();
  
  // Freshness indicators
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  // Check for recent dates
  if (text.includes(currentYear.toString())) {
    freshness += 20;
  }
  if (text.includes('today') || text.includes('yesterday')) {
    freshness += 15;
  }
  if (text.includes('hour ago') || text.includes('hours ago')) {
    freshness += 25;
  }
  
  // Check for marketplace/classified keywords
  const marketplaceKeywords = [
    'for sale', 'classified', 'marketplace', 'buy', 'sell', 
    'listing', 'price', 'contact seller', 'post ad'
  ];
  
  for (const keyword of marketplaceKeywords) {
    if (text.includes(keyword)) {
      reliability += 5;
    }
  }
  
  // Check for forum activity indicators
  const activityKeywords = [
    'latest post', 'recent activity', 'online now', 'active members',
    'new message', 'reply', 'comment'
  ];
  
  for (const keyword of activityKeywords) {
    if (text.includes(keyword)) {
      freshness += 8;
    }
  }
  
  // Reliability indicators
  if (text.includes('register') || text.includes('login')) {
    reliability += 10; // User accounts indicate more legitimate site
  }
  if (text.includes('privacy policy') || text.includes('terms')) {
    reliability += 10; // Legal pages indicate legitimacy
  }
  if (text.includes('contact') || text.includes('about')) {
    reliability += 8; // Contact info indicates legitimacy
  }
  
  // Penalize thin content
  if (html.length < 5000) {
    reliability -= 15;
  }
  
  // Boost based on stated activity level
  if (site.activity_level) {
    freshness += Math.min(site.activity_level * 2, 20);
    reliability += Math.min(site.activity_level * 1.5, 15);
  }
  
  // Cap scores
  freshness = Math.max(0, Math.min(100, freshness));
  reliability = Math.max(0, Math.min(100, reliability));
  
  return { freshness, reliability };
}