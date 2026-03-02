const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOT_API = "https://beat-verification-bot.onrender.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (!action) {
    return new Response(JSON.stringify({ error: "Missing action parameter" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const BOT_SECRET = Deno.env.get("BOT_API_SECRET") || "";

  try {
    let botUrl = `${BOT_API}?action=${action}`;
    const method = req.method;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Secret": BOT_SECRET,
    };

    let body: string | undefined;
    if (method === "POST") {
      body = await req.text();
    }

    const botRes = await fetch(botUrl, { method, headers, body });
    const data = await botRes.text();

    return new Response(data, {
      status: botRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Proxy error", details: String(err) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
