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
  year_start?: number;
  year_end?: number;
  price_threshold: number;
  price_multiplier: number;
  location?: string;
  email: string;
  created_at: string;
}

interface ListingSummary {
  search_config_id: string;
  search_name: string;
  email: string;
  listings: {
    under_100_miles: number;
    miles_101_500: number;
    miles_500_plus: number;
    under_threshold: number;
    threshold_to_max: number;
    total_new: number;
  };
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

    const { type, searchConfigId, configs, to, searchTerm, listingUrl, price } = await req.json();

    console.log(`Notifier triggered for type: ${type}`);

    // Log start
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'notifier',
      p_search_config_id: searchConfigId || null,
      p_status: 'started',
      p_message: `Starting ${type} notification`
    });

    const startTime = Date.now();
    let emailsSent = 0;
    const errors = [];

    if (type === 'confirmation' && searchConfigId) {
      // Send confirmation email for new SearchSpec
      const result = await sendConfirmationEmail(supabaseClient, searchConfigId);
      emailsSent = result.success ? 1 : 0;
      if (!result.success) {
        errors.push(result.error);
      }
    } else if (type === 'daily_digest') {
      // Send daily digest emails
      const result = await sendDailyDigest(supabaseClient, configs);
      emailsSent = result.emailsSent;
      errors.push(...result.errors);
    } else if (type === 'listing_found') {
      // Send listing alert email
      const result = await sendListingAlert({ to, searchTerm, listingUrl, price });
      emailsSent = result.success ? 1 : 0;
      if (!result.success) {
        errors.push(result.error);
      }
    } else {
      throw new Error(`Unknown notification type: ${type}`);
    }

    const executionTime = Date.now() - startTime;

    // Log completion
    await supabaseClient.rpc('log_scrape_activity', {
      p_module_name: 'notifier',
      p_search_config_id: searchConfigId || null,
      p_status: errors.length === 0 ? 'success' : 'partial_success',
      p_message: `Sent ${emailsSent} emails. ${errors.length} errors.`,
      p_listings_found: 0,
      p_sources_processed: emailsSent,
      p_execution_time_ms: executionTime,
      p_metadata: {
        type: type,
        emails_sent: emailsSent,
        errors: errors
      }
    });

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        emails_sent: emailsSent,
        errors: errors,
        execution_time_ms: executionTime
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Notifier error:', error);
    
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

async function sendConfirmationEmail(supabaseClient: any, searchConfigId: string): Promise<{ success: boolean, error?: string }> {
  try {
    // Get search configuration
    const { data: searchConfig, error: configError } = await supabaseClient
      .from('search_configs')
      .select('*')
      .eq('id', searchConfigId)
      .single();

    if (configError || !searchConfig) {
      return { success: false, error: `Search config not found: ${configError?.message}` };
    }

    // Get average market price using GPT (optional enhancement)
    const averagePrice = await getAverageMarketPrice(searchConfig);

    const searchTerm = `${searchConfig.brand} ${searchConfig.model} ${searchConfig.qualifier || ''} ${searchConfig.sub_qualifier || ''}`.trim();
    const maxPrice = Math.round(searchConfig.price_threshold * searchConfig.price_multiplier);

    const emailHtml = generateConfirmationEmailHtml({
      searchTerm,
      priceRange: `$${searchConfig.price_threshold.toLocaleString()} - $${maxPrice.toLocaleString()}`,
      location: searchConfig.location || 'Your browser location',
      averagePrice,
      yearRange: searchConfig.year_start && searchConfig.year_end 
        ? `${searchConfig.year_start}-${searchConfig.year_end}`
        : null
    });

    const emailResult = await sendEmail({
      to: searchConfig.email,
      subject: `Search Confirmation: ${searchTerm}`,
      html: emailHtml
    });

    return emailResult;
  } catch (error) {
    console.error('Confirmation email error:', error);
    return { success: false, error: error.message };
  }
}

