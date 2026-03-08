import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type } = await req.json();

    if (type === "censored_check") {
      // Check recent censored comments (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: censored, count } = await supabase
        .from("comments")
        .select("id, content, user_id, anime_id, episode_id, created_at", { count: "exact" })
        .eq("is_censored", true)
        .gte("created_at", oneHourAgo);

      // Check total comments in last hour for spike detection
      const { count: totalRecent } = await supabase
        .from("comments")
        .select("id", { count: "exact" })
        .gte("created_at", oneHourAgo);

      const censoredCount = count || 0;
      const totalCount = totalRecent || 0;
      const censorRate = totalCount > 0 ? censoredCount / totalCount : 0;
      const isSpike = censoredCount >= 5 || censorRate > 0.3;

      // Log to admin_logs if spike detected
      if (isSpike) {
        await supabase.from("admin_logs").insert({
          admin_id: "00000000-0000-0000-0000-000000000000",
          action: "comment_censor_spike",
          details: `${censoredCount} censored comments in last hour (${Math.round(censorRate * 100)}% rate). Total: ${totalCount}`,
        });

        // Store alert in site_settings for admin dashboard
        await supabase.from("site_settings").upsert({
          key: "last_censor_alert",
          value: {
            count: censoredCount,
            total: totalCount,
            rate: Math.round(censorRate * 100),
            timestamp: new Date().toISOString(),
            samples: (censored || []).slice(0, 5).map(c => ({
              content: c.content.slice(0, 50),
              anime_id: c.anime_id,
              episode_id: c.episode_id,
            })),
          },
        }, { onConflict: "key" });
      }

      return new Response(JSON.stringify({
        success: true,
        censored_count: censoredCount,
        total_count: totalCount,
        censor_rate: Math.round(censorRate * 100),
        is_spike: isSpike,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
