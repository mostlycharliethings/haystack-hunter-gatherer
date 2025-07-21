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
    
    if (!searchConfigId) {
      throw new Error('searchConfigId is required - extended-search processes one SearchSpec at a time');
    }
    
    // Get search configuration - EXPLICIT: processes one SearchSpec per invocation
    const { data: searchConfig, error: configError } = await supabaseClient
      .from('search_configs')
      .select('*')
      .eq('id', searchConfigId)
      .eq('is_active', true)
      .single();

    if (configError || !searchConfig) {
      throw new Error(`Active search config not found: ${configError?.message}`);
    }

    console.log(`Starting extended search for SearchSpec: ${searchConfig.brand} ${searchConfig.model} (${searchConfigId})`);

    // Log scrape start
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'extended-search',
      p_search_config_id: searchConfigId,
      p_status: 'started',
      p_message: `Starting extended search for SearchSpec: ${searchConfig.brand} ${searchConfig.model}`
    });

    const startTime = Date.now();
    let totalListings: ScrapedListing[] = [];
    let totalSourcesProcessed = 0;

    // Categorize search for source filtering
    const category = await categorizeSearch(searchConfig);
    console.log(`Categorized as: ${category}`);

    // Get secondary sources (tier 2) scoped to this specific SearchSpec - ONLY SEARCHABLE ONES
    const { data: secondarySources } = await supabaseClient
      .from('secondary_sources')
      .select('*')
      .eq('search_config_id', searchConfigId)
      .eq('searchable', true)
      .order('relevance_score', { ascending: false });

    // Get tertiary sources (tier 3) GLOBALLY - ONLY SEARCHABLE ONES
    const { data: tertiarySources } = await supabaseClient
      .from('tertiary_sources')
      .select('*')
      .eq('searchable', true)
      .order('relevance_score', { ascending: false });

    // Transform sources to match expected format
    const allSources: Source[] = [
      ...(secondarySources || []).map((s: any) => ({
        id: s.id,
        url: s.url,
        name: s.source,
        tier: 2,
        success_rate: s.relevance_score || 0.5,
        is_active: true
      })),
      ...(tertiarySources || []).map((s: any) => ({
        id: s.id,
        url: s.url,
        name: s.source,
        tier: 3,
        success_rate: s.relevance_score || 0.3,
        is_active: true
      }))
    ];

    console.log(`Found ${allSources.length} sources to scrape (${secondarySources?.length || 0} secondary, ${tertiarySources?.length || 0} tertiary)`);

    // Build search variants
    const searchVariants = buildSearchVariants(searchConfig);
    console.log(`Built ${searchVariants.length} search variants`);

    // Scrape each searchable source
    const searchableSources = allSources.filter(s => s.success_rate > 0);
    console.log(`Found ${searchableSources.length} searchable sources out of ${allSources.length} total`);
    
    for (const source of searchableSources.slice(0, 15)) { // Limit for performance
      try {
        console.log(`Scraping ${source.name} (tier ${source.tier})`);
        
        const sourceListings = await scrapeSource(source, searchVariants, searchConfig, supabaseClient);
        
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
        console.log(`💾 Saving listing: ${listing.title} - $${listing.price} from ${listing.source}`);
        
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
            posted_at: listing.posted_at || new Date().toISOString(),
            latitude: listing.latitude,
            longitude: listing.longitude
          }, { 
            onConflict: 'url',
            ignoreDuplicates: false  // Changed to see what's happening
          });

        if (error) {
          console.error('❌ Error saving listing:', error);
        } else {
          savedCount++;
          console.log(`✅ Saved listing ${savedCount}: ${listing.title}`);
        }
      } catch (error) {
        console.error('❌ Exception saving listing:', error);
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

async function scrapeSource(source: Source, searchVariants: string[], config: SearchConfig, supabaseClient: any): Promise<ScrapedListing[]> {
  const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');
  const listings: ScrapedListing[] = [];
  
  if (!scraperApiKey) {
    const error = `No SCRAPER_API_KEY configured, cannot scrape ${source.name}`;
    console.error(error);
    await logSourceFailure(supabaseClient, config.id, source, 'SCRAPER_API_KEY not configured');
    throw new Error('SCRAPER_API_KEY not configured for web scraping');
  }

  // Check if source is marked as searchable in database
  const sourceIsSearchable = source.searchable !== false; // Default to true if not set
  
  if (!sourceIsSearchable) {
    const message = `Source ${source.name} is marked as non-searchable - skipping`;
    console.log(`⏭️  ${message}`);
    await logSourceFailure(supabaseClient, config.id, source, 'Source marked as non-searchable');
    return [];
  }

  // DYNAMIC URL BUILDING: Try to generate search URLs using SearchSpec fields
  const baseUrl = source.url;
  let searchUrls: string[] = [];
  
  // Use hardcoded search URL templates for known sites
  const knownSearchUrl = getKnownSearchUrl(baseUrl, searchVariants[0]);
  if (knownSearchUrl) {
    searchUrls = [knownSearchUrl];
    console.log(`✅ Using known search pattern for ${source.name}: ${knownSearchUrl}`);
  } else {
    // Test if source supports dynamic search URLs
    const testSearchUrls = generateSearchUrls(baseUrl, searchVariants[0]);
    let useDynamicUrls = false;
  
    try {
      // Test first search URL pattern to see if source supports it
      const testUrl = testSearchUrls[0];
      const testProxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(testUrl)}`;
      const testResponse = await fetch(testProxyUrl, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (testResponse.ok) {
        useDynamicUrls = true;
        searchUrls = testSearchUrls.slice(0, 2); // Use top 2 patterns only
        console.log(`✅ ${source.name} supports dynamic search URLs`);
      } else {
        console.log(`❌ ${source.name} doesn't support dynamic search (HTTP ${testResponse.status}), skipping`);
        await logSourceFailure(supabaseClient, config.id, source, `Dynamic search test failed: HTTP ${testResponse.status}`);
        return [];
      }
    } catch (error) {
      console.log(`❌ ${source.name} dynamic URL test failed, skipping:`, error.message);
      await logSourceFailure(supabaseClient, config.id, source, `Dynamic search test error: ${error.message}`);
      return [];
    }
  }

  // If source doesn't support search, skip it entirely
  if (!useDynamicUrls) {
    const message = `Source ${source.name} doesn't support search URLs - skipping`;
    console.log(`⏭️  ${message}`);
    await logSourceFailure(supabaseClient, config.id, source, 'Source marked as non-searchable or failed URL test');
    return [];
  }

  // Scrape each search URL
  for (const searchUrl of searchUrls) {
    try {
      console.log(`🔍 Scraping ${source.name} at ${searchUrl} (tier ${source.tier})`);
      
      const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}`;
      
      const response = await fetch(proxyUrl, {
        headers: {
          'User-Agent': getRandomUserAgent()
        }
      });
      
      if (!response.ok) {
        const message = `HTTP ${response.status} for ${source.name} at ${searchUrl}`;
        console.error(`❌ ${message}`);
        await logSourceFailure(supabaseClient, config.id, source, message);
        continue; // Try next URL pattern
      }
      
      const html = await response.text();
      const searchTerm = useDynamicUrls ? searchVariants[0] : 'generic';
      const sourceListings = parseGenericListings(html, source, searchTerm);
      
      if (sourceListings.length > 0) {
        console.log(`✅ Found ${sourceListings.length} listings from ${source.name}`);
        listings.push(...sourceListings);
        break; // Success, no need to try other URL patterns
      } else {
        console.log(`📭 No listings found from ${source.name} at ${searchUrl}`);
      }
      
    } catch (error) {
      const message = `Scraping error for ${source.name}: ${error.message}`;
      console.error(`❌ ${message}`);
      await logSourceFailure(supabaseClient, config.id, source, message);
    }
  }
  
  return listings;
}

async function logSourceFailure(supabaseClient: any, searchConfigId: string, source: Source, reason: string) {
  try {
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'extended-search',
      p_search_config_id: searchConfigId,
      p_status: 'source_failed',
      p_message: `Source ${source.name} (tier ${source.tier}) failed: ${reason}`,
      p_metadata: {
        source_id: source.id,
        source_name: source.name,
        source_url: source.url,
        source_tier: source.tier,
        failure_reason: reason
      }
    });
  } catch (error) {
    console.error('Failed to log source failure:', error);
  }
}

function getKnownSearchUrl(baseUrl: string, searchTerm: string): string | null {
  const encodedTerm = encodeURIComponent(searchTerm);
  
  // Known working search URL patterns
  if (baseUrl.includes('reverb.com')) {
    return `https://reverb.com/marketplace?query=${encodedTerm}`;
  } else if (baseUrl.includes('bhphotovideo.com')) {
    return `https://www.bhphotovideo.com/c/search?Ntt=${encodedTerm}`;
  } else if (baseUrl.includes('adorama.com')) {
    return `https://www.adorama.com/l/Used-Equipment?searchinfo=${encodedTerm}`;
  } else if (baseUrl.includes('keh.com')) {
    return `https://www.keh.com/shop/?s=${encodedTerm}`;
  } else if (baseUrl.includes('ebay.com')) {
    return `https://www.ebay.com/sch/i.html?_nkw=${encodedTerm}`;
  } else if (baseUrl.includes('amazon.com')) {
    return `https://www.amazon.com/s?k=${encodedTerm}`;
  }
  
  return null; // No known pattern, will use generic testing
}

