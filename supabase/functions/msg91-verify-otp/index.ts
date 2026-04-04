import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function getFriendlyError(code?: number, message?: string): string {
  if (code === 705 || message?.includes("invalid otp")) return "Incorrect OTP. Please check the code and try again.";
  if (code === 706 || message?.includes("expired")) return "OTP has expired. Please request a new one.";
  if (code === 707 || message?.includes("max attempt")) return "Too many attempts. Please request a new OTP.";
  if (message?.includes("mobile not found")) return "Phone number not found. Please go back and re-enter your number.";
  return "Verification failed. Please request a new OTP and try again.";
}

/** Race a promise against a hard timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reqId, otp, phone, country_code = "91" } = await req.json();

    if (!reqId) {
      return new Response(JSON.stringify({ error: "Please go back and re-enter your phone number." }), { status: 400, headers: jsonHeaders });
    }
    if (!otp || !/^\d{4,6}$/.test(otp)) {
      return new Response(JSON.stringify({ error: "Please enter a valid 4-digit OTP." }), { status: 400, headers: jsonHeaders });
    }
    if (!phone || !/^\d{10}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "Invalid phone number." }), { status: 400, headers: jsonHeaders });
    }

    const authKey = Deno.env.get("MSG91_AUTH_KEY");
    const widgetId = Deno.env.get("MSG91_WIDGET_ID");
    const tokenAuth = Deno.env.get("MSG91_TOKEN_AUTH");
    if (!authKey || !widgetId || !tokenAuth) {
      return new Response(JSON.stringify({ error: "OTP service is temporarily unavailable." }), { status: 500, headers: jsonHeaders });
    }

    // ─── Apple reviewer bypass ───
    const isAppleReviewBypass = phone === "0123456789" && reqId === "apple-review-bypass" && otp === "1234";

    if (!isAppleReviewBypass) {
      // ─── 1. Verify OTP via MSG91 (8s hard cap) ───
      let verifyData: any;
      try {
        const res = await withTimeout(
          fetch("https://api.msg91.com/api/v5/widget/verifyOtp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reqId, otp, widgetId, tokenAuth, authkey: authKey }),
          }),
          8000, "MSG91 verify",
        );
        verifyData = await res.json();
        console.log("MSG91 verify:", verifyData.type, "code:", verifyData.code);
      } catch (e: any) {
        console.error("MSG91 verify failed:", e.message);
        return new Response(JSON.stringify({ error: "OTP service temporarily unavailable. Please try again.", recoverable: true }), { status: 503, headers: jsonHeaders });
      }

      // Accept success OR 703 (already verified — recovery)
      if (verifyData.type !== "success" && verifyData.code !== 703) {
        const clearOtp = verifyData.code === 706 || verifyData.code === 707;
        const canResend = clearOtp;
        const restartFlow = verifyData.message?.toLowerCase()?.includes("mobile not found");
        return new Response(JSON.stringify({ error: getFriendlyError(verifyData.code, verifyData.message), clearOtp, canResend, restartFlow }), { status: 400, headers: jsonHeaders });
      }
      if (verifyData.code === 703) console.log("703 recovery — OTP already verified");
    } else {
      console.log("Apple reviewer bypass");
    }

    // ─── 2. OTP verified — mint session ───
    const mobile = `${country_code}${phone}`;
    const syntheticEmail = `${mobile}@phone.sociva.app`;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Try magiclink first (works if user already exists)
    try {
      const { data, error } = await withTimeout(
        adminClient.auth.admin.generateLink({ type: "magiclink", email: syntheticEmail }),
        15000, "generateLink",
      );
      if (!error && data?.properties?.hashed_token) {
        console.log("Existing user — magiclink minted");
        return new Response(JSON.stringify({ success: true, token_hash: data.properties.hashed_token, is_new_user: false }), { headers: jsonHeaders });
      }
      // If error is NOT "user not found", bail
      const msg = (error?.message ?? "").toLowerCase();
      if (error && !msg.includes("not found") && !msg.includes("no user")) {
        console.error("generateLink unexpected error:", error);
        return new Response(JSON.stringify({ error: "Server busy. Please tap Verify again.", recoverable: true }), { status: 503, headers: jsonHeaders });
      }
      console.log("No existing user, creating...");
    } catch (e: any) {
      console.error("generateLink timeout:", e.message);
      return new Response(JSON.stringify({ error: "Server busy. Please tap Verify again.", recoverable: true }), { status: 503, headers: jsonHeaders });
    }

    // Create user (the handle_new_user trigger will attempt profile+role)
    try {
      const { data: newUser, error: createErr } = await withTimeout(
        adminClient.auth.admin.createUser({
          email: syntheticEmail,
          phone: `+${mobile}`,
          phone_confirm: true,
          email_confirm: true,
          user_metadata: { phone: `+${mobile}`, name: "User" },
        }),
        20000, "createUser",
      );

      if (createErr) {
        const msg = (createErr.message ?? "").toLowerCase();
        if (!msg.includes("already") && !msg.includes("duplicate")) {
          console.error("createUser error:", createErr);
          return new Response(JSON.stringify({ error: "Account setup failed. Please tap Verify again.", recoverable: true }), { status: 503, headers: jsonHeaders });
        }
        console.log("createUser duplicate — treating as existing");
      } else {
        console.log("Created user:", newUser?.user?.id);
      }
    } catch (e: any) {
      console.error("createUser timeout:", e.message);
      return new Response(JSON.stringify({ error: "Account setup is slow. Please tap Verify again.", recoverable: true }), { status: 503, headers: jsonHeaders });
    }

    // Now mint magiclink for the (just-created or already-existing) user
    try {
      const { data, error } = await withTimeout(
        adminClient.auth.admin.generateLink({ type: "magiclink", email: syntheticEmail }),
        15000, "generateLink-post-create",
      );
      if (error || !data?.properties?.hashed_token) {
        console.error("generateLink post-create error:", error);
        return new Response(JSON.stringify({ error: "Session creation failed. Please tap Verify again.", recoverable: true }), { status: 503, headers: jsonHeaders });
      }
      return new Response(JSON.stringify({ success: true, token_hash: data.properties.hashed_token, is_new_user: true }), { headers: jsonHeaders });
    } catch (e: any) {
      console.error("generateLink post-create timeout:", e.message);
      return new Response(JSON.stringify({ error: "Server busy. Please tap Verify again.", recoverable: true }), { status: 503, headers: jsonHeaders });
    }
  } catch (error) {
    console.error("Verify OTP error:", error);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again.", recoverable: true }), { status: 500, headers: jsonHeaders });
  }
});
