import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Test a known popular search term
    const searchTerm = "Yamaha MT-07";
    console.log(`🔍 Testing parser with known popular term: ${searchTerm}`);

    // Test Craigslist parsing with known popular term
    const scraperApiKey = Deno.env.get('SCRAPER_API_KEY');
    if (!scraperApiKey) {
      throw new Error('Missing SCRAPER_API_KEY');
    }

    // Test Denver Craigslist
    const craigslistUrl = `https://denver.craigslist.org/search/mcy?query=${encodeURIComponent(searchTerm)}`;
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(craigslistUrl)}`;
    
    console.log(`📡 Fetching: ${craigslistUrl}`);
    
    const response = await fetch(scraperUrl);
    const html = await response.text();
    
    console.log(`📄 Got ${html.length} chars from Craigslist`);
    console.log(`📋 HTML sample: ${html.substring(0, 500)}...`);
    
    // Test our parser logic
    const dom = new DOMParser().parseFromString(html, 'text/html');
    
    // Try multiple selectors that might work for Craigslist
    const selectors = [
      '.result-row',           // Classic Craigslist
      '.cl-search-result',     // New Craigslist format
      '[data-pid]',           // Listing with post ID
      '.gallery .result-node', // Gallery view
      '.list .result-row'      // List view
    ];
    
    let foundElements = 0;
    for (const selector of selectors) {
      const elements = dom.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
        foundElements += elements.length;
        
        // Log first element structure
        if (elements[0]) {
          console.log(`📋 First element HTML: ${elements[0].outerHTML.substring(0, 300)}...`);
        }
      } else {
        console.log(`❌ No elements found with selector: ${selector}`);
      }
    }
    
    // Check for "no results" indicators
    const noResultsIndicators = [
      'no results',
      'nothing found',
      'your search',
      'try different'
    ];
    
    let hasNoResultsText = false;
    for (const indicator of noResultsIndicators) {
      if (html.toLowerCase().includes(indicator)) {
        console.log(`⚠️ Found "no results" indicator: ${indicator}`);
        hasNoResultsText = true;
      }
    }
    
    // Test eBay as well
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchTerm)}`;
    const ebayScraperUrl = `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(ebayUrl)}`;
    
    console.log(`📡 Testing eBay: ${ebayUrl}`);
    const ebayResponse = await fetch(ebayScraperUrl);
    const ebayHtml = await ebayResponse.text();
    
    console.log(`📄 Got ${ebayHtml.length} chars from eBay`);
    
    const ebayDom = new DOMParser().parseFromString(ebayHtml, 'text/html');
    const ebayItems = ebayDom.querySelectorAll('.s-item');
    console.log(`📦 Found ${ebayItems.length} eBay items with .s-item selector`);
    
    if (ebayItems.length > 0) {
      console.log(`📋 First eBay item: ${ebayItems[0].outerHTML.substring(0, 300)}...`);
    }

    return new Response(JSON.stringify({
      status: 'success',
      searchTerm,
      craigslist: {
        htmlLength: html.length,
        foundElements,
        hasNoResultsText,
        sampleHtml: html.substring(0, 1000)
      },
      ebay: {
        htmlLength: ebayHtml.length,
        foundItems: ebayItems.length,
        sampleHtml: ebayHtml.substring(0, 1000)
      }
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});