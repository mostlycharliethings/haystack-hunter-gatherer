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
  year_start?: number;
  year_end?: number;
  price_threshold: number;
  price_multiplier: number;
  location?: string;
  user_id: string;
}

interface Source {
  id: string;
  url: string;
  name: string;
  category?: string;
  tier: number;
  success_rate: number;
  is_active: boolean;
}

interface ScrapedListing {
  title: string;
  price: number;
  location: string;
  url: string;
  image_url?: string;
  posted_at?: string;
  source: string;
  tier: number;
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

    console.log(`Starting extended search for: ${searchConfig.brand} ${searchConfig.model}`);

    // Log scrape start
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'extended-search',
      p_search_config_id: searchConfigId,
      p_status: 'started',
      p_message: `Starting extended search for ${searchConfig.brand} ${searchConfig.model}`
    });

    const startTime = Date.now();
    let totalListings: ScrapedListing[] = [];
    let totalSourcesProcessed = 0;

    // Categorize search for source filtering
    const category = await categorizeSearch(searchConfig);
    console.log(`Categorized as: ${category}`);

    // Get relevant secondary sources (tier 2)
    const { data: secondarySources } = await supabaseClient
      .from('secondary_sources')
      .select('*')
      .eq('is_active', true)
      .or(`category.eq.${category},category.is.null`)
      .order('success_rate', { ascending: false });

    // Get relevant tertiary sources (tier 3)  
    const { data: tertiarySources } = await supabaseClient
      .from('tertiary_sources')
      .select('*')
      .eq('is_active', true)
      .eq('region', 'denver') // Phase 1 scope
      .or(`category.eq.${category},category.is.null`)
      .order('reliability_score', { ascending: false });

    // Check ignored sources to exclude
    const { data: ignoredSources } = await supabaseClient
      .from('ignored_sources')
      .select('url');

    const ignoredUrls = new Set(ignoredSources?.map(s => s.url) || []);

    // Combine and filter sources
    const allSources: Source[] = [
      ...(secondarySources || []).map((s: any) => ({ ...s, tier: 2 })),
      ...(tertiarySources || []).map((s: any) => ({ ...s, tier: 3, success_rate: s.reliability_score }))
    ].filter(source => !ignoredUrls.has(source.url));

    console.log(`Found ${allSources.length} sources to scrape (${secondarySources?.length || 0} secondary, ${tertiarySources?.length || 0} tertiary)`);

    // Build search variants
    const searchVariants = buildSearchVariants(searchConfig);
    console.log(`Built ${searchVariants.length} search variants`);

    // Scrape each source
    for (const source of allSources.slice(0, 20)) { // Limit for performance
      try {
        console.log(`Scraping ${source.name} (tier ${source.tier})`);
        
        const sourceListings = await scrapeSource(source, searchVariants, searchConfig);
        
        if (sourceListings.length > 0) {
          totalListings.push(...sourceListings);
          console.log(`Found ${sourceListings.length} listings from ${source.name}`);
          
          // Update source success metrics
          await updateSourceMetrics(supabaseClient, source, true);
        } else {
          await updateSourceMetrics(supabaseClient, source, false);
        }
        
        totalSourcesProcessed++;
        
        // Rate limiting to be respectful
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        console.error(`Error scraping ${source.name}:`, error);
        await updateSourceMetrics(supabaseClient, source, false);
        totalSourcesProcessed++;
      }
    }

    // Filter by price range
    const maxPrice = Math.round(searchConfig.price_threshold * searchConfig.price_multiplier);
    const filteredListings = totalListings.filter(listing => 
      listing.price > 0 && listing.price <= maxPrice
    );

    console.log(`Filtered ${totalListings.length} listings to ${filteredListings.length} within price range`);

    // Geocode and save listings
    const geocodedListings = await geocodeListings(filteredListings, searchConfig);
    
    let savedCount = 0;
    for (const listing of geocodedListings) {
      try {
        const { error } = await supabaseClient
          .from('listings')
          .upsert({
            search_config_id: searchConfigId,
            title: listing.title,
            price: listing.price,
            location: listing.location,
            distance: listing.distance,
            source: listing.source,
            tier: listing.tier,
            url: listing.url,
            image_url: listing.image_url,
            posted_at: listing.posted_at,
            latitude: listing.latitude,
            longitude: listing.longitude
          }, { 
            onConflict: 'url',
            ignoreDuplicates: true 
          });

        if (!error) savedCount++;
      } catch (error) {
        console.error('Error saving listing:', error);
      }
    }

    const executionTime = Date.now() - startTime;

    // Update search config last run time
    await supabaseClient.rpc('update_search_config_last_run', {
      p_config_id: searchConfigId
    });

    // Log completion
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'extended-search',
      p_search_config_id: searchConfigId,
      p_status: 'success',
      p_message: `Found ${savedCount} new listings from ${totalSourcesProcessed} extended sources`,
      p_listings_found: savedCount,
      p_sources_processed: totalSourcesProcessed,
      p_execution_time_ms: executionTime,
      p_metadata: {
        category: category,
        total_scraped: totalListings.length,
        price_filtered: filteredListings.length,
        max_price: maxPrice,
        secondary_sources: secondarySources?.length || 0,
        tertiary_sources: tertiarySources?.length || 0
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        listings_found: savedCount,
        sources_processed: totalSourcesProcessed,
        execution_time_ms: executionTime
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Extended search error:', error);
    
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

async function categorizeSearch(config: SearchConfig): Promise<string> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    return 'Other'; // Fallback if no API key
  }

  const searchTerm = `${config.brand} ${config.model} ${config.qualifier || ''} ${config.sub_qualifier || ''}`.trim();
  
  const prompt = `Categorize this product search into one of these categories: Motorcycle, Camera, Cycling, Automotive, Electronics, Furniture, Musical Instruments, Sports, Tools, Collectibles, Jewelry, Art, Books, Clothing, Home & Garden, or Other.

Product: ${searchTerm}

Return only the category name, nothing else.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.1
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'Other';
  } catch (error) {
    console.error('Error categorizing search:', error);
    return 'Other';
  }
}

function buildSearchVariants(config: SearchConfig): string[] {
  const variants = [];
  
  // Primary search term
  const primary = `${config.brand} ${config.model}`;
  variants.push(primary);
  
  // With qualifiers
  if (config.qualifier) {
    variants.push(`${primary} ${config.qualifier}`);
  }
  if (config.sub_qualifier) {
    variants.push(`${primary} ${config.sub_qualifier}`);
  }
  if (config.qualifier && config.sub_qualifier) {
    variants.push(`${primary} ${config.qualifier} ${config.sub_qualifier}`);
  }
  
  // Brand only (for broader results)
  variants.push(config.brand);
  
  // Model only (for cross-brand results)
  variants.push(config.model);
  
  return variants;
}

async function scrapeSource(source: Source, searchVariants: string[], config: SearchConfig): Promise<ScrapedListing[]> {
  const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');
  const listings: ScrapedListing[] = [];
  
  if (!scraperApiKey) {
    throw new Error('SCRAPER_API_KEY not configured');
  }

  // Try structured search first, then fallback to keyword search
  for (const searchTerm of searchVariants.slice(0, 3)) { // Limit search variants
    try {
      // Try different URL patterns for searching
      const searchUrls = generateSearchUrls(source.url, searchTerm);
      
      for (const searchUrl of searchUrls.slice(0, 2)) { // Limit URL attempts
        try {
          const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}`;
          
          const response = await fetch(proxyUrl, {
            headers: {
              'User-Agent': getRandomUserAgent()
            }
          });
          
          if (!response.ok) continue;
          
          const html = await response.text();
          const sourceListings = parseGenericListings(html, source, searchTerm);
          
          if (sourceListings.length > 0) {
            listings.push(...sourceListings);
            break; // Found results, move to next search term
          }
          
        } catch (error) {
          console.error(`Error with search URL ${searchUrl}:`, error);
        }
      }
      
      // Rate limiting between search terms
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      console.error(`Error searching for "${searchTerm}" on ${source.name}:`, error);
    }
  }
  
  return listings;
}

