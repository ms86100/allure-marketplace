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

// Race a promise against a timeout — returns the result or throws
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
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
      return new Response(JSON.stringify({ error: "OTP service is temporarily unavailable. Please try again later." }), { status: 500, headers: jsonHeaders });
    }

    // ─── Apple reviewer bypass ───
    const isAppleReviewBypass = phone === "0123456789" && reqId === "apple-review-bypass" && otp === "1234";

    if (!isAppleReviewBypass) {
      // ─── 1. Verify OTP via Widget API (8s timeout) ───
      let verifyData: any;
      try {
        const verifyRes = await withTimeout(
          fetch("https://api.msg91.com/api/v5/widget/verifyOtp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reqId, otp, widgetId, tokenAuth, authkey: authKey }),
          }),
          8000,
          "MSG91 verify"
        );
        verifyData = await verifyRes.json();
        console.log("MSG91 verify response type:", verifyData.type, "code:", verifyData.code);
      } catch (e: any) {
        console.error("MSG91 verify API call failed:", e.message);
        return new Response(
          JSON.stringify({ error: "OTP service temporarily unavailable. Please try again.", recoverable: true }),
          { status: 503, headers: jsonHeaders },
        );
      }

      // Accept success OR 703 (already verified — recovery path)
      if (verifyData.type !== "success" && verifyData.code !== 703) {
        const clearOtp = verifyData.code === 706 || verifyData.code === 707;
        const canResend = verifyData.code === 706 || verifyData.code === 707;
        const restartFlow = verifyData.message?.toLowerCase()?.includes("mobile not found");
        return new Response(
          JSON.stringify({ error: getFriendlyError(verifyData.code, verifyData.message), clearOtp, canResend, restartFlow }),
          { status: 400, headers: jsonHeaders }
        );
      }

      if (verifyData.code === 703) {
        console.log("OTP already verified (703) — recovering session");
      }
    } else {
      console.log("Apple reviewer bypass — skipping MSG91 verification");
    }

    // OTP verified — build user identity
    const mobile = `${country_code}${phone}`;
    const fullPhone = `+${mobile}`;
    const syntheticEmail = `${mobile}@phone.sociva.app`;

    // ─── 2. Find or create Supabase user (each DB call gets its own timeout) ───
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let isNewUser = false;
    let userEmail = syntheticEmail;

    // Profile lookup — 5s timeout
    let existingProfile: any = null;
    try {
      const { data } = await withTimeout(
        adminClient.from("profiles").select("id, email").eq("phone", fullPhone).maybeSingle(),
        5000,
        "Profile lookup"
      );
      existingProfile = data;
    } catch (e: any) {
      console.warn("Profile lookup slow, trying by email:", e.message);
      // Fallback: try by synthetic email (faster index path)
      try {
        const { data } = await withTimeout(
          adminClient.from("profiles").select("id, email").eq("email", syntheticEmail).maybeSingle(),
          5000,
          "Profile email lookup"
        );
        existingProfile = data;
      } catch {
        console.warn("Profile email lookup also failed, will try to create user");
      }
    }

    if (existingProfile) {
      // Try to get the real email from auth if available
      try {
        const { data: { user: authUser } } = await withTimeout(
          adminClient.auth.admin.getUserById(existingProfile.id),
          5000,
          "Auth user lookup"
        );
        if (authUser?.email) userEmail = authUser.email;
      } catch (e: any) {
        console.warn("Auth user lookup slow, using synthetic email:", e.message);
      }
      console.log("Found existing user:", existingProfile.id);
    } else {
      isNewUser = true;

      try {
        const { data: newUser, error: createError } = await withTimeout(
          adminClient.auth.admin.createUser({
            email: syntheticEmail,
            phone: fullPhone,
            phone_confirm: true,
            email_confirm: true,
            user_metadata: { phone: fullPhone, name: "User" },
          }),
          10000,
          "Create user"
        );

        if (createError) {
          if (createError.message?.includes("already") || createError.message?.includes("duplicate")) {
            console.log("User exists with synthetic email, treating as existing");
            isNewUser = false;
          } else {
            console.error("Create user error:", createError);
            return new Response(
              JSON.stringify({ error: "Account setup failed. Please try again.", recoverable: true }),
              { status: 500, headers: jsonHeaders }
            );
          }
        } else if (newUser?.user) {
          const userId = newUser.user.id;
          // Profile + role inserts — fire and don't block on them
          adminClient.from("profiles").upsert(
            { id: userId, email: syntheticEmail, phone: fullPhone, name: "User", flat_number: "", block: "" },
            { onConflict: "id" }
          ).then(({ error }) => { if (error) console.warn("Profile upsert warning:", error.message); });

          adminClient.from("user_roles").insert({ user_id: userId, role: "buyer" })
            .then(({ error }) => { if (error && !error.message?.includes("duplicate")) console.warn("Role insert warning:", error.message); });

          console.log("Created new user:", userId);
        }
      } catch (e: any) {
        console.error("Create user timed out:", e.message);
        return new Response(
          JSON.stringify({ error: "Account setup is slow. Please tap Verify again.", recoverable: true }),
          { status: 503, headers: jsonHeaders }
        );
      }
    }

    // ─── 3. Generate magiclink session (15s timeout) ───
    try {
      const { data: linkData, error: linkError } = await withTimeout(
        adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: userEmail,
        }),
        15000,
        "Generate link"
      );

      if (linkError || !linkData?.properties?.hashed_token) {
        console.error("Generate link error:", linkError);
        return new Response(
          JSON.stringify({ error: "Session creation failed. Please tap Verify again.", recoverable: true }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, token_hash: linkData.properties.hashed_token, is_new_user: isNewUser }),
        { headers: jsonHeaders }
      );
    } catch (e: any) {
      console.error("Generate link timed out:", e.message);
      return new Response(
        JSON.stringify({ error: "Server busy. Please tap Verify again.", recoverable: true }),
        { status: 503, headers: jsonHeaders }
      );
    }
  } catch (error) {
    console.error("Verify OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again.", recoverable: true }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
