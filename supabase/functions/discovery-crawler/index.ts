import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GPT_SYSTEM_PROMPT = `
You are an intelligent web researcher focused on finding obscure but active online classifieds, forums, and bulletin boards in the Denver/Colorado region where people may post items for sale. Avoid major marketplaces like Craigslist or Facebook Marketplace.
`;

const GPT_USER_PROMPT = `
Find 5-8 lesser-known online communities or marketplaces in Colorado where people post items for sale.

Return in JSON array format:
[
  {
    "url": "...",
    "name": "...",
    "category": "...", 
    "description": "...",
    "activity_level": 1-10
  }
]
`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return jsonResponse({ error: "Missing OpenAI API key" }, 500);
  }

  let configId: string | null = null;
  try {
    const body = await req.json();
    configId = body?.searchConfigId ?? null;
  } catch {}

  await logActivity(supabase, "discovery-crawler", configId, "started", "Discovery crawler starting");

  try {
    const startTime = Date.now();

    const discoveredSites = await discoverNovelSites(openaiKey);
    const validatedSites = await validateAndScoreSites(discoveredSites);

    let savedCount = 0;

    for (const site of validatedSites) {
      const { error } = await supabase.from("tertiary_sources").upsert({
        url: site.url,
        name: site.name,
        category: site.category,
        region: "denver",
        success_rate: 0,
        freshness_score: site.freshness_score,
        reliability_score: site.reliability_score,
        is_active: true,
        discovered_by: "crawler",
        notes: site.description,
      }, {
        onConflict: "url",
        ignoreDuplicates: true,
      });

      if (!error) savedCount++;
    }

    const duration = Date.now() - startTime;

    await logActivity(supabase, "discovery-crawler", configId, "success", `Saved ${savedCount} sources`, {
      sites_discovered: discoveredSites.length,
      sites_validated: validatedSites.length,
      region: "denver",
    }, savedCount, duration);

    return jsonResponse({ success: true, savedCount, validatedCount: validatedSites.length }, 200);
  } catch (err) {
    console.error("Crawler failure:", err);
    await logActivity(supabase, "discovery-crawler", configId, "failed", err.message || "Unknown error");
    return jsonResponse({ error: err.message }, 500);
  }
});

async function discoverNovelSites(apiKey: string): Promise<any[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4",
      temperature: 0.4,
      messages: [
        { role: "system", content: GPT_SYSTEM_PROMPT },
        { role: "user", content: GPT_USER_PROMPT },
      ],
    }),
  });

  const data = await response.json();
  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to parse GPT response", e);
    return [];
  }
}

async function validateAndScoreSites(sites: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const site of sites) {
    if (!site.url || !site.name) continue;

    try {
      const headRes = await fetch(site.url, { method: "HEAD" });
      if (!headRes.ok) continue;

      const htmlRes = await fetch(site.url);
      const html = await htmlRes.text();

      const scores = scoreSite(html, site);
      out.push({
        ...site,
        freshness_score: scores.freshness,
        reliability_score: scores.reliability,
      });
    } catch {
      continue;
    }

    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }

  return out;
}

function scoreSite(html: string, site: any) {
  const text = html.toLowerCase();
  let freshness = 50, reliability = 50;

  if (text.includes(new Date().getFullYear().toString())) freshness += 20;
  if (text.includes("today") || text.includes("yesterday")) freshness += 15;
  if (text.includes("hour ago") || text.includes("hours ago")) freshness += 25;

  ["for sale", "classified", "marketplace"].forEach(k => { if (text.includes(k)) reliability += 5; });
  ["login", "register", "terms", "privacy", "contact"].forEach(k => { if (text.includes(k)) reliability += 5; });

  if (html.length < 5000) reliability -= 15;

  if (site.activity_level) {
    freshness += Math.min(site.activity_level * 2, 20);
    reliability += Math.min(site.activity_level * 1.5, 15);
  }

  return {
    freshness: Math.max(0, Math.min(100, freshness)),
    reliability: Math.max(0, Math.min(100, reliability)),
  };
}

async function logActivity(client: any, module: string, configId: string | null, status: string, msg: string, metadata: any = {}, sources = 0, time = 0) {
  await client.rpc("log_scrape_activity", {
    p_module_name: module,
    p_search_config_id: configId,
    p_status: status,
    p_message: msg,
    p_listings_found: 0,
    p_sources_processed: sources,
    p_execution_time_ms: time,
    p_metadata: metadata,
  });
}

function jsonResponse(obj: object, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}