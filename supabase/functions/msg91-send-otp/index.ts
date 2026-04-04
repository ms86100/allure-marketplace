import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { getCredential } from "../_shared/credentials.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import {
  computeSendBucket,
  findActiveSendSession,
  createSession,
  updateSessionState,
  cleanupExpiredSessions,
} from "../_shared/phone-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

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
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    if (resend && !reqId) {
      return new Response(
        JSON.stringify({ error: "Missing request ID for resend" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    if (!resend) {
      if (!phone || !/^\d{10}$/.test(phone)) {
        return new Response(
          JSON.stringify({ error: "Invalid phone number. Please provide a 10-digit number." }),
          { status: 400, headers: jsonHeaders }
        );
      }

      // Apple reviewer bypass
      if (phone === "0123456789" && country_code === "91") {
        console.log("Apple reviewer demo phone — returning bypass reqId");
        return new Response(
          JSON.stringify({ success: true, message: "OTP sent", reqId: "apple-review-bypass" }),
          { headers: jsonHeaders }
        );
      }
    }

    // Env-first credential lookup: skip DB when env vars are set
    function getCredentialFast(dbKey: string, envKey: string): Promise<string | undefined> {
      const envVal = Deno.env.get(envKey);
      if (envVal) return Promise.resolve(envVal);
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
      checkRateLimitFast(`otp-send-ip:${clientIp}`, 20, 600),
    ];
    if (!resend && phone) {
      rateLimitChecks.push(checkRateLimitFast(`otp-send:${country_code}${phone}`, 5, 600));
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
        { status: 500, headers: jsonHeaders }
      );
    }

    // --- DB-backed idempotency (replaces in-memory Map) ---
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Opportunistic cleanup (non-blocking)
    cleanupExpiredSessions(adminClient);

    if (!resend && phone) {
      const phoneE164 = `${country_code}${phone}`;
      const sendBucket = computeSendBucket(phoneE164);

      // Check for an active session in this send bucket
      try {
        const existing = await findActiveSendSession(adminClient, phoneE164, sendBucket);
        if (existing) {
          console.log(`DB dedup hit for ${phoneE164} — returning cached reqId`);
          return new Response(
            JSON.stringify({ success: true, message: "OTP sent", reqId: existing.req_id }),
            { headers: jsonHeaders }
          );
        }
      } catch (e) {
        // DB lookup failed — proceed without dedup (safe fallback)
        console.warn("Session dedup check failed, proceeding:", e);
      }
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
        { status: 503, headers: jsonHeaders }
      );
    } finally {
      clearTimeout(apiTimeout);
    }

    if (data.type === "success") {
      const finalReqId = data.reqId || data.message || reqId;

      // Persist session to DB for durable state tracking (non-blocking on failure)
      if (!resend && phone) {
        const phoneE164 = `${country_code}${phone}`;
        const sendBucket = computeSendBucket(phoneE164);
        try {
          await createSession(adminClient, phoneE164, finalReqId, sendBucket, "otp_sent");
        } catch (e) {
          console.warn("Failed to persist auth session (non-critical):", e);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: resend ? "OTP resent" : "OTP sent",
          reqId: finalReqId,
        }),
        { headers: jsonHeaders }
      );
    }

    console.error("MSG91 Widget OTP failed:", JSON.stringify(data));
    return new Response(
      JSON.stringify({ error: data.message || "Failed to send OTP. Please try again." }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (error) {
    console.error("Send OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
