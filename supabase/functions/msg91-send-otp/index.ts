import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { getCredential } from "../_shared/credentials.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory dedup: prevents duplicate OTPs within 30s per phone (per isolate)
const recentSends = new Map<string, { ts: number; reqId: string }>();
const DEDUP_WINDOW_MS = 30_000;

// Cleanup stale entries periodically (prevent memory leak in long-lived isolates)
function cleanupRecentSends() {
  const now = Date.now();
  for (const [key, val] of recentSends) {
    if (now - val.ts > DEDUP_WINDOW_MS * 2) recentSends.delete(key);
  }
}

// Rate limiter with 2s timeout — skip if DB is slow rather than blocking
async function checkRateLimitFast(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  return Promise.race([
    checkRateLimit(key, maxRequests, windowSeconds),
    new Promise<{ allowed: boolean; remaining: number }>((resolve) =>
      setTimeout(() => resolve({ allowed: true, remaining: maxRequests }), 2000)
    ),
  ]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, country_code = "91", resend = false, reqId } = await req.json();
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (resend && !reqId) {
      return new Response(
        JSON.stringify({ error: "Missing request ID for resend" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resend) {
      if (!phone || !/^\d{10}$/.test(phone)) {
        return new Response(
          JSON.stringify({ error: "Invalid phone number. Please provide a 10-digit number." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Apple reviewer bypass
      if (phone === "0123456789" && country_code === "91") {
        console.log("Apple reviewer demo phone — returning bypass reqId");
        return new Response(
          JSON.stringify({ success: true, message: "OTP sent", reqId: "apple-review-bypass" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Env-first credential lookup: skip DB when env vars are set (common case)
    function getCredentialFast(dbKey: string, envKey: string): Promise<string | undefined> {
      const envVal = Deno.env.get(envKey);
      if (envVal) return Promise.resolve(envVal);
      // DB fallback with 3s timeout
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      return Promise.race([
        getCredential(adminClient, dbKey, envKey),
        new Promise<undefined>((_, rej) => setTimeout(() => rej(new Error("db-timeout")), 3000)),
      ]).catch(() => undefined);
    }

    // Run rate limits AND credential lookups in parallel
    const rateLimitChecks: Promise<any>[] = [
      checkRateLimit(`otp-send-ip:${clientIp}`, 20, 600),
    ];
    if (!resend && phone) {
      rateLimitChecks.push(checkRateLimit(`otp-send:${country_code}${phone}`, 5, 600));
    }

    const [credResults, ...rlResults] = await Promise.all([
      Promise.all([
        getCredentialFast("msg91_auth_key", "MSG91_AUTH_KEY"),
        getCredentialFast("msg91_widget_id", "MSG91_WIDGET_ID"),
        getCredentialFast("msg91_token_auth", "MSG91_TOKEN_AUTH"),
      ]),
      ...rateLimitChecks,
    ]);

    // Check rate limits
    for (const rl of rlResults) {
      if (!rl.allowed) return rateLimitResponse(corsHeaders);
    }

    const [authKey, widgetId, tokenAuth] = credResults;

    if (!authKey || !widgetId || !tokenAuth) {
      console.error("MSG91 Widget credentials not configured (checked DB + env)");
      return new Response(
        JSON.stringify({ error: "OTP service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let data: any;

    // 5s timeout on outbound MSG91 API calls
    const apiController = new AbortController();
    const apiTimeout = setTimeout(() => apiController.abort(), 5000);

    try {
      if (resend) {
        const retryRes = await fetch("https://api.msg91.com/api/v5/widget/retryOtp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reqId, retryChannel: 11, authkey: authKey, widgetId, tokenAuth }),
          signal: apiController.signal,
        });
        data = await retryRes.json();
        console.log("MSG91 Widget retry response:", JSON.stringify(data));
      } else {
        const identifier = `${country_code}${phone}`;
        const sendRes = await fetch("https://api.msg91.com/api/v5/widget/sendOtp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, widgetId, tokenAuth, authkey: authKey }),
          signal: apiController.signal,
        });
        data = await sendRes.json();
        console.log("MSG91 Widget send response:", JSON.stringify(data));
      }
    } catch (e: any) {
      console.error("MSG91 API call failed:", e.message);
      return new Response(
        JSON.stringify({ error: "OTP service temporarily unavailable. Please try again." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(apiTimeout);
    }

    if (data.type === "success") {
      return new Response(
        JSON.stringify({
          success: true,
          message: resend ? "OTP resent" : "OTP sent",
          reqId: data.reqId || data.message || reqId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error("MSG91 Widget OTP failed:", JSON.stringify(data));
    return new Response(
      JSON.stringify({ error: data.message || "Failed to send OTP. Please try again." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