async function sendDailyDigest(supabaseClient: any, configIds?: string[]): Promise<{ emailsSent: number, errors: string[] }> {
  let emailsSent = 0;
  const errors = [];

  try {
    // Get search configs (either specified ones or all active)
    let query = supabaseClient
      .from('search_configs')
      .select('*')
      .eq('is_active', true);

    if (configIds && configIds.length > 0) {
      query = query.in('id', configIds);
    }

    const { data: searchConfigs, error: configError } = await query;

    if (configError) {
      errors.push(`Failed to get search configs: ${configError.message}`);
      return { emailsSent, errors };
    }

    if (!searchConfigs || searchConfigs.length === 0) {
      return { emailsSent, errors };
    }

    // Group configs by email address
    const configsByEmail = searchConfigs.reduce((acc: any, config: any) => {
      if (!config.email) return acc;
      
      if (!acc[config.email]) {
        acc[config.email] = [];
      }
      acc[config.email].push(config);
      return acc;
    }, {});

    // Send digest email to each unique email address
    for (const [email, configs] of Object.entries(configsByEmail)) {
      try {
        const digestData = await buildDigestData(supabaseClient, configs as SearchConfig[]);
        
        if (digestData.some((d: any) => d.listings.total_new > 0)) {
          const emailHtml = generateDigestEmailHtml(digestData);
          const emailResult = await sendEmail({
            to: email,
            subject: `Daily Haystack Digest - ${new Date().toLocaleDateString()}`,
            html: emailHtml
          });

          if (emailResult.success) {
            emailsSent++;
          } else {
            errors.push(`Failed to send digest to ${email}: ${emailResult.error}`);
          }
        } else {
          console.log(`No new listings for ${email}, skipping digest`);
        }
      } catch (error) {
        errors.push(`Error processing digest for ${email}: ${error.message}`);
      }
    }

  } catch (error) {
    errors.push(`Daily digest error: ${error.message}`);
  }

  return { emailsSent, errors };
}

async function buildDigestData(supabaseClient: any, configs: SearchConfig[]): Promise<ListingSummary[]> {
  const digestData: ListingSummary[] = [];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  for (const config of configs) {
    try {
      // Get new listings from the last 24 hours
      const { data: newListings, error } = await supabaseClient
        .from('listings')
        .select('*')
        .eq('search_config_id', config.id)
        .gte('created_at', yesterday.toISOString());

      if (error) {
        console.error(`Error getting listings for config ${config.id}:`, error);
        continue;
      }

      const listings = newListings || [];
      const maxPrice = Math.round(config.price_threshold * config.price_multiplier);

      const summary: ListingSummary = {
        search_config_id: config.id,
        search_name: `${config.brand} ${config.model} ${config.qualifier || ''} ${config.sub_qualifier || ''}`.trim(),
        email: config.email,
        listings: {
          under_100_miles: listings.filter((l: any) => l.distance < 100).length,
          miles_101_500: listings.filter((l: any) => l.distance >= 100 && l.distance <= 500).length,
          miles_500_plus: listings.filter((l: any) => l.distance > 500).length,
          under_threshold: listings.filter((l: any) => l.price < config.price_threshold).length,
          threshold_to_max: listings.filter((l: any) => l.price >= config.price_threshold && l.price <= maxPrice).length,
          total_new: listings.length
        }
      };

      digestData.push(summary);
    } catch (error) {
      console.error(`Error building digest data for config ${config.id}:`, error);
    }
  }

  return digestData;
}

async function sendListingAlert({ to, searchTerm, listingUrl, price }: { to: string, searchTerm: string, listingUrl: string, price: number }): Promise<{ success: boolean, error?: string }> {
  try {
    const emailHtml = generateListingAlertEmailHtml({ searchTerm, listingUrl, price });

    const emailResult = await sendEmail({
      to: to,
      subject: `🎯 New listing found: ${searchTerm} - $${price.toLocaleString()}`,
      html: emailHtml
    });

    return emailResult;
  } catch (error) {
    console.error('Listing alert email error:', error);
    return { success: false, error: error.message };
  }
}