function generateSearchUrls(baseUrl: string, searchTerm: string): string[] {
  const encodedTerm = encodeURIComponent(searchTerm);
  const urls = [];
  
  // Common search URL patterns
  const patterns = [
    `/search?q=${encodedTerm}`,
    `/search?query=${encodedTerm}`,
    `/classifieds/search?q=${encodedTerm}`,
    `/marketplace/search?q=${encodedTerm}`,
    `/for-sale?search=${encodedTerm}`,
    `/buy-sell?q=${encodedTerm}`,
    `?s=${encodedTerm}`,
    `/search.php?q=${encodedTerm}`
  ];
  
  for (const pattern of patterns) {
    urls.push(baseUrl.replace(/\/$/, '') + pattern);
  }
  
  return urls;
}

function parseGenericListings(html: string, source: Source, searchTerm: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  
  // Generic patterns for common listing structures
  const patterns = [
    // Pattern 1: Links with prices nearby
    {
      linkRegex: /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi,
      priceRegex: /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g
    },
    // Pattern 2: Structured listing blocks
    {
      blockRegex: /<div[^>]*class="[^"]*(?:listing|item|product|ad)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      titleRegex: /<(?:h[1-6]|span|div)[^>]*>([^<]+)<\/(?:h[1-6]|span|div)>/i,
      priceRegex: /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      linkRegex: /<a[^>]+href=["']([^"']+)["']/i
    }
  ];
  
  for (const pattern of patterns) {
    if (pattern.blockRegex) {
      // Block-based parsing
      let blockMatch;
      while ((blockMatch = pattern.blockRegex.exec(html)) !== null) {
        const block = blockMatch[1];
        
        const titleMatch = pattern.titleRegex?.exec(block);
        const priceMatch = pattern.priceRegex?.exec(block);
        const linkMatch = pattern.linkRegex?.exec(block);
        
        if (titleMatch && priceMatch && linkMatch) {
          const title = titleMatch[1].trim();
          const price = parseInt(priceMatch[1].replace(/,/g, ''));
          let url = linkMatch[1];
          
          // Make URL absolute if relative
          if (url.startsWith('/')) {
            const baseUrl = new URL(source.url);
            url = `${baseUrl.protocol}//${baseUrl.host}${url}`;
          }
          
          if (title && price > 0 && isRelevantListing(title, searchTerm)) {
            listings.push({
              title: title,
              price: price,
              location: source.name,
              url: url,
              source: source.name,
              tier: source.tier
            });
          }
        }
      }
    } else {
      // Link and price correlation parsing
      const links = [];
      const prices = [];
      
      let linkMatch;
      while ((linkMatch = pattern.linkRegex?.exec(html)) !== null) {
        links.push({ url: linkMatch[1], title: linkMatch[2] });
      }
      
      let priceMatch;
      while ((priceMatch = pattern.priceRegex?.exec(html)) !== null) {
        prices.push(parseInt(priceMatch[1].replace(/,/g, '')));
      }
      
      // Try to correlate links with prices
      const maxItems = Math.min(links.length, prices.length, 10); // Limit results
      for (let i = 0; i < maxItems; i++) {
        if (links[i] && prices[i] && isRelevantListing(links[i].title, searchTerm)) {
          let url = links[i].url;
          if (url.startsWith('/')) {
            const baseUrl = new URL(source.url);
            url = `${baseUrl.protocol}//${baseUrl.host}${url}`;
          }
          
          listings.push({
            title: links[i].title.trim(),
            price: prices[i],
            location: source.name,
            url: url,
            source: source.name,
            tier: source.tier
          });
        }
      }
    }
  }
  
  return listings.slice(0, 10); // Limit results per source
}

