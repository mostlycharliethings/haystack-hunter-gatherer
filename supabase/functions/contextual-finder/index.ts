import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchConfig {
  id: string;
  brand: string;
  model: string;
  qualifier?: string;
  sub_qualifier?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { searchConfigId } = await req.json();
    
    // Get search configuration
    const { data: searchConfig, error: configError } = await supabaseClient
      .from('search_configs')
      .select('*')
      .eq('id', searchConfigId)
      .single();

    if (configError || !searchConfig) {
      throw new Error(`Search config not found: ${configError?.message}`);
    }

    console.log(`Finding contextual sources for: ${searchConfig.brand} ${searchConfig.model}`);

    // Log start
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'contextual-finder',
      p_search_config_id: searchConfigId,
      p_status: 'started',
      p_message: `Finding contextual sources for ${searchConfig.brand} ${searchConfig.model}`
    });

    const startTime = Date.now();

    // Categorize the search using GPT
    const category = await categorizeSearch(searchConfig);
    console.log(`Categorized as: ${category}`);

    // Get secondary marketplaces using GPT
    const marketplaces = await findSecondaryMarketplaces(searchConfig, category, supabaseClient);
    console.log(`Found ${marketplaces.length} potential marketplaces`);

    // Validate each marketplace and save all results
    const marketplaceResults = [];
    for (const marketplace of marketplaces) {
      if (!marketplace.url || !marketplace.name) continue;
      
      let validationPassed = false;
      try {
        // Simple validation - check if site returns 200 OK
        const response = await fetch(marketplace.url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; HaystackBot/1.0)'
          }
        });
        
        if (response.ok) {
          validationPassed = true;
          console.log(`✓ Validated: ${marketplace.name} (${marketplace.url})`);
        } else {
          console.log(`✗ Failed validation: ${marketplace.name} (${response.status})`);
        }
      } catch (error) {
        console.log(`✗ Failed validation: ${marketplace.name} (${error.message})`);
      }
      
      marketplaceResults.push({
        ...marketplace,
        validationPassed
      });
      
      // Rate limiting to be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Store ALL results in secondary_sources
    let savedCount = 0;
    for (const marketplace of marketplaceResults) {
      try {
        const { error } = await supabaseClient
          .from('secondary_sources')
          .insert({
            search_config_id: searchConfigId,
            title: marketplace.name,
            price: 0, // Default price since these are marketplace sources
            location: 'Online',
            source: marketplace.name,
            url: marketplace.url,
            posted_at: new Date().toISOString(),
            context_type: category,
            tier: 2, // Secondary source tier
            validation_passed: marketplace.validationPassed
          });

        if (!error) {
          savedCount++;
          const status = marketplace.validationPassed ? '✓' : '✗';
          console.log(`${status} Saved marketplace: ${marketplace.name} (validation: ${marketplace.validationPassed})`);
        } else {
          console.error(`✗ Failed to save marketplace ${marketplace.name}:`, error);
        }
      } catch (error) {
        console.error('Error saving marketplace:', error);
      }
    }

    const executionTime = Date.now() - startTime;

    // Log completion
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'contextual-finder',
      p_search_config_id: searchConfigId,
      p_status: 'success',
      p_message: `Added ${savedCount} new secondary sources for ${category}`,
      p_listings_found: 0,
      p_sources_processed: savedCount,
      p_execution_time_ms: executionTime,
      p_metadata: {
        category: category,
        marketplaces_found: marketplaces.length,
        marketplaces_validated: marketplaceResults.filter(m => m.validationPassed).length
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        category: category,
        sources_added: savedCount,
        execution_time_ms: executionTime
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Contextual finder error:', error);
    
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

async function categorizeSearch(config: SearchConfig): Promise<string> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const searchTerm = `${config.brand} ${config.model} ${config.qualifier || ''} ${config.sub_qualifier || ''}`.trim();
  
  const prompt = `Categorize this product search into one of these categories: Motorcycle, Camera, Cycling, Automotive, Electronics, Furniture, Musical Instruments, Sports, Tools, Collectibles, Jewelry, Art, Books, Clothing, Home & Garden, or Other.

Product: ${searchTerm}

Return only the category name, nothing else.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 50,
        temperature: 0.1
      })
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }
    
    return 'Other';
  } catch (error) {
    console.error('Error categorizing search:', error);
    return 'Other';
  }
}

async function findSecondaryMarketplaces(config: SearchConfig, category: string, supabase: any): Promise<any[]> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const searchTerm = `${config.brand} ${config.model} ${config.qualifier || ''} ${config.sub_qualifier || ''}`.trim();
  
  // Get existing sources to avoid duplicates
  const existingSources = await getExistingSources(supabase);
  const existingList = existingSources.join(', ');
  
  const prompt = `Find 3-5 specialized online marketplaces where people buy and sell "${searchTerm}" items (category: ${category}). 

Do NOT include these common sites: eBay, Craigslist, Facebook Marketplace, Amazon, Walmart, Target.

AVOID THESE EXISTING SOURCES (we already have them):
${existingList}

Focus on NEW marketplaces not in the existing list above.

For each marketplace, provide:
1. Website URL (must be a real, working website)
2. Site name
3. Brief description

Format as JSON array:
[
  {
    "url": "https://example.com",
    "name": "Site Name", 
    "description": "Brief description"
  }
]

Focus on specialized communities, forums with marketplaces, and niche platforms specific to ${category}.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content.trim();
      
      // Try to parse as JSON
      try {
        const marketplaces = JSON.parse(content);
        return Array.isArray(marketplaces) ? marketplaces : [];
      } catch (parseError) {
        console.error('Failed to parse GPT response as JSON:', parseError);
        return [];
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error finding secondary marketplaces:', error);
    return [];
  }
}

// Helper function to get existing sources from both tables
async function getExistingSources(supabase: any): Promise<string[]> {
  const sources = new Set<string>();
  
  // Get from secondary_sources
  const { data: secondary } = await supabase
    .from('secondary_sources')
    .select('source');
  
  if (secondary) {
    secondary.forEach((s: any) => sources.add(s.source));
  }
  
  // Get from tertiary_sources  
  const { data: tertiary } = await supabase
    .from('tertiary_sources')
    .select('source');
    
  if (tertiary) {
    tertiary.forEach((s: any) => sources.add(s.source));
  }
  
  return Array.from(sources);
}
