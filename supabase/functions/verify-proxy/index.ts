// supabase/functions/verify-proxy/index.ts
//
// Proxy that forwards verification requests from the frontend
// to the Flask bot API running on Render (or any host).
//
// Required env vars (set via `supabase secrets set`):
//   BOT_API_URL   — e.g. https://tg-verify-bot.onrender.com
//   API_SECRET    — must match API_SECRET in your bot's config.py
//
// Deploy:
//   supabase functions deploy verify-proxy --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BOT_API_URL = Deno.env.get("BOT_API_URL")!;  // e.g. https://your-bot.onrender.com
const API_SECRET  = Deno.env.get("API_SECRET")!;   // same as in your Flask config.py

// ── CORS headers returned on every response ───────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, authorization, X-API-Secret",
};

serve(async (req) => {
  // ── Handle CORS preflight ──────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const url    = new URL(req.url);
    const action = url.searchParams.get("action");

    if (!action) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing action parameter" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ── Validate action is one we support ─────────────
    const validActions = ["verify", "check", "status", "revoke"];
    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({ ok: false, error: `Unknown action: ${action}. Valid: ${validActions.join(" | ")}` }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ── Check bot is configured ────────────────────────
    if (!BOT_API_URL || !API_SECRET) {
      console.error("Missing BOT_API_URL or API_SECRET env vars");
      return new Response(
        JSON.stringify({ ok: false, error: "bot_unavailable", message: "Service not configured" }),
        { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ── Build target URL on the bot ────────────────────
    const targetUrl = `${BOT_API_URL}/telegram-verify?action=${action}`;

    // ── Read and forward the request body ─────────────
    let body: string | undefined;
    if (req.method === "POST") {
      body = await req.text();

      // Extra safety: make sure device_id is present for verify action
      // If frontend forgot it, return a clear error instead of forwarding
      if (action === "verify") {
        try {
          const parsed = JSON.parse(body || "{}");
          if (!parsed.device_id) {
            return new Response(
              JSON.stringify({ ok: false, error: "Missing required field: device_id" }),
              { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
            );
          }
          if (!parsed.code) {
            return new Response(
              JSON.stringify({ ok: false, error: "Missing required field: code" }),
              { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
            );
          }
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid JSON body" }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // ── Forward to bot with API secret ────────────────
    const botResponse = await fetch(targetUrl, {
      method:  req.method,
      headers: {
        "Content-Type":  "application/json",
        "X-API-Secret":  API_SECRET,
      },
      body,
    });

    const responseText = await botResponse.text();

    // ── Pass bot response back to frontend ────────────
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
