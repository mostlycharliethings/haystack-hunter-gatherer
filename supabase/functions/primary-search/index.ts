import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

interface SearchConfig {
  id: string;
  brand: string;
  model: string;
  qualifier?: string;
  sub_qualifier?: string;
  price_threshold: number;
  price_multiplier: number;
  location?: string;
}

interface ScrapedListing {
  title: string;
  price: number;
  location: string;
  url: string;
  source: string;
  tier: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { searchConfigId } = await req.json();
    if (!searchConfigId) throw new Error("searchConfigId is required");

    const { data: config, error } = await supabase
      .from("search_configs")
      .select("*")
      .eq("id", searchConfigId)
      .single();

    if (error || !config) throw new Error("SearchConfig not found");

    const terms = buildSearchTerms(config);
    const results = [];

    const startTime = Date.now();
    const maxPrice = Math.max(1, config.price_threshold * config.price_multiplier);

    // Real scrapers
    const fbResults = await scrapeFacebookMarketplace(terms, config);
    const clResults = await scrapeCraigslist(terms, config);
    const ebResults = await scrapeEbay(terms, config);
    results.push(...fbResults, ...clResults, ...ebResults);

    const filtered = results.filter(r => r.price >= 1 && r.price <= maxPrice);
    const withGeo = await geocode(filtered, config.location);

    let savedCount = 0;
    for (const listing of withGeo) {
      const { error } = await supabase.from("listings").upsert({
        search_config_id: searchConfigId,
        title: listing.title,
        price: listing.price,
        location: listing.location,
        distance: listing.distance,
        latitude: listing.latitude,
        longitude: listing.longitude,
        source: listing.source,
        tier: listing.tier,
        url: listing.url
      }, { onConflict: 'url', ignoreDuplicates: true });

      if (!error) savedCount++;
    }

    await supabase.rpc('log_scrape_activity', {
      p_module_name: 'primary-search',
      p_search_config_id: searchConfigId,
      p_status: 'success',
      p_message: `Scraped ${savedCount} listings`,
      p_listings_found: savedCount,
      p_sources_processed: 3,
      p_execution_time_ms: Date.now() - startTime,
      p_metadata: {
        terms,
        threshold: config.price_threshold,
        maxPrice
      }
    });

