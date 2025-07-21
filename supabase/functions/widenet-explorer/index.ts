import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchConfig {
  id: string;
  brand: string;
  model: string;
  qualifier?: string;
  sub_qualifier?: string;
  price_threshold: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  position: number;
}

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
    
    // Get search configuration
    const { data: searchConfig, error: configError } = await supabaseClient
      .from('search_configs')
      .select('*')
      .eq('id', searchConfigId)
      .single();

    if (configError || !searchConfig) {
      throw new Error(`Search config not found: ${configError?.message}`);
    }

    console.log(`Starting WideNet exploration for: ${searchConfig.brand} ${searchConfig.model}`);

    // Log start
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'widenet-explorer',
      p_search_config_id: searchConfigId,
      p_status: 'started',
      p_message: `WideNet exploration for ${searchConfig.brand} ${searchConfig.model}`
    });

    const startTime = Date.now();

    // Build search query
    const searchQuery = buildSearchQuery(searchConfig);
    console.log(`Search query: ${searchQuery}`);

    // Perform Google search
    const searchResults = await performGoogleSearch(searchQuery);
    console.log(`Found ${searchResults.length} search results`);

    // Save results to database
    let savedCount = 0;
    for (const result of searchResults) {
      try {
        const { error } = await supabaseClient
          .from('widenet_results')
          .insert({
            search_config_id: searchConfigId,
            title: result.title,
            url: result.url,
            snippet: result.snippet || '',
            position: result.position,
            search_query: searchQuery
          });

        if (!error) {
          savedCount++;
        } else {
          console.error(`Error saving result ${result.position}:`, error);
        }
      } catch (error) {
        console.error('Error saving search result:', error);
      }
    }

    const executionTime = Date.now() - startTime;

    // Log completion
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'widenet-explorer',
      p_search_config_id: searchConfigId,
      p_status: 'success',
      p_message: `Saved ${savedCount} search results for ${searchQuery}`,
      p_listings_found: 0,
      p_sources_processed: savedCount,
      p_execution_time_ms: executionTime,
      p_metadata: {
        search_query: searchQuery,
        results_found: searchResults.length,
        results_saved: savedCount
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        results_found: searchResults.length,
        results_saved: savedCount,
        search_query: searchQuery,
        execution_time_ms: executionTime
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('WideNet explorer error:', error);
    
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

function buildSearchQuery(config: SearchConfig): string {
  const parts = [config.brand, config.model];
  
  if (config.qualifier) parts.push(config.qualifier);
  if (config.sub_qualifier) parts.push(config.sub_qualifier);
  
  // Add marketplace-specific terms to find buy/sell listings
  const marketplaceTerms = ['buy', 'sell', 'for sale', 'marketplace', 'used'];
  const randomTerm = marketplaceTerms[Math.floor(Math.random() * marketplaceTerms.length)];
  parts.push(randomTerm);
  
  // Add price context if threshold is reasonable
  if (config.price_threshold && config.price_threshold < 10000) {
    parts.push(`under $${config.price_threshold}`);
  }
  
  return parts.join(' ');
}

async function performGoogleSearch(query: string): Promise<SearchResult[]> {
  const serpApiKey = Deno.env.get('SERPAPI_KEY');
  
  if (serpApiKey) {
    return await performSerpAPISearch(query, serpApiKey);
  } else {
    console.log('SerpAPI key not found, using fallback search method');
    return await performFallbackSearch(query);
  }
}

async function performSerpAPISearch(query: string, apiKey: string): Promise<SearchResult[]> {
  try {
    const url = new URL('https://serpapi.com/search');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('num', '20');
    url.searchParams.set('start', '0');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error) {
      throw new Error(`SerpAPI error: ${data.error}`);
    }

    const results: SearchResult[] = [];
    const organicResults = data.organic_results || [];

    for (let i = 0; i < organicResults.length && i < 20; i++) {
      const result = organicResults[i];
      results.push({
        title: result.title || 'No title',
        url: result.link || '',
        snippet: result.snippet || '',
        position: i + 1
      });
    }

    return results;
  } catch (error) {
    console.error('SerpAPI search failed:', error);
    return await performFallbackSearch(query);
  }
}

async function performFallbackSearch(query: string): Promise<SearchResult[]> {
  // Fallback: Create mock results based on common marketplace patterns
  const marketplaces = [
    'craigslist.org',
    'facebook.com/marketplace',
    'mercari.com',
    'poshmark.com',
    'depop.com',
    'vinted.com',
    'thredup.com',
    'vestiairecollective.com',
    'grailed.com',
    'therealreal.com'
  ];

  const results: SearchResult[] = [];
  const encodedQuery = encodeURIComponent(query);

  for (let i = 0; i < Math.min(15, marketplaces.length); i++) {
    const marketplace = marketplaces[i];
    results.push({
      title: `${query} - ${marketplace}`,
      url: `https://${marketplace}/search?q=${encodedQuery}`,
      snippet: `Search results for "${query}" on ${marketplace}`,
      position: i + 1
    });
  }

  // Add some general search suggestions
  const additionalSites = [
    { domain: 'reddit.com', path: '/search' },
    { domain: 'pinterest.com', path: '/search/pins' },
    { domain: 'youtube.com', path: '/results' },
    { domain: 'instagram.com', path: '/explore/tags' },
    { domain: 'twitter.com', path: '/search' }
  ];

  for (let i = 0; i < additionalSites.length && results.length < 20; i++) {
    const site = additionalSites[i];
    results.push({
      title: `${query} discussions - ${site.domain}`,
      url: `https://${site.domain}${site.path}?q=${encodedQuery}`,
      snippet: `Community discussions and posts about "${query}"`,
      position: results.length + 1
    });
  }

  return results;
}