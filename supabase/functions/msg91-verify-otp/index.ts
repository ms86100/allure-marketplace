import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { getCredential } from "../_shared/credentials.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function getFriendlyError(code?: number, message?: string): string {
  if (code === 705 || message?.includes("invalid otp")) return "Incorrect OTP. Please check the code and try again.";
  if (code === 706 || message?.includes("expired")) return "OTP has expired. Please request a new OTP.";
  if (code === 707 || message?.includes("max attempt")) return "Too many attempts. Please request a new OTP.";
  if (message?.includes("mobile not found")) return "Phone number not found. Please go back and re-enter your number.";
  return "Verification failed. Please request a new OTP and try again.";
}

function getErrorFlags(code?: number, message?: string) {
  const normalized = message?.toLowerCase() || "";
  const canResend = code === 706 || code === 707;
  const clearOtp = code === 706 || code === 707;
  const restartFlow = normalized.includes("mobile not found");
  return { canResend, clearOtp, restartFlow };
}

function userErrorResponse(
  error: string,
  options: { code?: number; canResend?: boolean; clearOtp?: boolean; restartFlow?: boolean } = {},
) {
  return new Response(
    JSON.stringify({ success: false, error, ...options }),
    { status: 200, headers: jsonHeaders },
  );
}

async function checkRateLimitFast(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  return Promise.race([
    checkRateLimit(key, maxRequests, windowSeconds),
    new Promise<{ allowed: boolean; remaining: number }>((resolve) =>
      setTimeout(() => resolve({ allowed: true, remaining: maxRequests }), 2000)
    ),
  ]);
}

function getCredentialFast(dbKey: string, envKey: string): Promise<string | undefined> {
  const envVal = Deno.env.get(envKey);
  if (envVal) return Promise.resolve(envVal);

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    if (!reqId) {
      return userErrorResponse("OTP session expired. Please request a new OTP.", {
        canResend: true,
        clearOtp: true,
        restartFlow: true,
      });
    }
    if (!otp || !/^\d{4,6}$/.test(otp)) {
      return userErrorResponse("Please enter a valid 4-digit OTP.");
    }
    if (!phone || !/^\d{10}$/.test(phone)) {
      return userErrorResponse("Invalid phone number.", { restartFlow: true });
    }

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
      return userErrorResponse("Too many verification attempts. Please request a new OTP.", {
        canResend: true,
        clearOtp: true,
      });
    }
    if (!ipRl.allowed) {
      return userErrorResponse("Too many attempts. Please wait a moment and try again.");
    }

    const [authKey, widgetId, tokenAuth] = credResults;

    if (!authKey || !widgetId || !tokenAuth) {
      return new Response(
        JSON.stringify({ error: "OTP service is temporarily unavailable. Please try again later." }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const isAppleReviewBypass = phone === "0123456789" && reqId === "apple-review-bypass" && otp === "1234";

    if (isAppleReviewBypass) {
      console.log("Apple reviewer bypass — skipping MSG91 verification for demo phone");
    } else {
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

        if (verifyData.type === "success") {
          console.log("MSG91 OTP verified successfully");
        } else if (verifyData.code === 703) {
          // 703 = "already verified" — OTP was valid and consumed (likely by a previous timed-out request).
          // This is a RECOVERY path, not a failure. Proceed to session creation.
          console.log("OTP already verified (703) — recovering session, proceeding to login");
        } else {
          return userErrorResponse(
            getFriendlyError(verifyData.code, verifyData.message),
            { code: verifyData.code, ...getErrorFlags(verifyData.code, verifyData.message) },
          );
        }
      } catch (e: any) {
        console.error("MSG91 verify API call failed:", e.message);
        return new Response(
          JSON.stringify({ error: "OTP service temporarily unavailable. Please try again." }),
          { status: 503, headers: jsonHeaders },
        );
      } finally {
        clearTimeout(apiTimeout);
      }
    }

    // --- Session creation (with 522 HTML response protection) ---
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const mobile = `${country_code}${phone}`;
    const fullPhone = `+${mobile}`;
    const syntheticEmail = `${mobile}@phone.sociva.app`;
    let isNewUser = false;

    let linkData: any;
    let linkError: any;

    try {
      const result = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: syntheticEmail,
      });
      linkData = result.data;
      linkError = result.error;
    } catch (err: any) {
      console.error("generateLink crashed (likely 522 HTML response):", err.message);
      return new Response(
        JSON.stringify({ error: "Server busy. Please try again in a moment." }),
        { status: 503, headers: jsonHeaders },
      );
    }

    if (linkError || !linkData?.properties?.hashed_token) {
      const linkErrMessage = linkError?.message?.toLowerCase() || "";
      const shouldCreateUser =
        linkErrMessage.includes("not found") ||
        linkErrMessage.includes("no user") ||
        linkErrMessage.includes("invalid") ||
        !linkData?.properties?.hashed_token;

      if (!shouldCreateUser) {
        console.error("Generate link error:", linkError);
        return new Response(
          JSON.stringify({ error: "Session creation failed. Please try again." }),
          { status: 500, headers: jsonHeaders },
        );
      }

      let createError: any;
      let newUser: any;

      try {
        const createResult = await adminClient.auth.admin.createUser({
          email: syntheticEmail,
          phone: fullPhone,
          phone_confirm: true,
          email_confirm: true,
          user_metadata: { phone: fullPhone, name: "User" },
        });
        newUser = createResult.data;
        createError = createResult.error;
      } catch (err: any) {
        console.error("createUser crashed (likely 522 HTML response):", err.message);
        return new Response(
          JSON.stringify({ error: "Server busy. Please try again in a moment." }),
          { status: 503, headers: jsonHeaders },
        );
      }

      if (createError) {
        const createErrMessage = createError.message?.toLowerCase() || "";
        if (!createErrMessage.includes("already") && !createErrMessage.includes("duplicate")) {
          console.error("Create user error:", createError);
          return new Response(
            JSON.stringify({ error: "Account setup failed. Please try again." }),
            { status: 500, headers: jsonHeaders },
          );
        }
      } else if (newUser?.user) {
        isNewUser = true;
        const userId = newUser.user.id;
        const [profileRes, roleRes] = await Promise.all([
          adminClient.from("profiles").upsert(
            { id: userId, email: syntheticEmail, phone: fullPhone, name: "User", flat_number: "", block: "" },
            { onConflict: "id" },
          ),
          adminClient.from("user_roles").insert({ user_id: userId, role: "buyer" }),
        ]);

        if (profileRes.error) console.warn("Profile upsert warning:", profileRes.error.message);
        if (roleRes.error && !roleRes.error.message?.includes("duplicate")) {
          console.warn("Role insert warning:", roleRes.error.message);
        }

        console.log("Created new user:", userId);
      }

      try {
        const retryLinkResult = await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: syntheticEmail,
        });
        linkData = retryLinkResult.data;
        linkError = retryLinkResult.error;
      } catch (err: any) {
        console.error("generateLink retry crashed:", err.message);
        return new Response(
          JSON.stringify({ error: "Server busy. Please try again in a moment." }),
          { status: 503, headers: jsonHeaders },
        );
      }

      if (linkError || !linkData?.properties?.hashed_token) {
        console.error("Generate link retry error:", linkError);
        return new Response(
          JSON.stringify({ error: "Session creation failed. Please try again." }),
          { status: 500, headers: jsonHeaders },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, token_hash: linkData.properties.hashed_token, is_new_user: isNewUser }),
      { headers: jsonHeaders },
    );
  } catch (error) {
    console.error("Verify OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