    return new Response(JSON.stringify({ success: true, savedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (e) {
    console.error("Primary search error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

function buildSearchTerms(config) {
  const terms = [`${config.brand} ${config.model}`];
  if (config.qualifier) terms.push(`${config.brand} ${config.model} ${config.qualifier}`);
  if (config.sub_qualifier) terms.push(`${config.brand} ${config.model} ${config.sub_qualifier}`);
  return terms;
}

async function fakeScraper(source, terms) {
  return terms.map((term, i) => ({
    title: `${term} Listing ${i}`,
    price: 100 + i * 50,
    location: `${source}`,
    url: `https://${source.toLowerCase()}.com/item/${term.replace(/\s+/g, '-')}`,
    source,
    tier: 1
  }));
}

async function geocode(listings, userLocation) {
  const key = Deno.env.get('OPENCAGE_API_KEY');
  let userLat = 39.7392, userLon = -104.9903;

  if (userLocation) {
    try {
      const res = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(userLocation)}&key=${key}`);
      const geo = await res.json();
      if (geo.results?.length) {
        userLat = geo.results[0].geometry.lat;
        userLon = geo.results[0].geometry.lng;
      }
    } catch { }
  }

  return listings.map(l => {
    if (!l.location || ["eBay", "Facebook", "Facebook Marketplace"].includes(l.location)) {
      return { ...l, latitude: null, longitude: null, distance: 0 };
    }
    // Simulate valid coordinates
    const lat = 39.7392 + Math.random() * 0.5;
    const lon = -104.9903 + Math.random() * 0.5;
    return {
      ...l,
      latitude: lat,
      longitude: lon,
      distance: haversine(userLat, userLon, lat, lon)
    };
  });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function scrapeCraigslist(searchTerms: string[], config: SearchConfig): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');

  if (!scraperApiKey) {
    throw new Error('SCRAPER_API_KEY not configured');
  }

  const regions = ['denver', 'boulder', 'fortcollins', 'pueblo'];

  for (const region of regions) {
    for (const term of searchTerms.slice(0, 2)) {
      const searchUrl = `https://${region}.craigslist.org/search/sss?query=${encodeURIComponent(term)}`;
      const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}`;

      try {
        const response = await fetch(proxyUrl);
        const html = await response.text();

        // Debug output:
        console.log(`--- RAW HTML from Craigslist [${region}] for term "${term}" ---`);
        console.log(html.slice(0, 1000)); // Show first 1000 chars

        if (!response.ok) {
          console.error(`Non-OK response for ${region}: ${response.status}`);
          continue;
        }

        const clListings = parseCraigslist(html, `Craigslist ${region}`);
        if (clListings.length === 0) {
          console.warn(`❌ No listings parsed for ${region} - possible HTML mismatch`);
        } else {
          console.log(`✅ ${clListings.length} listings parsed for ${region}`);
        }

        listings.push(...clListings);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`Craigslist scraping error for ${region}:`, error);
      }
    }
  }

  
  return listings;
}

async function scrapeFacebookMarketplace(searchTerms: string[], config: SearchConfig): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');

  if (!scraperApiKey) {
    throw new Error('SCRAPER_API_KEY not configured');
  }

  const location = config.location || 'denver';
  
  for (const term of searchTerms.slice(0, 2)) {
    const searchUrl = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(term)}`;
    const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}`;

    try {
      const response = await fetch(proxyUrl);
      const html = await response.text();

      // Debug output:
      console.log(`--- RAW HTML from Facebook Marketplace for term "${term}" ---`);
      console.log(html.slice(0, 1000)); // Show first 1000 chars

      if (!response.ok) {
        console.error(`Non-OK response from Facebook: ${response.status}`);
        continue;
      }

      const fbListings = parseFacebookMarketplace(html, 'Facebook Marketplace');
      if (fbListings.length === 0) {
        console.warn(`❌ No listings parsed from Facebook - possible HTML mismatch`);
      } else {
        console.log(`✅ ${fbListings.length} listings parsed from Facebook`);
      }

      listings.push(...fbListings);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Longer delay for Facebook
    } catch (error) {
      console.error(`Facebook Marketplace scraping error:`, error);
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
    const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(term)}&_sacat=0&LH_Sold=1&LH_Complete=1`;
    const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(searchUrl)}`;

    try {
      const response = await fetch(proxyUrl);
      const html = await response.text();

      // Debug output:
      console.log(`--- RAW HTML from eBay for term "${term}" ---`);
      console.log(html.slice(0, 1000)); // Show first 1000 chars

      if (!response.ok) {
        console.error(`Non-OK response from eBay: ${response.status}`);
        continue;
      }

      const ebayListings = parseEbay(html, 'eBay');
      if (ebayListings.length === 0) {
        console.warn(`❌ No listings parsed from eBay - possible HTML mismatch`);
      } else {
        console.log(`✅ ${ebayListings.length} listings parsed from eBay`);
      }

      listings.push(...ebayListings);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      console.error(`eBay scraping error:`, error);
    }
  }

  return listings;
}

function parseFacebookMarketplace(html: string, source: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  console.log(`🔍 Starting Facebook Marketplace parsing for ${source}`);
  
  try {
    // Strategy 1: JSON-LD structured data
    const jsonLdMatches = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs);
    if (jsonLdMatches) {
      console.log(`📄 Found ${jsonLdMatches.length} JSON-LD scripts in Facebook HTML`);
      for (const jsonScript of jsonLdMatches) {
        try {
          const jsonContent = jsonScript.replace(/<script[^>]*>|<\/script>/g, '');
          const data = JSON.parse(jsonContent);
          if (data['@type'] === 'Product' || data.offers) {
            const title = data.name || data.headline || 'Facebook Marketplace Listing';
            const priceObj = data.offers?.price || data.price;
            const price = parseFloat(priceObj?.toString().replace(/[^0-9.]/g, '') || '0');
            const url = data.url || `https://facebook.com/marketplace/item/${Date.now()}`;
            
            if (price > 0 && title) {
              listings.push({ title: title.trim(), price, location: source, url, source, tier: 1 });
            }
          }
        } catch (e) {
          console.log(`⚠️ Failed to parse JSON-LD: ${e.message}`);
        }
      }
    }

