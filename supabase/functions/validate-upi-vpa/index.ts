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

  // Call Razorpay
  try {
    const basic = btoa(`${keyId}:${keySecret}`);
    const rzpRes = await fetch(
      "https://api.razorpay.com/v1/payments/validate/vpa",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vpa }),
      }
    );

    const rzpJson: any = await rzpRes.json().catch(() => ({}));

    if (!rzpRes.ok) {
      // Razorpay returns 400 for invalid VPA in many cases
      const isInvalid =
        rzpRes.status === 400 ||
        rzpJson?.error?.code === "BAD_REQUEST_ERROR" ||
        rzpJson?.error?.reason === "invalid_vpa";
      const result: ValidationResult = {
        status: isInvalid ? "invalid" : "error",
        vpa,
        provider,
        reason:
          rzpJson?.error?.description ||
          `Razorpay returned ${rzpRes.status}`,
      };
      await logValidation(admin, userId, vpa, result, sellerId);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (rzpJson?.success === true) {
      const result: ValidationResult = {
        status: "valid",
        vpa: rzpJson.vpa ?? vpa,
        customer_name: rzpJson.customer_name ?? undefined,
        provider,
      };
      await logValidation(admin, userId, vpa, result, sellerId);

      // If seller_id provided, persist verification on seller_profiles
      if (sellerId) {
        try {
          await admin
            .from("seller_profiles")
            .update({
              upi_id: result.vpa,
              upi_holder_name: result.customer_name ?? null,
              upi_provider: result.provider ?? null,
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

    const result: ValidationResult = {
      status: "invalid",
      vpa,
      provider,
      reason: "Razorpay rejected this UPI ID",
    };
    await logValidation(admin, userId, vpa, result, sellerId);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
