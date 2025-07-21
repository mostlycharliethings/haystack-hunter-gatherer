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

interface CraigslistSubArea {
  parent_area_id: string;
  abbreviation: string;
  description: string;
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

    console.log('🌐 Fetching Craigslist areas from reference.craigslist.org...');
    
    // Fetch the areas data
    const response = await fetch('https://reference.craigslist.org/Areas', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AreaBot/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch areas: ${response.status} ${response.statusText}`);
    }
    
    const htmlText = await response.text();
    console.log(`📄 Received ${htmlText.length} characters of HTML`);
    
    // Parse the areas and sub-areas
    const { areas, subAreas } = parseAreasData(htmlText);
    
    console.log(`📍 Parsed ${areas.length} areas and ${subAreas.length} sub-areas`);
    
    // Clear existing data
    await supabase.from('craigslist_sub_areas').delete().gte('id', 0);
    await supabase.from('craigslist_areas').delete().gte('id', 0);
    
    console.log('🗑️ Cleared existing data');
    
    // Insert areas
    let areasInserted = 0;
    for (const area of areas) {
      const { error } = await supabase
        .from('craigslist_areas')
        .insert(area);
      
      if (error) {
        console.error(`❌ Error inserting area ${area.area_id}:`, error);
      } else {
        areasInserted++;
      }
    }
    
    // Insert sub-areas
    let subAreasInserted = 0;
    for (const subArea of subAreas) {
      const { error } = await supabase
        .from('craigslist_sub_areas')
        .insert(subArea);
      
      if (error) {
        console.error(`❌ Error inserting sub-area ${subArea.abbreviation}:`, error);
      } else {
        subAreasInserted++;
      }
    }
    
    console.log(`✅ Successfully inserted ${areasInserted} areas and ${subAreasInserted} sub-areas`);
    
    return new Response(JSON.stringify({ 
      success: true,
      areas_inserted: areasInserted,
      sub_areas_inserted: subAreasInserted,
      total_areas: areas.length,
      total_sub_areas: subAreas.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error populating Craigslist areas:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function parseAreasData(html: string): { areas: CraigslistArea[], subAreas: CraigslistSubArea[] } {
  const areas: CraigslistArea[] = [];
  const subAreas: CraigslistSubArea[] = [];
  
  try {
    console.log('🔍 Parsing HTML for area data...');
    
    // The craigslist reference page has a specific structure
    // Look for patterns that indicate area listings
    const lines = html.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for lines that contain craigslist.org URLs
      if (trimmedLine.includes('.craigslist.org')) {
        try {
          // Extract hostname pattern
          const hostnameMatch = trimmedLine.match(/([a-z0-9-]+)\.craigslist\.org/);
          if (hostnameMatch) {
            const abbreviation = hostnameMatch[1];
            
            // Skip if it's a subdomain or special case
            if (abbreviation.includes('.') || abbreviation === 'www') {
              continue;
            }
            
            // Create area object with basic US geographical data
            const area: CraigslistArea = {
              area_id: abbreviation,
              abbreviation: abbreviation,
              hostname: `${abbreviation}.craigslist.org`,
              description: formatAreaDescription(abbreviation),
              country: 'US',
              region: getRegionForArea(abbreviation),
              latitude: getLatitudeForArea(abbreviation),
              longitude: getLongitudeForArea(abbreviation),
            };
            
            // Check if this area already exists
            if (!areas.find(a => a.area_id === area.area_id)) {
              areas.push(area);
            }
          }
        } catch (error) {
          // Skip malformed lines
          continue;
        }
      }
    }
    
    // Add some well-known areas if not found in parsing
    const knownAreas = [
      { abbr: 'newyork', desc: 'New York City', region: 'Northeast', lat: 40.7128, lng: -74.0060 },
      { abbr: 'sfbay', desc: 'San Francisco Bay Area', region: 'West', lat: 37.7749, lng: -122.4194 },
      { abbr: 'losangeles', desc: 'Los Angeles', region: 'West', lat: 34.0522, lng: -118.2437 },
      { abbr: 'chicago', desc: 'Chicago', region: 'Midwest', lat: 41.8781, lng: -87.6298 },
      { abbr: 'washingtondc', desc: 'Washington DC', region: 'Southeast', lat: 38.9072, lng: -77.0369 },
      { abbr: 'boston', desc: 'Boston', region: 'Northeast', lat: 42.3601, lng: -71.0589 },
      { abbr: 'seattle', desc: 'Seattle', region: 'West', lat: 47.6062, lng: -122.3321 },
      { abbr: 'atlanta', desc: 'Atlanta', region: 'Southeast', lat: 33.7490, lng: -84.3880 },
      { abbr: 'denver', desc: 'Denver', region: 'West', lat: 39.7392, lng: -104.9903 },
      { abbr: 'miami', desc: 'Miami', region: 'Southeast', lat: 25.7617, lng: -80.1918 },
      { abbr: 'houston', desc: 'Houston', region: 'South', lat: 29.7604, lng: -95.3698 },
      { abbr: 'phoenix', desc: 'Phoenix', region: 'West', lat: 33.4484, lng: -112.0740 },
      { abbr: 'philadelphia', desc: 'Philadelphia', region: 'Northeast', lat: 39.9526, lng: -75.1652 },
      { abbr: 'detroit', desc: 'Detroit', region: 'Midwest', lat: 42.3314, lng: -83.0458 },
      { abbr: 'portland', desc: 'Portland', region: 'West', lat: 45.5152, lng: -122.6784 },
      { abbr: 'dallas', desc: 'Dallas', region: 'South', lat: 32.7767, lng: -96.7970 },
      { abbr: 'minneapolis', desc: 'Minneapolis', region: 'Midwest', lat: 44.9778, lng: -93.2650 },
      { abbr: 'stlouis', desc: 'St Louis', region: 'Midwest', lat: 38.6270, lng: -90.1994 },
      { abbr: 'tampa', desc: 'Tampa', region: 'Southeast', lat: 27.9506, lng: -82.4572 },
      { abbr: 'orlando', desc: 'Orlando', region: 'Southeast', lat: 28.5383, lng: -81.3792 },
    ];
    
    for (const known of knownAreas) {
      if (!areas.find(a => a.area_id === known.abbr)) {
        areas.push({
          area_id: known.abbr,
          abbreviation: known.abbr,
          hostname: `${known.abbr}.craigslist.org`,
          description: known.desc,
          country: 'US',
          region: known.region,
          latitude: known.lat,
          longitude: known.lng,
        });
      }
    }
    
    console.log(`✅ Parsed ${areas.length} total areas`);
    
  } catch (error) {
    console.error('Error parsing areas data:', error);
  }
  
  return { areas, subAreas };
}

function formatAreaDescription(abbreviation: string): string {
  // Convert abbreviation to readable description
  return abbreviation
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getRegionForArea(abbreviation: string): string {
  // Basic region mapping for US areas
  const regionMap: { [key: string]: string } = {
    'newyork': 'Northeast',
    'boston': 'Northeast',
    'philadelphia': 'Northeast',
    'washingtondc': 'Northeast',
    'sfbay': 'West',
    'losangeles': 'West',
    'seattle': 'West',
    'portland': 'West',
    'denver': 'West',
    'phoenix': 'West',
    'chicago': 'Midwest',
    'detroit': 'Midwest',
    'minneapolis': 'Midwest',
    'stlouis': 'Midwest',
    'atlanta': 'Southeast',
    'miami': 'Southeast',
    'tampa': 'Southeast',
    'orlando': 'Southeast',
    'houston': 'South',
    'dallas': 'South',
  };
  
  return regionMap[abbreviation] || 'Other';
}

function getLatitudeForArea(abbreviation: string): number {
  // Basic latitude mapping for major US cities
  const latMap: { [key: string]: number } = {
    'newyork': 40.7128,
    'sfbay': 37.7749,
    'losangeles': 34.0522,
    'chicago': 41.8781,
    'washingtondc': 38.9072,
    'boston': 42.3601,
    'seattle': 47.6062,
    'atlanta': 33.7490,
    'denver': 39.7392,
    'miami': 25.7617,
    'houston': 29.7604,
    'phoenix': 33.4484,
    'philadelphia': 39.9526,
    'detroit': 42.3314,
    'portland': 45.5152,
    'dallas': 32.7767,
    'minneapolis': 44.9778,
    'stlouis': 38.6270,
    'tampa': 27.9506,
    'orlando': 28.5383,
  };
  
  return latMap[abbreviation] || 39.8283; // Default to geographic center of US
}

function getLongitudeForArea(abbreviation: string): number {
  // Basic longitude mapping for major US cities
  const lngMap: { [key: string]: number } = {
    'newyork': -74.0060,
    'sfbay': -122.4194,
    'losangeles': -118.2437,
    'chicago': -87.6298,
    'washingtondc': -77.0369,
    'boston': -71.0589,
    'seattle': -122.3321,
    'atlanta': -84.3880,
    'denver': -104.9903,
    'miami': -80.1918,
    'houston': -95.3698,
    'phoenix': -112.0740,
    'philadelphia': -75.1652,
    'detroit': -83.0458,
    'portland': -122.6784,
    'dallas': -96.7970,
    'minneapolis': -93.2650,
    'stlouis': -90.1994,
    'tampa': -82.4572,
    'orlando': -81.3792,
  };
  
  return lngMap[abbreviation] || -98.5795; // Default to geographic center of US
}