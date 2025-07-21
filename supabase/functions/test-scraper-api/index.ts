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

    const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');
    if (!scraperApiKey) {
      throw new Error('SCRAPER_API_KEY not configured');
    }

    const startTime = Date.now();
    
    // Test 1: Check account info
    console.log('🔍 Testing ScraperAPI account info...');
    const accountUrl = `http://api.scraperapi.com/account?api_key=${scraperApiKey}`;
    const accountResponse = await fetch(accountUrl);
    const accountData = await accountResponse.json();
    
    console.log('Account Response:', JSON.stringify(accountData, null, 2));

    // Test 2: Simple test request
    console.log('🔍 Testing simple request through ScraperAPI...');
    const testUrl = 'https://httpbin.org/json';
    const proxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(testUrl)}`;
    
    const testResponse = await fetch(proxyUrl);
    const testHtml = await testResponse.text();
    
    console.log('Test Response Status:', testResponse.status);
    console.log('Test Response Headers:', Object.fromEntries(testResponse.headers));
    console.log('Test Response Body (first 500 chars):', testHtml.slice(0, 500));

    // Test 3: Real marketplace test (Craigslist)
    console.log('🔍 Testing real marketplace scraping...');
    const craigslistUrl = 'https://denver.craigslist.org/search/sss?query=camera';
    const craigslistProxyUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(craigslistUrl)}`;
    
    const craigslistResponse = await fetch(craigslistProxyUrl);
    const craigslistHtml = await craigslistResponse.text();
    
    console.log('Craigslist Response Status:', craigslistResponse.status);
    console.log('Craigslist Response (first 1000 chars):', craigslistHtml.slice(0, 1000));

    const executionTime = Date.now() - startTime;

    // Log the test activity
    await supabase.rpc('log_scrape_activity', {
      p_module_name: 'test-scraper-api',
      p_search_config_id: null,
      p_status: testResponse.ok && craigslistResponse.ok ? 'success' : 'failed',
      p_message: `ScraperAPI test completed - Account: ${JSON.stringify(accountData)} | Test: ${testResponse.status} | Craigslist: ${craigslistResponse.status}`,
      p_listings_found: 0,
      p_sources_processed: 3,
      p_execution_time_ms: executionTime,
      p_metadata: {
        account_data: accountData,
        test_status: testResponse.status,
        craigslist_status: craigslistResponse.status,
        test_url: testUrl,
        craigslist_url: craigslistUrl
      }
    });

    const results = {
      success: true,
      tests: {
        account: {
          status: accountResponse.status,
          data: accountData
        },
        simple_request: {
          status: testResponse.status,
          response_length: testHtml.length,
          sample: testHtml.slice(0, 200)
        },
        craigslist_request: {
          status: craigslistResponse.status,
          response_length: craigslistHtml.length,
          sample: craigslistHtml.slice(0, 200)
        }
      },
      execution_time_ms: executionTime,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error("ScraperAPI test error:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});