function generateSearchUrls(baseUrl: string, searchTerm: string): string[] {
  const encodedTerm = encodeURIComponent(searchTerm);
  const urls = [];
  
  // Conservative fallback patterns for unknown sites
  const patterns = [
    `/search?q=${encodedTerm}`,
    `/search?query=${encodedTerm}`,
    `?s=${encodedTerm}`
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
  // Since we're reading from secondary_sources and tertiary_sources tables,
  // we can update the relevance_score based on success/failure
  const tableName = source.tier === 2 ? 'secondary_sources' : 'tertiary_sources';
  
  try {
    // Get current relevance score
    const { data: currentData } = await supabaseClient
      .from(tableName)
      .select('relevance_score')
      .eq('id', source.id)
      .single();
    
    if (currentData) {
      const currentScore = currentData.relevance_score || 0.5;
      // Adjust score based on success (+0.1) or failure (-0.05)
      const newScore = Math.max(0.1, Math.min(1.0, 
        currentScore + (success ? 0.1 : -0.05)
      ));
      
      await supabaseClient
        .from(tableName)
        .update({ relevance_score: newScore })
        .eq('id', source.id);
        
      console.log(`Updated ${source.name} relevance score: ${currentScore} -> ${newScore}`);
    }
  } catch (error) {
    console.error(`Error updating source metrics for ${source.name}:`, error);
  }
}

async function geocodeListings(listings: ScrapedListing[], config: SearchConfig): Promise<any[]> {
  const apiKey = Deno.env.get('OPENCAGE_API_KEY');
  if (!apiKey) {
    console.warn('No OpenCage API key available for geocoding');
    return listings.map(listing => ({ ...listing, distance: null }));
  }

  // Get user's location coordinates first
  let userLat: number | null = null;
  let userLon: number | null = null;
  
  if (config.location) {
    try {
      const userLocationUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(config.location)}&key=${apiKey}&limit=1`;
      const userResponse = await fetch(userLocationUrl);
      const userData = await userResponse.json();
      
      if (userData.results && userData.results.length > 0) {
        userLat = userData.results[0].geometry.lat;
        userLon = userData.results[0].geometry.lng;
        console.log(`User location: ${config.location} -> ${userLat}, ${userLon}`);
      }
    } catch (error) {
      console.error('Error geocoding user location:', error);
    }
  }

  const geocodedListings = [];
  
  for (const listing of listings.slice(0, 50)) { // Limit to avoid API quota issues
    try {
      let distance = null;
      let latitude = null;
      let longitude = null;
      
      if (listing.location && listing.location !== 'Unknown Location') {
        const geocodeUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(listing.location)}&key=${apiKey}&limit=1`;
        
        const response = await fetch(geocodeUrl);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          latitude = data.results[0].geometry.lat;
          longitude = data.results[0].geometry.lng;
          
          // Calculate distance if we have user coordinates
          if (userLat !== null && userLon !== null) {
            distance = haversine(userLat, userLon, latitude, longitude);
          }
        }
        
        // Rate limiting for geocoding API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      geocodedListings.push({
        ...listing,
        latitude,
        longitude,
        distance
      });
      
    } catch (error) {
      console.error(`Error geocoding listing: ${listing.location}`, error);
      geocodedListings.push({
        ...listing,
        latitude: null,
        longitude: null,
        distance: null
      });
    }
  }
  
  return geocodedListings;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in miles
}