async function sendEmail({ to, subject, html }: { to: string, subject: string, html: string }): Promise<{ success: boolean, error?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  
  if (!resendApiKey) {
    return { success: false, error: 'Resend API key not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Haystack Hunter <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: html
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`Email sent successfully to ${to}:`, result.id);
      return { success: true };
    } else {
      const error = await response.text();
      console.error(`Failed to send email to ${to}:`, error);
      return { success: false, error: error };
    }
  } catch (error) {
    console.error(`Email sending error for ${to}:`, error);
    return { success: false, error: error.message };
  }
}

async function getAverageMarketPrice(searchConfig: SearchConfig): Promise<string | null> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    return null;
  }

  const searchTerm = `${searchConfig.brand} ${searchConfig.model} ${searchConfig.qualifier || ''} ${searchConfig.sub_qualifier || ''}`.trim();
  
  const prompt = `What is the typical market price range for a used ${searchTerm}${searchConfig.year_start ? ` from ${searchConfig.year_start}` : ''}? 

Provide a brief, helpful price range estimate in this format: "Typically $X,XXX - $X,XXX" or "Average around $X,XXX". Keep it under 20 words.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.1
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('Error getting average market price:', error);
    return null;
  }
}

function generateListingAlertEmailHtml({ searchTerm, listingUrl, price }: { searchTerm: string, listingUrl: string, price: number }): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Listing Alert</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { color: #FCD34D; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .alert-box { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 20px; border-radius: 6px; margin: 20px 0; text-align: center; }
    .listing-details { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .cta-button { display: inline-block; background: #FCD34D; color: #1f2937; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔍 Feed Me Haystacks</div>
      <h1 style="color: #212529; margin: 0;">New Listing Found!</h1>
    </div>
    
    <div class="alert-box">
      <h2 style="margin: 0; color: #155724;">🎯 Match Found!</h2>
      <p style="margin: 10px 0 0 0;">We found a new listing that matches your search criteria.</p>
    </div>
    
    <div class="listing-details">
      <h3 style="margin-top: 0; color: #495057;">Listing Details</h3>
      <p><strong>Item:</strong> ${searchTerm}</p>
      <p><strong>Price:</strong> $${price.toLocaleString()}</p>
    </div>
    
    <div style="text-align: center;">
      <a href="${listingUrl}" class="cta-button" target="_blank" rel="noopener">View Listing →</a>
    </div>
    
    <p><strong>Act fast!</strong> Popular items can sell quickly. Click the link above to view the full listing and contact the seller.</p>
    
    <div class="footer">
      <p>Happy hunting! 🎯<br>
      The Haystack Team</p>
    </div>
  </div>
</body>
</html>`;
}

