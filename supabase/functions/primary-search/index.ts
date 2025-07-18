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

interface ScrapedListing {
  title: string;
  price: number;
  location: string;
  url: string;
  image_url?: string;
  posted_at?: string;
  source: string;
  tier: 1; // Primary sources are tier 1
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
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

    console.log(`Starting primary search for: ${searchConfig.brand} ${searchConfig.model}`);

    // Log scrape start
    const { data: logEntry } = await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'primary-search',
      p_search_config_id: searchConfigId,
      p_status: 'started',
      p_message: `Starting primary search for ${searchConfig.brand} ${searchConfig.model}`
    });

    const startTime = Date.now();
    const allListings: ScrapedListing[] = [];
    let sourcesProcessed = 0;

    // Build search terms
    const searchTerms = buildSearchTerms(searchConfig);
    console.log(`Search terms: ${searchTerms.join(', ')}`);

    // Scrape Facebook Marketplace
    try {
      const fbListings = await scrapeFacebookMarketplace(searchTerms, searchConfig);
      allListings.push(...fbListings);
      sourcesProcessed++;
      console.log(`Facebook Marketplace: Found ${fbListings.length} listings`);
    } catch (error) {
      console.error('Facebook Marketplace scraping failed:', error);
    }

    // Scrape Craigslist
    try {
      const clListings = await scrapeCraigslist(searchTerms, searchConfig);
      allListings.push(...clListings);
      sourcesProcessed++;
      console.log(`Craigslist: Found ${clListings.length} listings`);
    } catch (error) {
      console.error('Craigslist scraping failed:', error);
    }

    // Scrape eBay
    try {
      const ebayListings = await scrapeEbay(searchTerms, searchConfig);
      allListings.push(...ebayListings);
      sourcesProcessed++;
      console.log(`eBay: Found ${ebayListings.length} listings`);
    } catch (error) {
      console.error('eBay scraping failed:', error);
    }

    // Filter listings by price range
    const maxPrice = Math.round(searchConfig.price_threshold * searchConfig.price_multiplier);
    const filteredListings = allListings.filter(listing => 
      listing.price >= 0 && listing.price <= maxPrice
    );

    console.log(`Filtered ${allListings.length} listings to ${filteredListings.length} within price range`);

    // Geocode and calculate distances
    const geocodedListings = await geocodeListings(filteredListings, searchConfig);
    
    // Save listings to database
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
      p_module_name: 'primary-search',
      p_search_config_id: searchConfigId,
      p_status: 'success',
      p_message: `Found ${savedCount} new listings from ${sourcesProcessed} sources`,
      p_listings_found: savedCount,
      p_sources_processed: sourcesProcessed,
      p_execution_time_ms: executionTime,
      p_metadata: {
        search_terms: searchTerms,
        total_scraped: allListings.length,
        price_filtered: filteredListings.length,
        max_price: maxPrice
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        listings_found: savedCount,
        sources_processed: sourcesProcessed,
        execution_time_ms: executionTime
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Primary search error:', error);
    
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

function buildSearchTerms(config: SearchConfig): string[] {
  const terms = [];
  
  // Primary term
  const primary = `${config.brand} ${config.model}`;
  terms.push(primary);
  
  // With qualifier
  if (config.qualifier) {
    terms.push(`${primary} ${config.qualifier}`);
    if (config.sub_qualifier) {
      terms.push(`${primary} ${config.qualifier} ${config.sub_qualifier}`);
    }
  }
  
  // With sub-qualifier only
  if (config.sub_qualifier && !config.qualifier) {
    terms.push(`${primary} ${config.sub_qualifier}`);
  }
  
  return terms;
}

async function scrapeFacebookMarketplace(searchTerms: string[], config: SearchConfig): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');
  
  if (!scraperApiKey) {
    throw new Error('SCRAPER_API_KEY not configured');
  }

  for (const term of searchTerms.slice(0, 2)) { // Limit to avoid rate limits
    const searchUrl = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(term)}`;
    const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}`;
    
    try {
      const response = await fetch(proxyUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      
      // Parse Facebook Marketplace listings (simplified parsing)
      const fbListings = parseFacebookMarketplace(html, term);
      listings.push(...fbListings);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Facebook scraping error for "${term}":`, error);
    }
  }
  
  return listings;
}

async function scrapeCraigslist(searchTerms: string[], config: SearchConfig): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');
  
  if (!scraperApiKey) {
    throw new Error('SCRAPER_API_KEY not configured');
  }

  // Regional Craigslist domains
  const regions = ['denver', 'boulder', 'fortcollins', 'pueblo'];
  
  for (const region of regions) {
    for (const term of searchTerms.slice(0, 2)) {
      const searchUrl = `https://${region}.craigslist.org/search/sss?query=${encodeURIComponent(term)}`;
      const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}`;
      
      try {
        const response = await fetch(proxyUrl);
        if (!response.ok) continue;
        
        const html = await response.text();
        const clListings = parseCraigslist(html, `Craigslist ${region}`);
        listings.push(...clListings);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`Craigslist scraping error for ${region}:`, error);
      }
    }
  }
  
  return listings;
}

async function scrapeEbay(searchTerms: string[], config: SearchConfig): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');
  
  if (!scraperApiKey) {
    throw new Error('SCRAPER_API_KEY not configured');
  }

  for (const term of searchTerms.slice(0, 2)) {
    const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(term)}&LH_BIN=1&_sop=10`;
    const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}`;
    
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;
      
      const html = await response.text();
      const ebayListings = parseEbay(html);
      listings.push(...ebayListings);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`eBay scraping error for "${term}":`, error);
    }
  }
  
  return listings;
}

function parseFacebookMarketplace(html: string, searchTerm: string): ScrapedListing[] {
  // Simplified parsing - in production, use proper DOM parsing
  const listings: ScrapedListing[] = [];
  
  // Basic regex patterns for Facebook Marketplace
  const titleRegex = /"marketplace_listing_title":"([^"]+)"/g;
  const priceRegex = /"formatted_price":"([^"]+)"/g;
  const locationRegex = /"marketplace_listing_location":"([^"]+)"/g;
  
  let match;
  const titles = [];
  const prices = [];
  const locations = [];
  
  while ((match = titleRegex.exec(html)) !== null) {
    titles.push(match[1]);
  }
  
  while ((match = priceRegex.exec(html)) !== null) {
    const priceStr = match[1].replace(/[^\d]/g, '');
    prices.push(parseInt(priceStr) || 0);
  }
  
  while ((match = locationRegex.exec(html)) !== null) {
    locations.push(match[1]);
  }
  
  const maxItems = Math.min(titles.length, prices.length, locations.length);
  for (let i = 0; i < maxItems; i++) {
    if (titles[i] && prices[i] > 0) {
      listings.push({
        title: titles[i],
        price: prices[i],
        location: locations[i] || 'Facebook Marketplace',
        url: `https://facebook.com/marketplace/item/${Date.now()}_${i}`,
        source: 'Facebook Marketplace',
        tier: 1
      });
    }
  }
  
  return listings;
}