    // Strategy 2: React props and data attributes
    const reactDataMatches = html.match(/"marketplace_listing_title":"([^"]+)"|"listing_price":\s*{[^}]*"amount":\s*"?(\d+)"?/g);
    if (reactDataMatches && reactDataMatches.length > 0) {
      console.log(`📱 Found ${reactDataMatches.length} React data patterns in Facebook HTML`);
      let titleMatch, priceMatch;
      for (const match of reactDataMatches) {
        if (match.includes('marketplace_listing_title')) {
          titleMatch = match.match(/"marketplace_listing_title":"([^"]+)"/);
        }
        if (match.includes('listing_price')) {
          priceMatch = match.match(/"amount":\s*"?(\d+)"?/);
        }
        
        if (titleMatch && priceMatch) {
          const title = titleMatch[1];
          const price = parseInt(priceMatch[1]);
          if (price > 0 && title) {
            listings.push({
              title: title.trim(),
              price,
              location: source,
              url: `https://facebook.com/marketplace/item/${Date.now()}`,
              source,
              tier: 1
            });
          }
          titleMatch = priceMatch = null;
        }
      }
    }

    // Strategy 3: Meta property tags
    const metaPriceMatch = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/);
    const metaTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
    if (metaPriceMatch && metaTitleMatch) {
      console.log(`🏷️ Found meta property data in Facebook HTML`);
      const title = metaTitleMatch[1];
      const price = parseFloat(metaPriceMatch[1]);
      if (price > 0 && title) {
        listings.push({
          title: title.trim(),
          price,
          location: source,
          url: `https://facebook.com/marketplace/item/${Date.now()}`,
          source,
          tier: 1
        });
      }
    }

    if (listings.length === 0) {
      console.log(`❌ No matching results found in Facebook Marketplace HTML (${html.length} chars)`);
      console.log(`📋 HTML sample: ${html.substring(0, 500)}...`);
    } else {
      console.log(`✅ Parsed ${listings.length} listings from Facebook Marketplace`);
    }

  } catch (error) {
    console.error(`💥 Facebook parsing error: ${error.message}`);
  }
  
  return listings;
}

function parseEbay(html: string, source: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  console.log(`🔍 Starting eBay parsing for ${source}`);
  
  try {
    // Strategy 1: Modern eBay search results structure
    const itemPattern = /<div[^>]*class="[^"]*s-item[^"]*"[^>]*>(.*?)<\/div>/gs;
    const items = [...html.matchAll(itemPattern)];
    
    console.log(`📦 Found ${items.length} potential eBay item containers`);
    
    for (const itemMatch of items) {
      const itemHtml = itemMatch[1];
      
      // Extract link and title
      const linkMatch = itemHtml.match(/<a[^>]*href="([^"]+)"[^>]*>.*?<span[^>]*role="heading"[^>]*>([^<]+)<\/span>/s) ||
                       itemHtml.match(/<a[^>]*class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s);
      
      // Extract price with multiple patterns
      const priceMatch = itemHtml.match(/<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>[\$\s]*([0-9,]+\.?\d*)/s) ||
                         itemHtml.match(/<span[^>]*class="[^"]*notranslate[^"]*"[^>]*>[\$\s]*([0-9,]+\.?\d*)/s) ||
                         itemHtml.match(/\$([0-9,]+\.?\d*)/);
      
      if (linkMatch && priceMatch) {
        const url = linkMatch[1];
        const title = linkMatch[2]?.replace(/<[^>]*>/g, '').trim() || 'eBay Listing';
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        
        if (price > 0 && url && title) {
          listings.push({
            title: title.trim(),
            price,
            location: source,
            url: url.startsWith('http') ? url : `https://ebay.com${url}`,
            source,
            tier: 1
          });
        }
      }
    }

    // Strategy 2: Fallback for JSON data in scripts
    if (listings.length === 0) {
      console.log(`🔄 Trying fallback JSON parsing for eBay`);
      const jsonMatches = html.match(/<script[^>]*>(.*?"itemSummary".*?)<\/script>/gs);
      if (jsonMatches) {
        for (const jsonScript of jsonMatches) {
          try {
            const jsonContent = jsonScript.replace(/<script[^>]*>|<\/script>/g, '');
            const itemMatches = jsonContent.match(/"title":"([^"]+)".*?"price":{"value":([0-9.]+)/g);
            
            if (itemMatches) {
              for (const item of itemMatches) {
                const titleMatch = item.match(/"title":"([^"]+)"/);
                const priceMatch = item.match(/"price":{"value":([0-9.]+)/);
                
                if (titleMatch && priceMatch) {
                  const title = titleMatch[1];
                  const price = parseFloat(priceMatch[1]);
                  
                  if (price > 0 && title) {
                    listings.push({
                      title: title.trim(),
                      price,
                      location: source,
                      url: `https://ebay.com/itm/${Date.now()}`,
                      source,
                      tier: 1
                    });
                  }
                }
              }
            }
          } catch (e) {
            console.log(`⚠️ Failed to parse eBay JSON: ${e.message}`);
          }
        }
      }
    }

    // Strategy 3: Ultra-simple regex fallback
    if (listings.length === 0) {
      console.log(`🔄 Trying regex fallback for eBay`);
      const simplePattern = /href="([^"]*ebay[^"]*itm[^"]*)"[^>]*>.*?>\s*([^<]+?)\s*<.*?\$([0-9,]+\.?\d*)/gs;
      let match;
      while ((match = simplePattern.exec(html)) !== null) {
        const url = match[1];
        const title = match[2].trim();
        const price = parseFloat(match[3].replace(/,/g, ''));
        
        if (price > 0 && title && url) {
          listings.push({
            title: title.trim(),
            price,
            location: source,
            url: url.startsWith('http') ? url : `https://ebay.com${url}`,
            source,
            tier: 1
          });
        }
      }
    }

    if (listings.length === 0) {
      console.log(`❌ No matching results found in eBay HTML (${html.length} chars)`);
      console.log(`📋 HTML sample: ${html.substring(0, 500)}...`);
    } else {
      console.log(`✅ Parsed ${listings.length} listings from eBay`);
    }

  } catch (error) {
    console.error(`💥 eBay parsing error: ${error.message}`);
  }
  
  return listings;
}

