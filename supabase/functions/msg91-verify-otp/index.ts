import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { getCredential } from "../_shared/credentials.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function getFriendlyError(code?: number, message?: string): string {
  if (code === 703 || message?.includes("already verif")) return "This OTP has already been used. Please request a new one.";
  if (code === 705 || message?.includes("invalid otp")) return "Incorrect OTP. Please check the code and try again.";
  if (code === 706 || message?.includes("expired")) return "OTP has expired. Please request a new one.";
  if (code === 707 || message?.includes("max attempt")) return "Too many attempts. Please request a new OTP.";
  if (message?.includes("mobile not found")) return "Phone number not found. Please go back and re-enter your number.";
  return "Verification failed. Please request a new OTP and try again.";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reqId, otp, phone, country_code = "91" } = await req.json();
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (!reqId) {
      return new Response(JSON.stringify({ error: "Please go back and re-enter your phone number." }), { status: 400, headers: jsonHeaders });
    }
    if (!otp || !/^\d{4,6}$/.test(otp)) {
      return new Response(JSON.stringify({ error: "Please enter a valid 4-digit OTP." }), { status: 400, headers: jsonHeaders });
    }
    if (!phone || !/^\d{10}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "Invalid phone number." }), { status: 400, headers: jsonHeaders });
    }

    // Run rate limits (with 2s timeout) AND credential lookups (env-first) in parallel
    const [credResults, reqRl, ipRl] = await Promise.all([
      Promise.all([
        getCredentialFast("msg91_auth_key", "MSG91_AUTH_KEY"),
        getCredentialFast("msg91_widget_id", "MSG91_WIDGET_ID"),
        getCredentialFast("msg91_token_auth", "MSG91_TOKEN_AUTH"),
      ]),
      checkRateLimitFast(`otp-verify:${reqId}`, 10, 600),
      checkRateLimitFast(`otp-verify-ip:${clientIp}`, 30, 600),
    ]);

    if (!reqRl.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many verification attempts. Please request a new OTP." }),
        { status: 429, headers: jsonHeaders }
      );
    }
    if (!ipRl.allowed) return rateLimitResponse(corsHeaders);

    const [authKey, widgetId, tokenAuth] = credResults;

    if (!authKey || !widgetId || !tokenAuth) {
      return new Response(JSON.stringify({ error: "OTP service is temporarily unavailable. Please try again later." }), { status: 500, headers: jsonHeaders });
    }

    // ─── 1. Verify OTP (5s timeout) ───
    const isAppleReviewBypass = phone === "0123456789" && reqId === "apple-review-bypass" && otp === "1234";

    if (!isAppleReviewBypass) {
      const apiController = new AbortController();
      const apiTimeout = setTimeout(() => apiController.abort(), 5000);
      try {
        const verifyRes = await fetch("https://api.msg91.com/api/v5/widget/verifyOtp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reqId, otp, widgetId, tokenAuth, authkey: authKey }),
          signal: apiController.signal,
        });
        const verifyData = await verifyRes.json();
        console.log("MSG91 verify response type:", verifyData.type, "code:", verifyData.code);

        if (verifyData.type !== "success") {
          return new Response(
            JSON.stringify({ error: getFriendlyError(verifyData.code, verifyData.message) }),
            { status: 400, headers: jsonHeaders }
          );
        }
      } catch (e: any) {
        console.error("MSG91 verify API call failed:", e.message);
        return new Response(
          JSON.stringify({ error: "OTP service temporarily unavailable. Please try again." }),
          { status: 503, headers: jsonHeaders }
        );
      } finally {
        clearTimeout(apiTimeout);
      }
    } else {
      console.log("Apple reviewer bypass — skipping MSG91 verification for demo phone");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const mobile = `${country_code}${phone}`;
    const fullPhone = `+${mobile}`;
    const syntheticEmail = `${mobile}@phone.sociva.app`;

    // ─── 2. Find or create Supabase user ───
    let isNewUser = false;
    let userEmail = syntheticEmail;

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("phone", fullPhone)
      .maybeSingle();

    if (existingProfile) {
      const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(existingProfile.id);
      if (authUser?.email) userEmail = authUser.email;
      console.log("Found existing user:", existingProfile.id);
    } else {
      isNewUser = true;

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        phone: fullPhone,
        phone_confirm: true,
        email_confirm: true,
        user_metadata: { phone: fullPhone, name: "User" },
      });

      if (createError) {
        if (createError.message?.includes("already") || createError.message?.includes("duplicate")) {
          console.log("User exists with synthetic email, treating as existing");
          const { data: profileByEmail } = await adminClient
            .from("profiles").select("id").eq("email", syntheticEmail).maybeSingle();
          isNewUser = !profileByEmail;
        } else {
          console.error("Create user error:", createError);
          return new Response(
            JSON.stringify({ error: "Account setup failed. Please try again." }),
            { status: 500, headers: jsonHeaders }
          );
        }
      } else if (newUser?.user) {
        const userId = newUser.user.id;
        const [profileRes, roleRes] = await Promise.all([
          adminClient.from("profiles").upsert(
            { id: userId, email: syntheticEmail, phone: fullPhone, name: "User", flat_number: "", block: "" },
            { onConflict: "id" }
          ),
          adminClient.from("user_roles").insert({ user_id: userId, role: "buyer" }),
        ]);
        if (profileRes.error) console.warn("Profile upsert warning:", profileRes.error.message);
        if (roleRes.error && !roleRes.error.message?.includes("duplicate")) console.warn("Role insert warning:", roleRes.error.message);

        console.log("Created new user:", userId);
      }
    }

    // ─── 3. Generate magiclink session ───
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("Generate link error:", linkError);
      return new Response(
        JSON.stringify({ error: "Session creation failed. Please try again." }),
        { status: 500, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: true, token_hash: linkData.properties.hashed_token, is_new_user: isNewUser }),
      { headers: jsonHeaders }
    );
  } catch (error) {
    console.error("Verify OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