function parseCraigslist(html: string, source: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  
  // Simplified Craigslist parsing
  const listingRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*result-title[^"]*"[^>]*>([^<]+)<\/a>/g;
  const priceRegex = /<span class="result-price">([^<]+)<\/span>/g;
  
  let match;
  const urls = [];
  const titles = [];
  const prices = [];
  
  while ((match = listingRegex.exec(html)) !== null) {
    urls.push(match[1]);
    titles.push(match[2]);
  }
  
  while ((match = priceRegex.exec(html)) !== null) {
    const priceStr = match[1].replace(/[^\d]/g, '');
    prices.push(parseInt(priceStr) || 0);
  }
  
  const maxItems = Math.min(urls.length, titles.length, prices.length);
  for (let i = 0; i < maxItems; i++) {
    if (titles[i] && prices[i] > 0) {
      listings.push({
        title: titles[i].trim(),
        price: prices[i],
        location: source.replace('Craigslist ', '') + ', CO',
        url: urls[i].startsWith('http') ? urls[i] : `https://craigslist.org${urls[i]}`,
        source: source,
        tier: 1
      });
    }
  }
  
  return listings;
}

function parseEbay(html: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  
  // Simplified eBay parsing
  const listingRegex = /<div class="s-item__wrapper[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<span class="notranslate">([^<]+)<\/span>/g;
  
  let match;
  while ((match = listingRegex.exec(html)) !== null) {
    const url = match[1];
    const title = match[2];
    const priceStr = match[3].replace(/[^\d]/g, '');
    const price = parseInt(priceStr) || 0;
    
    if (title && price > 0) {
      listings.push({
        title: title.trim(),
        price: price,
        location: 'eBay',
        url: url,
        source: 'eBay',
        tier: 1
      });
    }
  }
  
  return listings;
}

async function geocodeListings(listings: ScrapedListing[], config: SearchConfig): Promise<any[]> {
  const openCageKey = Deno.env.get('OPENCAGE_API_KEY');
  if (!openCageKey) {
    console.warn('OpenCage API key not configured, skipping geocoding');
    return listings.map(listing => ({ ...listing, distance: 0 }));
  }

  // Get user location for distance calculation
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

  const geocodedListings = [];
  
  for (const listing of listings) {
    let distance = 0;
    let latitude = null;
    let longitude = null;
    
    // Skip geocoding for generic locations
    if (!listing.location || listing.location === 'eBay' || listing.location === 'Facebook Marketplace') {
      geocodedListings.push({ ...listing, distance, latitude, longitude });
      continue;
    }
    
    try {
      const geoResponse = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(listing.location)}&key=${openCageKey}`);
      const geoData = await geoResponse.json();
      
      if (geoData.results && geoData.results.length > 0) {
        latitude = geoData.results[0].geometry.lat;
        longitude = geoData.results[0].geometry.lng;
        
        // Calculate distance using Haversine formula
        distance = calculateDistance(userLat, userLon, latitude, longitude);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit
    } catch (error) {
      console.error(`Geocoding failed for ${listing.location}:`, error);
    }
    
    geocodedListings.push({ ...listing, distance, latitude, longitude });
  }
  
  return geocodedListings;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}