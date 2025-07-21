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
  const listings: ScrapedListing[] = [];
  
  try {
    // Modern Facebook Marketplace patterns - they use data attributes and class names
    const listingPatterns = [
      // Pattern 1: Look for listing containers with data attributes
      /<div[^>]*data-testid="marketplace-item"[^>]*>[\s\S]*?<span[^>]*>\$?([\d,]+)[^<]*<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<\/div>/gi,
      // Pattern 2: Alternative structure with price and title
      /<a[^>]*href="[^"]*\/marketplace\/item\/([^"\/]+)"[^>]*>[\s\S]*?<span[^>]*>\$?([\d,]+)[^<]*<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<\/a>/gi,
      // Pattern 3: JSON-LD structured data if present
      /"price":\s*"?\$?([\d,]+)"?[\s\S]*?"name":\s*"([^"]+)"/gi
    ];

    for (const pattern of listingPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && listings.length < 20) {
        let price, title, itemId;
        
        if (match.length === 4) {
          // Pattern 1 or 3
          price = parseInt(match[1].replace(/[^\d]/g, '')) || 0;
          title = match[2];
          itemId = match[3] || Date.now() + '_' + listings.length;
        } else if (match.length === 3) {
          // Pattern 2
          itemId = match[1];
          price = parseInt(match[2].replace(/[^\d]/g, '')) || 0;
          title = match[3];
        }

        if (title && price > 0 && title.toLowerCase().includes(searchTerm.toLowerCase().split(' ')[0])) {
          listings.push({
            title: title.trim(),
            price: price,
            location: 'Facebook Marketplace',
            url: `https://www.facebook.com/marketplace/item/${itemId}`,
            source: 'Facebook Marketplace',
            tier: 1
          });
        }
      }
    }

    // Fallback: Look for any price and title patterns in the HTML
    if (listings.length === 0) {
      const fallbackPriceRegex = /\$\s*([\d,]+)/g;
      const fallbackTitleRegex = /<span[^>]*>([^<]*(?:sony|canon|nikon|camera|lens)[^<]*)<\/span>/gi;
      
      const prices = [];
      const titles = [];
      
      let priceMatch;
      while ((priceMatch = fallbackPriceRegex.exec(html)) !== null) {
        const price = parseInt(priceMatch[1].replace(/[^\d]/g, ''));
        if (price > 10 && price < 50000) prices.push(price);
      }
      
      let titleMatch;
      while ((titleMatch = fallbackTitleRegex.exec(html)) !== null) {
        if (titleMatch[1].length > 5) titles.push(titleMatch[1]);
      }
      
      const maxItems = Math.min(titles.length, prices.length, 5);
      for (let i = 0; i < maxItems; i++) {
        listings.push({
          title: titles[i].trim(),
          price: prices[i],
          location: 'Facebook Marketplace',
          url: `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(searchTerm)}`,
          source: 'Facebook Marketplace',
          tier: 1
        });
      }
    }
  } catch (error) {
    console.error('Facebook parsing error:', error);
  }
  
  return listings;
}

function parseCraigslist(html: string, source: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  
  try {
    // Modern Craigslist patterns - they've updated their HTML structure
    const listingPatterns = [
      // Pattern 1: New gallery view structure
      /<li[^>]*class="[^"]*cl-search-result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*price[^"]*"[^>]*>\$?([\d,]+)[^<]*<\/span>[\s\S]*?<span[^>]*class="[^"]*label[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<\/li>/gi,
      // Pattern 2: List view structure
      /<div[^>]*class="[^"]*result-info[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*class="[^"]*hdrlnk[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*class="[^"]*price[^"]*"[^>]*>\$?([\d,]+)[^<]*<\/span>/gi,
      // Pattern 3: Fallback for older structure
      /<a[^>]+href="([^"]+)"[^>]*class="[^"]*result-title[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*class="[^"]*result-price[^"]*"[^>]*>\$?([\d,]+)[^<]*<\/span>/gi
    ];

    for (const pattern of listingPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && listings.length < 20) {
        let url, title, price;
        
        if (pattern === listingPatterns[0]) {
          // Pattern 1: url, price, title
          url = match[1];
          price = parseInt(match[2].replace(/[^\d]/g, '')) || 0;
          title = match[3];
        } else {
          // Pattern 2 & 3: url, title, price
          url = match[1];
          title = match[2];
          price = parseInt(match[3].replace(/[^\d]/g, '')) || 0;
        }

        if (title && price > 0 && title.length > 3) {
          listings.push({
            title: title.trim(),
            price: price,
            location: source.replace('Craigslist ', '') + ', CO',
            url: url.startsWith('http') ? url : `https://craigslist.org${url}`,
            source: source,
            tier: 1
          });
        }
      }
      
      if (listings.length > 0) break; // Found results with this pattern
    }

    // Enhanced fallback parsing if no results
    if (listings.length === 0) {
      const priceRegex = /\$\s*([\d,]+)/g;
      const titleRegex = /<span[^>]*>([^<]{10,100})<\/span>/g;
      const urlRegex = /<a[^>]*href="([^"]*\/[^"]*\.html)"[^>]*>/g;
      
      const prices = [];
      const titles = [];
      const urls = [];
      
      let match;
      while ((match = priceRegex.exec(html)) !== null) {
        const price = parseInt(match[1].replace(/[^\d]/g, ''));
        if (price > 10 && price < 50000) prices.push(price);
      }
      
      while ((match = titleRegex.exec(html)) !== null) {
        if (match[1] && match[1].length > 10) titles.push(match[1]);
      }
      
      while ((match = urlRegex.exec(html)) !== null) {
        urls.push(match[1]);
      }
      
      const maxItems = Math.min(titles.length, prices.length, urls.length, 3);
      for (let i = 0; i < maxItems; i++) {
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
  } catch (error) {
    console.error('Craigslist parsing error:', error);
  }
  
  return listings;
}

