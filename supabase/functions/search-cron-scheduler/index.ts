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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { module, searchConfigId } = await req.json();

    console.log(`Cron scheduler triggered for module: ${module}`);

    // Log cron start
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'search-cron-scheduler',
      p_search_config_id: searchConfigId || null,
      p_status: 'started',
      p_message: `Cron scheduler starting ${module} module`
    });

    const startTime = Date.now();
    let results = { success: false, message: 'Unknown error' };

    // Get active search configurations
    const { data: activeConfigs, error: configError } = await supabaseClient
      .from('search_configs')
      .select('*')
      .eq('is_active', true);

    if (configError) {
      throw new Error(`Failed to get search configs: ${configError.message}`);
    }

    console.log(`Found ${activeConfigs?.length || 0} active search configurations`);

    if (!activeConfigs || activeConfigs.length === 0) {
      results = { success: true, message: 'No active search configurations found' };
    } else {
      // Execute the specified module for each active config
      switch (module) {
        case 'primary-search':
          results = await runPrimarySearchForConfigs(activeConfigs);
          break;
        case 'extended-search':
          results = await runExtendedSearchForConfigs(activeConfigs);
          break;
        case 'contextual-finder':
          results = await runContextualFinderForConfigs(activeConfigs);
          break;
        case 'discovery-crawler':
          results = await runDiscoveryCrawler();
          break;
        case 'notifier':
          results = await runNotifier(activeConfigs);
          break;
        default:
          throw new Error(`Unknown module: ${module}`);
      }
    }

    const executionTime = Date.now() - startTime;

    // Log completion
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'search-cron-scheduler',
      p_search_config_id: searchConfigId || null,
      p_status: results.success ? 'success' : 'failure',
      p_message: `Cron execution completed: ${results.message}`,
      p_listings_found: results.listings_found || 0,
      p_sources_processed: results.sources_processed || 0,
      p_execution_time_ms: executionTime,
      p_metadata: {
        module: module,
        configs_processed: activeConfigs?.length || 0,
        execution_details: results.details || {}
      }
    });

    return new Response(
      JSON.stringify({
        success: results.success,
        message: results.message,
        execution_time_ms: executionTime,
        configs_processed: activeConfigs?.length || 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Cron scheduler error:', error);
    
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

async function runPrimarySearchForConfigs(configs: any[]): Promise<any> {
  let totalListings = 0;
  let totalSources = 0;
  let successCount = 0;
  const errors = [];

  for (const config of configs) {
    try {
      console.log(`Running primary search for config: ${config.id}`);
      
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/primary-search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ searchConfigId: config.id })
      });

      if (response.ok) {
        const result = await response.json();
        totalListings += result.listings_found || 0;
        totalSources += result.sources_processed || 0;
        successCount++;
      } else {
        const error = await response.text();
        errors.push(`Config ${config.id}: ${error}`);
      }

      // Rate limiting between configs
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      errors.push(`Config ${config.id}: ${error.message}`);
    }
  }

  return {
    success: successCount > 0,
    message: `Primary search completed for ${successCount}/${configs.length} configs. Found ${totalListings} listings.`,
    listings_found: totalListings,
    sources_processed: totalSources,
    details: { successCount, errors }
  };
}

async function runExtendedSearchForConfigs(configs: any[]): Promise<any> {
  let totalListings = 0;
  let totalSources = 0;
  let successCount = 0;
  const errors = [];

  for (const config of configs) {
    try {
      console.log(`Running extended search for config: ${config.id}`);
      
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/extended-search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ searchConfigId: config.id })
      });

      if (response.ok) {
        const result = await response.json();
        totalListings += result.listings_found || 0;
        totalSources += result.sources_processed || 0;
        successCount++;
      } else {
        const error = await response.text();
        errors.push(`Config ${config.id}: ${error}`);
      }

      // Rate limiting between configs
      await new Promise(resolve => setTimeout(resolve, 8000));
      
    } catch (error) {
      errors.push(`Config ${config.id}: ${error.message}`);
    }
  }

  return {
    success: successCount > 0,
    message: `Extended search completed for ${successCount}/${configs.length} configs. Found ${totalListings} listings.`,
    listings_found: totalListings,
    sources_processed: totalSources,
    details: { successCount, errors }
  };
}

async function runContextualFinderForConfigs(configs: any[]): Promise<any> {
  let totalSources = 0;
  let successCount = 0;
  const errors = [];

  // Only run for configs that haven't been processed recently
  const recentConfigs = configs.filter(config => {
    const lastRun = config.last_run_at ? new Date(config.last_run_at) : null;
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);
    return !lastRun || lastRun < dayAgo;
  });

  console.log(`Running contextual finder for ${recentConfigs.length} configs (${configs.length - recentConfigs.length} skipped - too recent)`);

  for (const config of recentConfigs.slice(0, 5)) { // Limit to 5 to avoid overloading
    try {
      console.log(`Running contextual finder for config: ${config.id}`);
      
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/contextual-finder`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ searchConfigId: config.id })
      });

      if (response.ok) {
        const result = await response.json();
        totalSources += result.sources_added || 0;
        successCount++;
      } else {
        const error = await response.text();
        errors.push(`Config ${config.id}: ${error}`);
      }

      // Rate limiting between configs (GPT API limits)
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      errors.push(`Config ${config.id}: ${error.message}`);
    }
  }

  return {
    success: successCount > 0,
    message: `Contextual finder completed for ${successCount}/${recentConfigs.length} configs. Added ${totalSources} sources.`,
    listings_found: 0,
    sources_processed: totalSources,
    details: { successCount, errors, skipped: configs.length - recentConfigs.length }
  };
}

async function runDiscoveryCrawler(): Promise<any> {
  try {
    console.log('Running discovery crawler');
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/discovery-crawler`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}) // No specific config for general discovery
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        message: `Discovery crawler completed. Discovered ${result.sources_discovered || 0} new sources.`,
        listings_found: 0,
        sources_processed: result.sources_discovered || 0,
        details: result
      };
    } else {
      const error = await response.text();
      return {
        success: false,
        message: `Discovery crawler failed: ${error}`,
        listings_found: 0,
        sources_processed: 0,
        details: { error }
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Discovery crawler error: ${error.message}`,
      listings_found: 0,
      sources_processed: 0,
      details: { error: error.message }
    };
  }
}

async function runNotifier(configs: any[]): Promise<any> {
  try {
    console.log('Running notifier for daily digest');
    
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notifier`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        type: 'daily_digest',
        configs: configs.map(c => c.id)
      })
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        message: `Notifier completed. Sent ${result.emails_sent || 0} emails.`,
        listings_found: 0,
        sources_processed: 0,
        details: result
      };
    } else {
      const error = await response.text();
      return {
        success: false,
        message: `Notifier failed: ${error}`,
        listings_found: 0,
        sources_processed: 0,
        details: { error }
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Notifier error: ${error.message}`,
      listings_found: 0,
      sources_processed: 0,
      details: { error: error.message }
    };
  }
}