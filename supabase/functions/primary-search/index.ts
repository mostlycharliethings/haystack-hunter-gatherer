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

    // Placeholder for scrapers
    const fbResults = await fakeScraper("Facebook", terms);
    const clResults = await fakeScraper("Craigslist", terms);
    const ebResults = await fakeScraper("eBay", terms);
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