function isRelevantListing(title: string, searchTerm: string): boolean {
  const titleLower = title.toLowerCase();
  const searchLower = searchTerm.toLowerCase();
  const searchWords = searchLower.split(' ');
  
  // Check if at least 50% of search words appear in title
  const matchingWords = searchWords.filter(word => 
    word.length > 2 && titleLower.includes(word)
  ).length;
  
  return matchingWords >= Math.ceil(searchWords.length * 0.5);
}

function getRandomUserAgent(): string {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function updateSourceMetrics(supabaseClient: any, source: Source, success: boolean) {
  const tableName = source.tier === 2 ? 'secondary_sources' : 'tertiary_sources';
  
  await supabaseClient
    .from(tableName)
    .update({
      attempt_count: source.tier === 2 ? 
        supabaseClient.raw('attempt_count + 1') : 
        supabaseClient.raw('attempt_count + 1'),
      success_count: success ? 
        supabaseClient.raw('success_count + 1') : 
        supabaseClient.raw('success_count'),
      last_attempt_at: new Date().toISOString(),
      ...(success && { last_success_at: new Date().toISOString() })
    })
    .eq('id', source.id);
}

async function geocodeListings(listings: ScrapedListing[], config: SearchConfig): Promise<any[]> {
  const openCageKey = Deno.env.get('OPENCAGE_API_KEY');
  if (!openCageKey) {
    console.warn('OpenCage API key not configured, skipping geocoding');
    return listings.map(listing => ({ ...listing, distance: 0 }));
  }

  // Get user location
  let userLat = 39.7392; // Denver default
  let userLon = -104.9903;
  
  if (config.location) {
    try {
      const geoResponse = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(config.location)}&key=${openCageKey}`);
      const geoData = await geoResponse.json();
      if (geoData.results && geoData.results.length > 0) {
        userLat = geoData.results[0].geometry.lat;
        userLon = geoData.results[0].geometry.lng;
      }
    } catch (error) {
      console.error('User location geocoding failed:', error);
    }
  }

  return listings.map(listing => ({
    ...listing,
    distance: 0, // For extended sources, we'll set distance to 0 since they're often non-geographic
    latitude: null,
    longitude: null
  }));
}