function generateConfirmationEmailHtml({ searchTerm, priceRange, location, averagePrice, yearRange }: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Search Confirmation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { color: #FCD34D; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .config-details { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
    .detail-row:last-child { border-bottom: none; }
    .label { font-weight: 600; color: #495057; }
    .value { color: #212529; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔍 Feed Me Haystacks</div>
      <h1 style="color: #212529; margin: 0;">Search Configuration Confirmed</h1>
    </div>
    
    <p>Your search has been successfully configured and is now active. We'll start hunting for listings that match your criteria!</p>
    
    <div class="config-details">
      <h3 style="margin-top: 0; color: #495057;">Search Details</h3>
      
      <div class="detail-row">
        <span class="label">What we're looking for:</span>
        <span class="value"><strong>${searchTerm}</strong></span>
      </div>
      
      <div class="detail-row">
        <span class="label">Price range:</span>
        <span class="value">${priceRange}</span>
      </div>
      
      ${yearRange ? `
      <div class="detail-row">
        <span class="label">Years:</span>
        <span class="value">${yearRange}</span>
      </div>
      ` : ''}
      
      <div class="detail-row">
        <span class="label">Search location:</span>
        <span class="value">${location}</span>
      </div>
      
      ${averagePrice ? `
      <div class="detail-row">
        <span class="label">Market insight:</span>
        <span class="value">${averagePrice}</span>
      </div>
      ` : ''}
    </div>
    
    <p><strong>What happens next?</strong></p>
    <ul>
      <li>We'll search major marketplaces (Facebook, Craigslist, eBay) and specialized sites</li>
      <li>New listings will appear in your dashboard as we find them</li>
      <li>You'll receive a daily digest email with any new discoveries</li>
      <li>Our searches run automatically 5 times per day</li>
    </ul>
    
    <p>You can manage your searches, view listings, and adjust settings anytime at <a href="https://haystacks.charliescheid.com">haystacks.charliescheid.com</a></p>
    
    <div class="footer">
      <p>Happy hunting! 🎯<br>
      The Haystack Team</p>
    </div>
  </div>
</body>
</html>`;
}

function generateDigestEmailHtml(digestData: ListingSummary[]): string {
  const totalListings = digestData.reduce((sum, d) => sum + d.listings.total_new, 0);
  const date = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  let searchSummaries = '';
  for (const data of digestData) {
    if (data.listings.total_new > 0) {
      searchSummaries += `
      <div class="search-summary">
        <h3 style="color: #495057; margin: 0 0 10px 0;">${data.search_name}</h3>
        <div class="summary-stats">
          <div class="stat-row">
            <span class="stat-label">🎯 New listings found:</span>
            <span class="stat-value"><strong>${data.listings.total_new}</strong></span>
          </div>
          
          ${data.listings.under_100_miles > 0 ? `
          <div class="stat-row">
            <span class="stat-label">📍 Within 100 miles:</span>
            <span class="stat-value">${data.listings.under_100_miles}</span>
          </div>
          ` : ''}
          
          ${data.listings.miles_101_500 > 0 ? `
          <div class="stat-row">
            <span class="stat-label">🚗 101-500 miles:</span>
            <span class="stat-value">${data.listings.miles_101_500}</span>
          </div>
          ` : ''}
          
          ${data.listings.miles_500_plus > 0 ? `
          <div class="stat-row">
            <span class="stat-label">✈️ 500+ miles:</span>
            <span class="stat-value">${data.listings.miles_500_plus}</span>
          </div>
          ` : ''}
          
          ${data.listings.under_threshold > 0 ? `
          <div class="stat-row">
            <span class="stat-label">💰 Under budget:</span>
            <span class="stat-value">${data.listings.under_threshold}</span>
          </div>
          ` : ''}
          
          ${data.listings.threshold_to_max > 0 ? `
          <div class="stat-row">
            <span class="stat-label">💵 In target range:</span>
            <span class="stat-value">${data.listings.threshold_to_max}</span>
          </div>
          ` : ''}
        </div>
      </div>`;
    }
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Haystack Digest</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { color: #FCD34D; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .search-summary { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #FCD34D; }
    .summary-stats { margin-top: 15px; }
    .stat-row { display: flex; justify-content: space-between; padding: 5px 0; }
    .stat-label { color: #495057; }
    .stat-value { color: #212529; font-weight: 500; }
    .cta-button { display: inline-block; background: #FCD34D; color: #1F2937; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔍 Feed Me Haystacks</div>
      <h1 style="color: #212529; margin: 0;">Daily Digest - ${date}</h1>
    </div>
    
    ${totalListings > 0 ? `
    <p>Great news! We found <strong>${totalListings} new listing${totalListings === 1 ? '' : 's'}</strong> that match your search criteria.</p>
    
    ${searchSummaries}
    
    <div style="text-align: center;">
      <a href="https://haystacks.charliescheid.com" class="cta-button">View All Listings</a>
    </div>
    ` : `
    <p>No new listings found today, but don't worry - we're still hunting! Our searches run 5 times daily across multiple marketplaces.</p>
    
    <p>Consider adjusting your price range or search terms if you'd like to see more results.</p>
    
    <div style="text-align: center;">
      <a href="https://haystacks.charliescheid.com" class="cta-button">Manage Your Searches</a>
    </div>
    `}
    
    <div class="footer">
      <p>Happy hunting! 🎯<br>
      <a href="https://haystacks.charliescheid.com">haystacks.charliescheid.com</a></p>
    </div>
  </div>
</body>
</html>`;
}