function parseEbay(html: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  
  try {
    // Modern eBay patterns - they use different structures now
    const listingPatterns = [
      // Pattern 1: Search results with s-item class
      /<div[^>]*class="[^"]*s-item__wrapper[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>\$?([\d,]+\.?\d*)[^<]*<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi,
      // Pattern 2: Alternative item structure
      /<div[^>]*class="[^"]*item[^"]*"[^>]*>[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*class="[^"]*price[^"]*"[^>]*>\$?([\d,]+\.?\d*)[^<]*<\/span>/gi,
      // Pattern 3: JSON-LD structured data
      /"url":"([^"]+)"[\s\S]*?"name":"([^"]+)"[\s\S]*?"price":"?([\d,]+\.?\d*)"?/gi
    ];

    for (const pattern of listingPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && listings.length < 20) {
        let url, title, price;
        
        if (pattern === listingPatterns[0]) {
          // Pattern 1: url, price, title
          url = match[1];
          price = parseFloat(match[2].replace(/[^\d.]/g, '')) || 0;
          title = match[3];
        } else if (pattern === listingPatterns[1]) {
          // Pattern 2: url, title, price
          url = match[1];
          title = match[2];
          price = parseFloat(match[3].replace(/[^\d.]/g, '')) || 0;
        } else {
          // Pattern 3: JSON-LD
          url = match[1];
          title = match[2];
          price = parseFloat(match[3].replace(/[^\d.]/g, '')) || 0;
        }

        if (title && price > 0 && title.length > 5) {
          listings.push({
            title: title.trim(),
            price: Math.round(price),
            location: 'eBay',
            url: url.startsWith('http') ? url : `https://ebay.com${url}`,
            source: 'eBay',
            tier: 1
          });
        }
      }
      
      if (listings.length > 0) break; // Found results with this pattern
    }

    // Enhanced fallback for eBay
    if (listings.length === 0) {
      // Look for any item links and prices
      const itemLinkRegex = /<a[^>]*href="([^"]*\/itm\/[^"]*)"[^>]*>([^<]+)<\/a>/gi;
      const priceRegex = /\$\s*([\d,]+(?:\.\d{2})?)/g;
      
      const itemData = [];
      const prices = [];
      
      let linkMatch;
      while ((linkMatch = itemLinkRegex.exec(html)) !== null) {
        itemData.push({ url: linkMatch[1], title: linkMatch[2] });
      }
      
      let priceMatch;
      while ((priceMatch = priceRegex.exec(html)) !== null) {
        const price = parseFloat(priceMatch[1].replace(/[^\d.]/g, ''));
        if (price > 1 && price < 50000) prices.push(Math.round(price));
      }
      
      const maxItems = Math.min(itemData.length, prices.length, 5);
      for (let i = 0; i < maxItems; i++) {
        if (itemData[i] && prices[i]) {
          listings.push({
            title: itemData[i].title.trim(),
            price: prices[i],
            location: 'eBay',
            url: itemData[i].url.startsWith('http') ? itemData[i].url : `https://ebay.com${itemData[i].url}`,
            source: 'eBay',
            tier: 1
          });
        }
      }
    }
  } catch (error) {
    console.error('eBay parsing error:', error);
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