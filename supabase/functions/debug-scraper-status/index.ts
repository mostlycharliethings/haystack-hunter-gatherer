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

    // Get counts and recent activity
    const [
      { count: listingsCount },
      { count: secondaryCount }, 
      { count: tertiaryCount },
      { data: recentActivity },
      { data: listingsByTier },
      { data: failedSources },
      { data: nonSearchableSources }
    ] = await Promise.all([
      supabase.from('listings').select('*', { count: 'exact', head: true }),
      supabase.from('secondary_sources').select('*', { count: 'exact', head: true }),
      supabase.from('tertiary_sources').select('*', { count: 'exact', head: true }),
      supabase.from('scrape_activity').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('listings').select('tier, source, search_config_id'),
      supabase.from('scrape_activity').select('metadata').eq('status', 'source_failed').gte('created_at', new Date(Date.now() - 3600000).toISOString()),
      supabase.from('secondary_sources').select('source, url, searchable').eq('searchable', false)
    ]);

    const tierCounts = listingsByTier?.reduce((acc: any, l: any) => {
      acc[`tier_${l.tier}`] = (acc[`tier_${l.tier}`] || 0) + 1;
      return acc;
    }, {});

    const failureReasons = failedSources?.map((f: any) => f.metadata).filter(Boolean);

    return new Response(JSON.stringify({
      summary: {
        total_listings: listingsCount || 0,
        secondary_sources: secondaryCount || 0,
        tertiary_sources: tertiaryCount || 0,
        non_searchable_sources: nonSearchableSources?.length || 0
      },
      listings_by_tier: tierCounts || {},
      recent_failures: failureReasons || [],
      non_searchable_sources: nonSearchableSources || [],
      recent_activity: recentActivity || []
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});