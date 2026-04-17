import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { withAuth } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { getCredential, createAdminClient } from "../_shared/credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Strict VPA regex: handle 2-256 chars, no leading/trailing dots/specials,
// provider must start with letter, 2-64 chars
const VPA_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,254}[a-zA-Z0-9])?@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

type ValidationStatus = "valid" | "invalid" | "unavailable" | "error";

interface ValidationResult {
  status: ValidationStatus;
  customer_name?: string;
  vpa: string;
  provider?: string;
  reason?: string;
}

async function logValidation(
  admin: any,
  userId: string,
  vpa: string,
  result: ValidationResult,
  sellerId?: string
) {
  try {
    await admin.from("upi_validation_logs").insert({
      user_id: userId,
      seller_id: sellerId ?? null,
      vpa,
      status: result.status,
      customer_name: result.customer_name ?? null,
      provider: result.provider ?? null,
      reason: result.reason ?? null,
    });
  } catch (e) {
    console.warn("Failed to write upi_validation_logs:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await withAuth(req, corsHeaders);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  // Rate limit: 5 / 60s per user
  const rl = await checkRateLimit(`upi-validate:${userId}`, 5, 60);
  if (!rl.allowed) return rateLimitResponse(corsHeaders);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const vpa: string = String(body?.vpa ?? "").trim();
  const sellerId: string | undefined = body?.seller_id;

  const admin = createAdminClient();

  // Format pre-check
  if (!vpa || !VPA_REGEX.test(vpa)) {
    const result: ValidationResult = {
      status: "invalid",
      vpa,
      reason: "Invalid UPI ID format",
    };
    await logValidation(admin, userId, vpa, result, sellerId);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const provider = vpa.split("@")[1]?.toLowerCase();

  // Load Razorpay credentials
  const keyId = await getCredential(admin, "razorpay_key_id", "RAZORPAY_KEY_ID");
  const keySecret = await getCredential(
    admin,
    "razorpay_key_secret",
    "RAZORPAY_KEY_SECRET"
  );

  if (!keyId || !keySecret) {
    const result: ValidationResult = {
      status: "unavailable",
      vpa,
      provider,
      reason: "UPI validation service is not configured",
    };
    await logValidation(admin, userId, vpa, result, sellerId);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Known UPI provider handles whitelist (Tier 2 fallback)
  const PROVIDER_WHITELIST = new Set([
    "paytm", "ybl", "okaxis", "oksbi", "okhdfcbank", "okicici", "ibl", "axl",
    "upi", "ptsbi", "ptyes", "fbl", "jupiteraxis", "slc", "hdfcbank", "sbi",
    "icici", "kotak", "federal", "idfcbank", "abfspay", "airtel", "jio",
    "freecharge", "payzapp", "postbank", "allbank", "andb", "barodampay",
    "cnrb", "cboi", "dlb", "indianbank", "indus", "mahb", "pingpay", "rbl",
    "sib", "ubi", "uco", "vijb", "yesbankltd", "yesbank", "axisbank",
    "axisb", "apl", "aubank", "barodapay", "boi", "centralbank", "citi",
    "dbs", "dcb", "equitas", "hsbc", "idbi", "indianb", "iob", "karurvysya",
    "kbl", "kvb", "obc", "pnb", "psb", "rmhdfcbank", "sc", "tjsb", "uboi",
    "unitedbank", "utbi", "yapl", "amazonpay", "apay", "phonepe", "ezeepay",
    "myicici", "okbizicici", "wahdfcbank", "navi",
  ]);

  const tier2Fallback = async (
    upstreamReason?: string
  ): Promise<Response> => {
    const isKnown = provider && PROVIDER_WHITELIST.has(provider);
    const result: ValidationResult = {
      status: "unavailable",
      vpa,
      provider,
      reason: isKnown
        ? "Holder name verification unavailable for this payment provider. You can save and verify later."
        : upstreamReason ||
          "Unknown UPI provider. Please double-check the handle.",
    };
    await logValidation(admin, userId, vpa, result, sellerId);

    // Persist as unverified — never mark valid without a real registered_name
    if (sellerId) {
      try {
        await admin
          .from("seller_profiles")
          .update({
            upi_id: vpa,
            upi_provider: provider ?? null,
            upi_verification_status: "unverified",
          })
          .eq("id", sellerId);
      } catch (e) {
        console.warn("Failed to persist UPI (tier 2):", e);
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  // Tier 1: RazorpayX Fund Account Validation
  try {
    const basic = btoa(`${keyId}:${keySecret}`);
    const rzpRes = await fetch(
      "https://api.razorpay.com/v1/fund_accounts/validations",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: { type: "vpa", vpa: { address: vpa } },
          currency: "INR",
        }),
      }
    );

    const rzpJson: any = await rzpRes.json().catch(() => ({}));
    console.log("Razorpay FAV response:", rzpRes.status, JSON.stringify(rzpJson));

    if (!rzpRes.ok) {
      const desc: string = String(rzpJson?.error?.description ?? "").toLowerCase();
      const featureDisabled =
        rzpRes.status === 404 ||
        rzpRes.status === 401 ||
        rzpRes.status === 403 ||
        /not enabled|not activated|not allowed|fund account|feature|access|merchant|razorpayx/i.test(
          desc
        );

      if (featureDisabled) {
        return await tier2Fallback(rzpJson?.error?.description);
      }

      // Genuine invalid VPA from Razorpay
      const isInvalid =
        rzpRes.status === 400 &&
        /invalid|vpa/i.test(desc);

      if (isInvalid) {
        const result: ValidationResult = {
          status: "invalid",
          vpa,
          provider,
          reason: rzpJson?.error?.description || "Invalid UPI ID",
        };
        await logValidation(admin, userId, vpa, result, sellerId);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Unknown upstream error — degrade to tier 2
      return await tier2Fallback(
        rzpJson?.error?.description || `Razorpay returned ${rzpRes.status}`
      );
    }

    const favStatus = rzpJson?.status;
    const accountStatus = rzpJson?.results?.account_status;
    const registeredName = rzpJson?.results?.registered_name;

    if (favStatus === "completed" && accountStatus === "active") {
      const result: ValidationResult = {
        status: "valid",
        vpa,
        customer_name: registeredName ?? undefined,
        provider,
      };
      await logValidation(admin, userId, vpa, result, sellerId);

      if (sellerId) {
        try {
          await admin
            .from("seller_profiles")
            .update({
              upi_id: vpa,
              upi_holder_name: registeredName ?? null,
              upi_provider: provider ?? null,
              upi_verified_at: new Date().toISOString(),
              upi_verification_status: "valid",
            })
            .eq("id", sellerId);
        } catch (e) {
          console.warn("Failed to persist UPI verification:", e);
        }
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // FAV completed but account not active → invalid
    if (favStatus === "completed" && accountStatus && accountStatus !== "active") {
      const result: ValidationResult = {
        status: "invalid",
        vpa,
        provider,
        reason: `UPI account is ${accountStatus}`,
      };
      await logValidation(admin, userId, vpa, result, sellerId);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unexpected shape → tier 2
    return await tier2Fallback("Unexpected response from payment provider");
  } catch (e: any) {
    console.error("UPI validation error:", e);
    const result: ValidationResult = {
      status: "error",
      vpa,
      provider,
      reason: e?.message ?? "Network error",
    };
    await logValidation(admin, userId, vpa, result, sellerId);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
