import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CraigslistArea {
  area_id: string;
  abbreviation: string;
  hostname: string;
  description: string;
  short_description?: string;
  country: string;
  region?: string;
  latitude: number;
  longitude: number;
}

interface SearchConfig {
  id: string;
  brand: string;
  model: string;
  qualifier?: string;
  sub_qualifier?: string;
  price_threshold: number;
  location: string;
  is_active: boolean;
}

interface CraigslistListing {
  title: string;
  price: number;
  url: string;
  location: string;
  image_url?: string;
  posted_at: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔍 Craigslist Searcher started');
    
    const startTime = Date.now();
    let totalListings = 0;
    let areasProcessed = 0;

    // Log activity start
    const { data: activityLog } = await supabase.rpc('log_scrape_activity', {
      p_module_name: 'craigslist-searcher',
      p_status: 'started',
      p_message: 'Starting Craigslist search across all areas'
    });

    // Step 1: Sync Craigslist areas
    await syncCraigslistAreas(supabase);

    // Step 2: Get active search configs
    const { data: searchConfigs, error: configError } = await supabase
      .from('search_configs')
      .select('*')
      .eq('is_active', true);

    if (configError) {
      throw new Error(`Failed to fetch search configs: ${configError.message}`);
    }

    if (!searchConfigs || searchConfigs.length === 0) {
      console.log('ℹ️ No active search configs found');
      return new Response(JSON.stringify({ success: true, message: 'No active search configs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Get user's location from search configs (use first active config's location)
    let userLat = 39.8283; // Default to US center (Kansas)
    let userLon = -98.5795;
    
    if (searchConfigs && searchConfigs.length > 0) {
      // Try to extract coordinates from location field or use geocoding
      // For now, use default coordinates - in production, you'd geocode the location
      console.log(`📍 Using location context from search configs: ${searchConfigs[0].location}`);
    }

    // Step 4: Get Craigslist areas prioritized by distance using 3-tier system
    const { data: tier1Areas, error: tier1Error } = await supabase
      .rpc('get_nearby_craigslist_areas', {
        user_lat: userLat,
        user_lon: userLon,
        radius_miles: 100 // Tier 1: <100 miles
      });

    const { data: tier2Areas, error: tier2Error } = await supabase
      .rpc('get_nearby_craigslist_areas', {
        user_lat: userLat,
        user_lon: userLon,
        radius_miles: 500 // Tier 2: 101-500 miles (will filter out tier 1)
      });

    const { data: tier3Areas, error: tier3Error } = await supabase
      .rpc('get_nearby_craigslist_areas', {
        user_lat: userLat,
        user_lon: userLon,
        radius_miles: 2000 // Tier 3: 500+ miles (effectively nationwide)
      });

    // Organize areas by tiers, removing duplicates
    const tier1 = (tier1Areas || []).slice(0, 8); // First 8 closest areas
    const tier2 = (tier2Areas || [])
      .filter(area => area.distance_miles > 100 && area.distance_miles <= 500)
      .slice(0, 8); // Next 8 areas in 101-500 mile range
    const tier3 = (tier3Areas || [])
      .filter(area => area.distance_miles > 500)
      .slice(0, 9); // Final 9 areas beyond 500 miles

    // Combine all tiers for processing (total: 25 areas max)
    const prioritizedAreas = [...tier1, ...tier2, ...tier3];

    console.log(`📍 Location-based search: ${tier1.length} tier-1 (<100mi), ${tier2.length} tier-2 (101-500mi), ${tier3.length} tier-3 (500+mi) areas`);

    if (!prioritizedAreas || prioritizedAreas.length === 0) {
      // Fallback to any available areas
      const { data: fallbackAreas } = await supabase
        .from('craigslist_areas')
        .select('*')
        .limit(25);
      
      console.log('📍 Using fallback areas (no location-based prioritization)');
      prioritizedAreas.push(...(fallbackAreas || []));
    }

    // Step 5: Process each search config across prioritized areas
    const areas = prioritizedAreas.length > 0 ? prioritizedAreas : [];
    
    for (const config of searchConfigs) {
      console.log(`🔍 Processing search config: ${config.brand} ${config.model}`);
      
      for (const area of areas || []) {
        try {
          const listings = await searchCraigslistArea(area, config);
          
          if (listings.length > 0) {
            await saveListings(supabase, listings, config.id);
            totalListings += listings.length;
            console.log(`✅ Found ${listings.length} listings in ${area.description}`);
          }
          
          areasProcessed++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`❌ Error processing ${area.description}:`, error);
        }
      }
    }

    const executionTime = Date.now() - startTime;

    // Log completion
    await supabase.rpc('log_scrape_activity', {
      p_module_name: 'craigslist-searcher',
      p_status: 'completed',
      p_message: `Processed ${areasProcessed} areas, found ${totalListings} listings`,
      p_listings_found: totalListings,
      p_sources_processed: areasProcessed,
      p_execution_time_ms: executionTime
    });

    console.log(`🎉 Craigslist search completed: ${totalListings} listings from ${areasProcessed} areas in ${executionTime}ms`);

    return new Response(JSON.stringify({ 
      success: true, 
      listings_found: totalListings,
      areas_processed: areasProcessed,
      execution_time_ms: executionTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Craigslist searcher error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function syncCraigslistAreas(supabase: any) {
  try {
    console.log('🌐 Syncing Craigslist areas from reference.craigslist.org...');
    
    const response = await fetch('https://reference.craigslist.org/Areas');
    if (!response.ok) {
      throw new Error(`Failed to fetch areas: ${response.status}`);
    }
    
    const htmlText = await response.text();
    const areas = parseCraigslistAreas(htmlText);
    
    console.log(`📍 Parsed ${areas.length} Craigslist areas`);
    
    // Upsert areas (update existing, insert new)
    for (const area of areas) {
      await supabase
        .from('craigslist_areas')
        .upsert(area, { onConflict: 'area_id' });
    }
    
    console.log('✅ Craigslist areas synced successfully');
  } catch (error) {
    console.error('❌ Failed to sync Craigslist areas:', error);
    throw error;
  }
}

function parseCraigslistAreas(html: string): CraigslistArea[] {
  const areas: CraigslistArea[] = [];
  
  try {
    // Parse the HTML structure - Craigslist areas are typically in a structured format
    // This is a simplified parser - may need adjustment based on actual HTML structure
    const lines = html.split('\n');
    
    for (const line of lines) {
      // Look for area data patterns
      if (line.includes('craigslist.org') && line.includes('http')) {
        try {
          // Extract area information from the line
          const urlMatch = line.match(/https?:\/\/([^.]+)\.craigslist\.org/);
          if (urlMatch) {
            const abbreviation = urlMatch[1];
            
            // Create a basic area object
            const area: CraigslistArea = {
              area_id: abbreviation,
              abbreviation: abbreviation,
              hostname: `${abbreviation}.craigslist.org`,
              description: abbreviation.replace(/[_-]/g, ' ').toUpperCase(),
              country: 'US', // Default to US
              latitude: 0, // Will need actual coordinates
              longitude: 0,
            };
            
            areas.push(area);
          }
        } catch (error) {
          // Skip malformed lines
          continue;
        }
      }
    }
  } catch (error) {
    console.error('Error parsing Craigslist areas:', error);
  }
  
  return areas;
}

async function searchCraigslistArea(area: CraigslistArea, config: SearchConfig): Promise<CraigslistListing[]> {
  const listings: CraigslistListing[] = [];
  
  try {
    // Build search query
    const searchTerms = [config.brand, config.model, config.qualifier, config.sub_qualifier]
      .filter(Boolean)
      .join(' ');
    
    // Construct Craigslist search URL
    const searchUrl = `https://${area.hostname}/search/sss?query=${encodeURIComponent(searchTerms)}&sort=date&max_price=${config.price_threshold}`;
    
    console.log(`🔍 Searching ${area.hostname} for: ${searchTerms}`);
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SearchBot/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const parsedListings = parseCraigslistSearchResults(html, area);
    
    // Filter by price threshold
    const filteredListings = parsedListings.filter(listing => 
      listing.price <= config.price_threshold
    );
    
    listings.push(...filteredListings);
    
  } catch (error) {
    console.error(`❌ Error searching ${area.hostname}:`, error);
  }
  
  return listings;
}

function parseCraigslistSearchResults(html: string, area: CraigslistArea): CraigslistListing[] {
  const listings: CraigslistListing[] = [];
  
  try {
    // Parse Craigslist search results HTML
    // This is a simplified parser - Craigslist structure may vary
    
    // Look for result items (typically in .result-row or similar classes)
    const resultPattern = /<li class="[^"]*result-row[^"]*"[^>]*>(.*?)<\/li>/gs;
    const matches = html.matchAll(resultPattern);
    
    for (const match of matches) {
      const resultHtml = match[1];
      
      try {
        // Extract title
        const titleMatch = resultHtml.match(/<a[^>]*class="[^"]*result-title[^"]*"[^>]*>([^<]+)</);
        const title = titleMatch?.[1]?.trim();
        
        // Extract price
        const priceMatch = resultHtml.match(/<span class="[^"]*result-price[^"]*">[\s]*\$([0-9,]+)/);
        const priceStr = priceMatch?.[1]?.replace(/,/g, '');
        const price = priceStr ? parseInt(priceStr) : 0;
        
        // Extract URL
        const urlMatch = resultHtml.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*result-title/);
        const relativeUrl = urlMatch?.[1];
        const url = relativeUrl ? `https://${area.hostname}${relativeUrl}` : '';
        
        // Extract image
        const imageMatch = resultHtml.match(/<img[^>]*src="([^"]+)"/);
        const image_url = imageMatch?.[1];
        
        if (title && price > 0 && url) {
          listings.push({
            title,
            price,
            url,
            location: area.description,
            image_url,
            posted_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        // Skip malformed results
        continue;
      }
    }
  } catch (error) {
    console.error('Error parsing Craigslist results:', error);
  }
  
  return listings;
}

async function saveListings(supabase: any, listings: CraigslistListing[], searchConfigId: string) {
  try {
    const listingsToSave = listings.map(listing => ({
      search_config_id: searchConfigId,
      title: listing.title,
      price: listing.price,
      url: listing.url,
      location: listing.location,
      source: 'craigslist',
      image_url: listing.image_url,
      posted_at: listing.posted_at,
      discovered_at: new Date().toISOString(),
      tier: 1, // Primary source
    }));

    // Upsert listings (avoid duplicates by URL)
    for (const listing of listingsToSave) {
      await supabase
        .from('listings')
        .upsert(listing, { 
          onConflict: 'url',
          ignoreDuplicates: false 
        });
    }
    
    console.log(`💾 Saved ${listingsToSave.length} listings to database`);
  } catch (error) {
    console.error('❌ Error saving listings:', error);
    throw error;
  }
}