function parseCraigslist(html: string, source: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  console.log(`🔍 Starting Craigslist parsing for ${source}`);
  
  try {
    // Strategy 1: Modern Craigslist structure with data attributes
    const itemPattern = /<li[^>]*class="[^"]*cl-search-result[^"]*"[^>]*>(.*?)<\/li>/gs;
    const items = [...html.matchAll(itemPattern)];
    
    console.log(`📋 Found ${items.length} Craigslist search result containers`);
    
    for (const itemMatch of items) {
      const itemHtml = itemMatch[1];
      
      // Extract title and link
      const titleMatch = itemHtml.match(/<a[^>]*class="[^"]*cl-app-anchor[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s) ||
                        itemHtml.match(/<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"/s);
      
      // Extract price with multiple patterns
      const priceMatch = itemHtml.match(/<span[^>]*class="[^"]*result-price[^"]*"[^>]*>\$([0-9,]+)/s) ||
                        itemHtml.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
      
      if (titleMatch && priceMatch) {
        const url = titleMatch[1];
        const title = titleMatch[2]?.replace(/<[^>]*>/g, '').trim() || 'Craigslist Listing';
        const price = parseInt(priceMatch[1].replace(/,/g, ''));
        
        if (price > 0 && url && title) {
          listings.push({
            title: title.trim(),
            price,
            location: source,
            url: url.startsWith('http') ? url : `https://craigslist.org${url}`,
            source,
            tier: 1
          });
        }
      }
    }

    // Strategy 2: Legacy result-row structure
    if (listings.length === 0) {
      console.log(`🔄 Trying legacy result-row parsing for Craigslist`);
      const legacyPattern = /<p[^>]*class="[^"]*result-info[^"]*"[^>]*>(.*?)<\/p>/gs;
      const legacyItems = [...html.matchAll(legacyPattern)];
      
      for (const itemMatch of legacyItems) {
        const itemHtml = itemMatch[1];
        
        const titleMatch = itemHtml.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*result-title[^"]*"[^>]*>([^<]+)<\/a>/s);
        const priceMatch = itemHtml.match(/<span[^>]*class="[^"]*result-price[^"]*"[^>]*>\$([0-9,]+)/s);
        
        if (titleMatch && priceMatch) {
          const url = titleMatch[1];
          const title = titleMatch[2].trim();
          const price = parseInt(priceMatch[1].replace(/,/g, ''));
          
          if (price > 0 && url && title) {
            listings.push({
              title: title.trim(),
              price,
              location: source,
              url: url.startsWith('http') ? url : `https://craigslist.org${url}`,
              source,
              tier: 1
            });
          }
        }
      }
    }

    // Strategy 3: Ultra-simple regex fallback for any href + price pattern
    if (listings.length === 0) {
      console.log(`🔄 Trying regex fallback for Craigslist`);
      const simplePattern = /href="([^"]*\.html[^"]*)"[^>]*>([^<]+)<.*?\$([0-9,]+)/gs;
      let match;
      while ((match = simplePattern.exec(html)) !== null) {
        const url = match[1];
        const title = match[2].trim();
        const price = parseInt(match[3].replace(/,/g, ''));
        
        if (price > 0 && title && url && !title.includes('<')) {
          listings.push({
            title: title.trim(),
            price,
            location: source,
            url: url.startsWith('http') ? url : `https://craigslist.org${url}`,
            source,
            tier: 1
          });
        }
      }
    }

    if (listings.length === 0) {
      console.log(`❌ No matching results found in ${source} HTML (${html.length} chars)`);
      console.log(`📋 HTML sample: ${html.substring(0, 500)}...`);
    } else {
      console.log(`✅ Parsed ${listings.length} listings from ${source}`);
    }

  } catch (error) {
    console.error(`💥 Craigslist parsing error for ${source}: ${error.message}`);
  }
  
  return listings;
}