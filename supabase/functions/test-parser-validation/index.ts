import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ScrapedListing {
  title: string;
  price: number;
  location: string;
  url: string;
  source: string;
  tier: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🧪 Testing parser validation with synthetic HTML samples");

    // Test data provided by user
    const ebayTestHtml = `
<ul class="srp-results">
  <li class="s-item">
    <div>
      <a class="s-item__link" href="https://www.ebay.com/itm/2345678901">
        <h3 class="s-item__title">Yamaha MT-07 2022 - Excellent Condition</h3>
      </a>
      <span class="s-item__price">$7,999.00</span>
    </div>
  </li>
</ul>`;

    const craigslistTestHtml = `
<ul class="rows">
  <li class="cl-search-result">
    <div class="result-info">
      <a href="/denver/mcy/d/yamaha-mt-07-2022/7654321098.html" class="cl-app-anchor">
        <span class="result-title">Yamaha MT-07 2022 - Great Bike</span>
      </a>
      <span class="result-price">$7,500</span>
    </div>
  </li>
</ul>`;

    // Test eBay parser with simple extraction logic for provided sample
    console.log("🔍 Testing eBay parser with synthetic data...");
    const ebayListings = parseEbaySimple(ebayTestHtml, "eBay Test");
    console.log(`📦 eBay extracted ${ebayListings.length} listings:`, ebayListings);

    // Test Craigslist parser with simple extraction logic for provided sample  
    console.log("🔍 Testing Craigslist parser with synthetic data...");
    const craigslistListings = parseCraigslistSimple(craigslistTestHtml, "Craigslist Test");
    console.log(`📋 Craigslist extracted ${craigslistListings.length} listings:`, craigslistListings);

    return new Response(JSON.stringify({
      status: 'success',
      ebay: {
        testHtml: ebayTestHtml,
        extractedListings: ebayListings.length,
        listings: ebayListings
      },
      craigslist: {
        testHtml: craigslistTestHtml,
        extractedListings: craigslistListings.length,
        listings: craigslistListings
      }
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Parser validation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function parseEbaySimple(html: string, source: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  console.log(`🔍 Testing eBay parser for ${source}`);
  
  try {
    // Use the exact selectors from user's specification
    const itemElements = html.match(/<li class="s-item"[^>]*>(.*?)<\/li>/gs);
    
    if (itemElements) {
      console.log(`📦 Found ${itemElements.length} s-item elements`);
      
      for (const item of itemElements) {
        // Extract link and title using a.s-item__link and h3.s-item__title
        const linkMatch = item.match(/<a class="s-item__link" href="([^"]+)"[^>]*>/);
        const titleMatch = item.match(/<h3 class="s-item__title">([^<]+)<\/h3>/);
        const priceMatch = item.match(/<span class="s-item__price">\$([0-9,]+\.?\d*)<\/span>/);
        
        console.log(`🔍 Link: ${linkMatch?.[1]}, Title: ${titleMatch?.[1]}, Price: ${priceMatch?.[1]}`);
        
        if (linkMatch && titleMatch && priceMatch) {
          const url = linkMatch[1];
          const title = titleMatch[1].trim();
          const price = parseFloat(priceMatch[1].replace(/,/g, ''));
          
          if (price > 0 && title && url) {
            listings.push({
              title,
              price,
              location: source,
              url,
              source,
              tier: 1
            });
            console.log(`✅ Successfully extracted: ${title} - $${price}`);
          }
        }
      }
    } else {
      console.log(`❌ No li.s-item elements found in HTML`);
    }

  } catch (error) {
    console.error(`💥 eBay parsing error: ${error.message}`);
  }
  
  return listings;
}

function parseCraigslistSimple(html: string, source: string): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  console.log(`🔍 Testing Craigslist parser for ${source}`);
  
  try {
    // Use pattern for cl-search-result
    const itemElements = html.match(/<li class="cl-search-result"[^>]*>(.*?)<\/li>/gs);
    
    if (itemElements) {
      console.log(`📋 Found ${itemElements.length} cl-search-result elements`);
      
      for (const item of itemElements) {
        // Extract using a.cl-app-anchor and span.result-title, span.result-price
        const linkMatch = item.match(/<a href="([^"]+)" class="cl-app-anchor"[^>]*>/);
        const titleMatch = item.match(/<span class="result-title">([^<]+)<\/span>/);
        const priceMatch = item.match(/<span class="result-price">\$([0-9,]+)<\/span>/);
        
        console.log(`🔍 Link: ${linkMatch?.[1]}, Title: ${titleMatch?.[1]}, Price: ${priceMatch?.[1]}`);
        
        if (linkMatch && titleMatch && priceMatch) {
          const url = linkMatch[1];
          const title = titleMatch[1].trim();
          const price = parseInt(priceMatch[1].replace(/,/g, ''));
          
          if (price > 0 && title && url) {
            const fullUrl = url.startsWith('http') ? url : `https://denver.craigslist.org${url}`;
            listings.push({
              title,
              price,
              location: source,
              url: fullUrl,
              source,
              tier: 1
            });
            console.log(`✅ Successfully extracted: ${title} - $${price}`);
          }
        }
      }
    } else {
      console.log(`❌ No li.cl-search-result elements found in HTML`);
    }

  } catch (error) {
    console.error(`💥 Craigslist parsing error: ${error.message}`);
  }
  
  return listings;
}