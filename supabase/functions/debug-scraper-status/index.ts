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

    // Get system status
    const [
      { data: listingsCount },
      { data: secondaryCount },
      { data: tertiaryCount },
      { data: searchConfigsCount },
      { data: recentActivity },
      { data: failedSources },
      { data: searchableSources }
    ] = await Promise.all([
      supabase.from('listings').select('*', { count: 'exact', head: true }),
      supabase.from('secondary_sources').select('*', { count: 'exact', head: true }),
      supabase.from('tertiary_sources').select('*', { count: 'exact', head: true }),
      supabase.from('search_configs').select('*', { count: 'exact', head: true }),
      supabase
        .from('scrape_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('scrape_activity')
        .select('*')
        .eq('status', 'source_failed')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('secondary_sources')
        .select('url, source, searchable')
        .order('discovered_at', { ascending: false })
        .limit(20)
    ]);

    // Get tier breakdown
    const { data: tierBreakdown } = await supabase
      .from('listings')
      .select('tier')
      .then(result => {
        const breakdown = { tier1: 0, tier2: 0, tier3: 0 };
        result.data?.forEach(listing => {
          if (listing.tier === 1) breakdown.tier1++;
          else if (listing.tier === 2) breakdown.tier2++;
          else if (listing.tier === 3) breakdown.tier3++;
        });
        return { data: breakdown };
      });

    // Get latest failures by source
    const failuresBySource = failedSources?.reduce((acc, activity) => {
      const sourceName = activity.metadata?.source_name || 'Unknown';
      if (!acc[sourceName]) {
        acc[sourceName] = [];
      }
      acc[sourceName].push({
        reason: activity.metadata?.failure_reason || activity.message,
        time: activity.created_at
      });
      return acc;
    }, {});

    const status = {
      timestamp: new Date().toISOString(),
      data_counts: {
        total_listings: listingsCount?.count || 0,
        secondary_sources: secondaryCount?.count || 0,
        tertiary_sources: tertiaryCount?.count || 0,
        search_configs: searchConfigsCount?.count || 0
      },
      listings_by_tier: tierBreakdown || { tier1: 0, tier2: 0, tier3: 0 },
      recent_activity: recentActivity?.map(activity => ({
        module: activity.module_name,
        status: activity.status,
        message: activity.message,
        listings_found: activity.listings_found,
        time: activity.created_at
      })) || [],
      source_failures: failuresBySource || {},
      source_searchability: searchableSources?.map(source => ({
        url: source.url,
        name: source.source,
        searchable: source.searchable
      })) || [],
      expected_data_flow: {
        primary_search: "Should populate listings table with tier 1 data (Craigslist, FB, eBay)",
        extended_search: "Should populate listings table with tier 2 data (searchable marketplaces)",
        contextual_finder: "Should add new secondary_sources",
        discovery_crawler: "Should add new tertiary_sources AND insert tier 3 listings"
      }
    };

    return new Response(
      JSON.stringify(status, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Debug status error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});