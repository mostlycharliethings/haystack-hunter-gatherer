import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PriceSuggestionRequest {
  brand: string;
  model: string;
  qualifier?: string;
  sub_qualifier?: string;
  year_start?: number;
  year_end?: number;
  location?: string;
}

interface PriceSuggestion {
  suggested_threshold: number;
  conservative_threshold: number;
  aggressive_threshold: number;
  multiplier_suggestion: number;
  market_analysis: string;
  reasoning: string;
  price_range: {
    low: number;
    average: number;
    high: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const body: PriceSuggestionRequest = await req.json();
    
    console.log('Getting price suggestions for:', body);

    // Build vehicle description
    const vehicleDescription = [
      body.brand,
      body.model,
      body.qualifier,
      body.sub_qualifier
    ].filter(Boolean).join(' ');

    const yearRange = body.year_start && body.year_end 
      ? `${body.year_start}-${body.year_end}` 
      : body.year_start 
        ? `${body.year_start}` 
        : 'various years';

    const location = body.location || 'United States';

    // Create AI prompt for market analysis
    const prompt = `You are an expert automotive market analyst. Please analyze the current market for the following vehicle and provide pricing recommendations:

Vehicle: ${vehicleDescription}
Year Range: ${yearRange}
Location: ${location}

Please provide a comprehensive market analysis and return ONLY a JSON object with this exact structure:

{
  "suggested_threshold": [recommended price threshold for finding good deals],
  "conservative_threshold": [higher threshold for safer searches],
  "aggressive_threshold": [lower threshold for exceptional deals only],
  "multiplier_suggestion": [decimal between 0.7-0.95 for deal alerting],
  "market_analysis": "[2-3 sentence overview of current market conditions]",
  "reasoning": "[explanation of why these thresholds were chosen]",
  "price_range": {
    "low": [typical lowest market price],
    "average": [average market price],
    "high": [typical highest market price]
  }
}

Consider:
- Current market trends and demand
- Depreciation patterns for this vehicle
- Regional price variations
- Seasonal factors
- Vehicle condition expectations
- Supply and demand dynamics

Provide realistic price recommendations in USD. Make sure all numbers are integers (no decimals except for multiplier_suggestion).`;

    console.log('Sending request to OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: 'You are an expert automotive market analyst with access to current market data. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    console.log('OpenAI response:', aiResponse);

    // Parse the JSON response
    let priceSuggestion: PriceSuggestion;
    try {
      priceSuggestion = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // Fallback response
      priceSuggestion = {
        suggested_threshold: 25000,
        conservative_threshold: 30000,
        aggressive_threshold: 20000,
        multiplier_suggestion: 0.85,
        market_analysis: "Unable to analyze specific market data at this time.",
        reasoning: "Providing general recommendations based on typical market patterns.",
        price_range: {
          low: 18000,
          average: 25000,
          high: 35000
        }
      };
    }

    // Validate and sanitize the response
    const sanitizedResponse = {
      suggested_threshold: Math.round(Number(priceSuggestion.suggested_threshold) || 25000),
      conservative_threshold: Math.round(Number(priceSuggestion.conservative_threshold) || 30000),
      aggressive_threshold: Math.round(Number(priceSuggestion.aggressive_threshold) || 20000),
      multiplier_suggestion: Number(priceSuggestion.multiplier_suggestion) || 0.85,
      market_analysis: String(priceSuggestion.market_analysis || "Market analysis unavailable"),
      reasoning: String(priceSuggestion.reasoning || "Standard market recommendations"),
      price_range: {
        low: Math.round(Number(priceSuggestion.price_range?.low) || 18000),
        average: Math.round(Number(priceSuggestion.price_range?.average) || 25000),
        high: Math.round(Number(priceSuggestion.price_range?.high) || 35000)
      },
      vehicle_description: vehicleDescription,
      year_range: yearRange
    };

    console.log('Returning price suggestions:', sanitizedResponse);

    return new Response(
      JSON.stringify(sanitizedResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Price suggestion error:', error);
    
    return new Response(
      JSON.stringify({
        error: error.message,
        fallback: {
          suggested_threshold: 25000,
          conservative_threshold: 30000,
          aggressive_threshold: 20000,
          multiplier_suggestion: 0.85,
          market_analysis: "Unable to provide market analysis due to technical error.",
          reasoning: "Please set thresholds based on your research or try again later.",
          price_range: {
            low: 18000,
            average: 25000,
            high: 35000
          }
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});