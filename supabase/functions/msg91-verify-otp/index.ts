import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { getCredential } from "../_shared/credentials.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";
import {
  computeSendBucket,
  createSession,
  findSessionByReqId,
  updateSessionState,
  incrementVerifyAttempts,
  type PhoneAuthSession,
} from "../_shared/phone-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

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
  return jsonResponse({ success: false, error, ...options });
}

function recoverableResponse(
  message: string,
  options: Record<string, unknown> = {},
) {
  return jsonResponse({ success: false, recoverable: true, pending: true, message, ...options });
}

/** Race a promise against a hard timeout. Returns undefined on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) =>
      setTimeout(() => {
        console.warn(`[timeout] ${label} exceeded ${ms}ms`);
        resolve(undefined);
      }, ms)
    ),
  ]);
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

  return Promise.race([
    getCredential(adminClient, dbKey, envKey),
    new Promise<undefined>((_, rej) => setTimeout(() => rej(new Error("db-timeout")), 3000)),
  ]).catch(() => undefined);
}

function runInBackground(promise: Promise<unknown>, label: string): void {
  const guarded = promise.catch((error) => {
    console.warn(`[background] ${label} failed:`, error?.message || error);
  });
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(guarded);
  }
}

async function markProviderVerified(
  session: PhoneAuthSession | null,
  phoneE164: string,
  reqId: string,
): Promise<PhoneAuthSession | null> {
  const providerVerifiedAt = new Date().toISOString();

  if (session) {
    await updateSessionState(adminClient, session.id, "provider_verified", {
      provider_verified_at: providerVerifiedAt,
    });

    return {
      ...session,
      state: "provider_verified",
      provider_verified_at: providerVerifiedAt,
    };
  }

  return createSession(
    adminClient,
    phoneE164,
    reqId,
    computeSendBucket(phoneE164),
    "provider_verified",
  );
}

async function finalizeSignIn(
  session: PhoneAuthSession | null,
  fullPhone: string,
  syntheticEmail: string,
): Promise<{ token_hash: string; is_new_user: boolean } | null> {
  if (session?.state === "session_ready" && session.token_hash) {
    return { token_hash: session.token_hash, is_new_user: false };
  }

  let isNewUser = false;

  const generateLinkSafe = async () => {
    return adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
    });
  };

  const failRecoverably = async (code: string, message: string) => {
    if (session) {
      await updateSessionState(adminClient, session.id, "auth_retryable_failure", {
        last_error_code: code,
        last_error_message: message.slice(0, 200),
      });
    }
    return null;
  };

  let linkData: any;
  let linkError: any;

  try {
    const result = await withTimeout(generateLinkSafe(), 10000, "generateLink");
    if (!result) {
      return await failRecoverably("timeout", "generateLink timed out");
    }
    linkData = result.data;
    linkError = result.error;
  } catch (err: any) {
    console.error("generateLink crashed:", err.message);
    return await failRecoverably("522", err.message || "generateLink crashed");
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
      return await failRecoverably("link_error", linkError?.message || "generateLink failed");
    }

    try {
      const createResult = await withTimeout(
        adminClient.auth.admin.createUser({
          email: syntheticEmail,
          phone: fullPhone,
          phone_confirm: true,
          email_confirm: true,
          user_metadata: { phone: fullPhone, name: "User" },
        }),
        10000,
        "createUser",
      );

      if (!createResult) {
        return await failRecoverably("timeout_create", "createUser timed out");
      }

      const newUser = createResult.data;
      const createError = createResult.error;

      if (createError) {
        const createErrMessage = createError.message?.toLowerCase() || "";
        if (!createErrMessage.includes("already") && !createErrMessage.includes("duplicate")) {
          console.error("Create user error:", createError);
          return await failRecoverably("create_failed", createError.message || "createUser failed");
        }
      } else if (newUser?.user) {
        isNewUser = true;
        const userId = newUser.user.id;

        Promise.all([
          adminClient.from("profiles").upsert(
            { id: userId, email: syntheticEmail, phone: fullPhone, name: "User", flat_number: "", block: "" },
            { onConflict: "id" },
          ),
          adminClient.from("user_roles").insert({ user_id: userId, role: "buyer" }),
        ]).catch((error) => {
          console.warn("Profile/role setup warning (non-critical):", error?.message || error);
        });

        if (session) {
          updateSessionState(adminClient, session.id, "provider_verified", {
            user_id: userId,
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      console.error("createUser crashed:", err.message);
      return await failRecoverably("522_create", err.message || "createUser crashed");
    }

    try {
      const retryResult = await withTimeout(generateLinkSafe(), 10000, "generateLink-retry");
      if (!retryResult) {
        return await failRecoverably("timeout_retry", "generateLink retry timed out");
      }
      linkData = retryResult.data;
      linkError = retryResult.error;
    } catch (err: any) {
      console.error("generateLink retry crashed:", err.message);
      return await failRecoverably("522_retry", err.message || "generateLink retry crashed");
    }

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("Generate link retry error:", linkError);
      return await failRecoverably("link_retry_failed", linkError?.message || "generateLink retry failed");
    }
  }

  const tokenHash = linkData.properties.hashed_token;

  if (session) {
    await updateSessionState(adminClient, session.id, "session_ready", {
      token_hash: tokenHash,
      last_error_code: null,
      last_error_message: null,
    });
  }

  return { token_hash: tokenHash, is_new_user: isNewUser };
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
        canResend: true, clearOtp: true, restartFlow: true,
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
        canResend: true, clearOtp: true,
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

    // ── STATE MACHINE: Load durable session (fast timeout, optional) ──
    const session = await withTimeout(
      findSessionByReqId(adminClient, reqId).catch(() => null),
      1200,
      "findSessionByReqId"
    ) ?? null;

    const isAppleReviewBypass = phone === "0123456789" && reqId === "apple-review-bypass" && otp === "1234";
    const phoneE164 = `${country_code}${phone}`;
    const mobile = `${country_code}${phone}`;
    const fullPhone = `+${mobile}`;
    const syntheticEmail = `${mobile}@phone.sociva.app`;

    // Determine if we need to call MSG91
    const skipProvider =
      isAppleReviewBypass ||
      session?.state === "session_ready" ||
      session?.state === "provider_verified" ||
      session?.state === "auth_retryable_failure";

    if (skipProvider) {
      if (isAppleReviewBypass) {
        console.log("Apple reviewer bypass — skipping MSG91 verification");
      } else if (session?.state === "session_ready" && session.token_hash) {
        console.log("Session already ready — returning cached token hash");
      } else {
        console.log(`Session state is '${session!.state}' — skipping MSG91, proceeding to auth recovery`);
      }
    } else {
      // Track verify attempts (fire-and-forget)
      if (session) {
        incrementVerifyAttempts(adminClient, session.id, session.verify_attempts).catch(() => {});
      }

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

        if (verifyData.type === "success" || verifyData.code === 703) {
          if (verifyData.code === 703) {
            console.log("OTP already verified (703) — recovering session");
          } else {
            console.log("MSG91 OTP verified successfully");
          }

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

    let recoverySession = session;

    if (!isAppleReviewBypass && (!session || session.state !== "session_ready")) {
      const markVerifiedPromise = markProviderVerified(session, phoneE164, reqId);
      runInBackground(markVerifiedPromise, "persist provider_verified");
      recoverySession = await withTimeout(markVerifiedPromise, 1200, "markProviderVerified") ?? session;
    }

    const finalizePromise = finalizeSignIn(recoverySession, fullPhone, syntheticEmail);
    const immediateResult = await withTimeout(finalizePromise, 2500, "finalizeSignIn-fast");

    if (immediateResult?.token_hash) {
      return jsonResponse({
        success: true,
        token_hash: immediateResult.token_hash,
        is_new_user: immediateResult.is_new_user,
      });
    }

    runInBackground(finalizePromise, "finalize sign-in");

    return recoverableResponse("OTP verified. Finishing sign-in…", {
      verified: true,
      is_new_user: false,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
