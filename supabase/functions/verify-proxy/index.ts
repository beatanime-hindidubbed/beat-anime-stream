// supabase/functions/verify-proxy/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BOT_API_URL = Deno.env.get("BOT_API_URL")!;
const API_SECRET  = Deno.env.get("API_SECRET")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, authorization, X-API-Secret",
};

serve(async (req) => {
  // ── CORS preflight ─────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // ── Read body first ────────────────────────────────
    let bodyObj: Record<string, any> = {};
    let rawBody = "";

    if (req.method === "POST") {
      rawBody = await req.text();
      try {
        bodyObj = JSON.parse(rawBody || "{}");
      } catch {
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid JSON body" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Get action from query string OR body ───────────
    // Frontend sends: /verify-proxy?action=verify
    // We also support { "action": "verify" } in the body as fallback
    const urlObj  = new URL(req.url);
    const action  = urlObj.searchParams.get("action") || bodyObj.action || "";

    if (!action) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing action parameter" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const validActions = ["verify", "check", "status", "revoke"];
    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ── Guard: env vars must be set ────────────────────
    if (!BOT_API_URL || !API_SECRET) {
      return new Response(
        JSON.stringify({ ok: false, error: "bot_unavailable", message: "Service not configured" }),
        { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ── Validate required fields for verify ───────────
    if (action === "verify") {
      if (!bodyObj.device_id) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing required field: device_id" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
      if (!bodyObj.code) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing required field: code" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Build the bot URL — action goes in query string ─
    // Flask route: /telegram-verify?action=verify  (GET or POST both work)
    const targetUrl = `${BOT_API_URL}/telegram-verify?action=${action}`;

    // ── Merge action into body so Flask can also read it from body ─
    // This makes it work regardless of how Flask reads the action
    const forwardBody = JSON.stringify({ ...bodyObj, action });

    // ── Forward to Flask bot ───────────────────────────
    const botResponse = await fetch(targetUrl, {
      method: "POST",           // always POST — Flask handler expects POST for verify/check/revoke
      headers: {
        "Content-Type": "application/json",
        "X-API-Secret": API_SECRET,
      },
      body: forwardBody,
    });

    const responseText = await botResponse.text();

    return new Response(responseText, {
      status:  botResponse.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("verify-proxy error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal Server Error", message: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
