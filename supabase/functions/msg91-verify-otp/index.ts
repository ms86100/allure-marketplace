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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isUserNotFoundError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return message.includes("user") && message.includes("not found");
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return message.includes("already") || message.includes("duplicate");
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

    const isAppleReviewBypass = phone === "0123456789" && reqId === "apple-review-bypass" && otp === "1234";

    if (!isAppleReviewBypass) {
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
      } catch (error: any) {
        console.error("MSG91 verify API call failed:", error.message);
        return new Response(
          JSON.stringify({ error: "OTP service temporarily unavailable. Please try again.", recoverable: true }),
          { status: 503, headers: jsonHeaders },
        );
      }

      if (verifyData.type !== "success" && verifyData.code !== 703) {
        const clearOtp = verifyData.code === 706 || verifyData.code === 707;
        const canResend = verifyData.code === 706 || verifyData.code === 707;
        const restartFlow = verifyData.message?.toLowerCase()?.includes("mobile not found");

        return new Response(
          JSON.stringify({ error: getFriendlyError(verifyData.code, verifyData.message), clearOtp, canResend, restartFlow }),
          { status: 400, headers: jsonHeaders },
        );
      }

      if (verifyData.code === 703) {
        console.log("OTP already verified (703) — recovering session");
      }
    } else {
      console.log("Apple reviewer bypass — skipping MSG91 verification");
    }

    const mobile = `${country_code}${phone}`;
    const fullPhone = `+${mobile}`;
    const syntheticEmail = `${mobile}@phone.sociva.app`;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const generateMagicLink = async () => {
      const { data, error } = await withTimeout(
        adminClient.auth.admin.generateLink({ type: "magiclink", email: syntheticEmail }),
        12000,
        "Generate link"
      );
      return { data, error };
    };

    let isNewUser = false;

    try {
      const { data, error } = await generateMagicLink();
      if (!error && data?.properties?.hashed_token) {
        console.log("Recovered existing auth user via synthetic email");
        return new Response(
          JSON.stringify({ success: true, token_hash: data.properties.hashed_token, is_new_user: false }),
          { headers: jsonHeaders },
        );
      }

      if (error && !isUserNotFoundError(error)) {
        console.error("Generate link error before create:", error);
        return new Response(
          JSON.stringify({ error: "Server busy. Please tap Verify again.", recoverable: true }),
          { status: 503, headers: jsonHeaders },
        );
      }

      console.log("No auth user found for synthetic email, creating one now");
    } catch (error: any) {
      console.error("Generate link timed out before create:", error.message);
      return new Response(
        JSON.stringify({ error: "Server busy. Please tap Verify again.", recoverable: true }),
        { status: 503, headers: jsonHeaders },
      );
    }

    let createdUserId: string | null = null;

    try {
      const { data, error } = await withTimeout(
        adminClient.auth.admin.createUser({
          email: syntheticEmail,
          phone: fullPhone,
          phone_confirm: true,
          email_confirm: true,
          user_metadata: { phone: fullPhone, name: "User" },
        }),
        15000,
        "Create user"
      );

      if (error) {
        if (!isAlreadyExistsError(error)) {
          console.error("Create user error:", error);
          return new Response(
            JSON.stringify({ error: "Account setup is slow. Please tap Verify again.", recoverable: true }),
            { status: 503, headers: jsonHeaders },
          );
        }

        console.log("Create user reported duplicate/already-exists; retrying magiclink recovery");
      } else if (data?.user?.id) {
        isNewUser = true;
        createdUserId = data.user.id;
        console.log("Created new auth user:", createdUserId);

        void withTimeout(
          adminClient.from("profiles").upsert(
            { id: createdUserId, email: syntheticEmail, phone: fullPhone, name: "User", flat_number: "", block: "" },
            { onConflict: "id" }
          ),
          2000,
          "Profile upsert"
        ).catch((error) => console.warn("Profile upsert warning:", error.message));

        void withTimeout(
          adminClient.from("user_roles").insert({ user_id: createdUserId, role: "buyer" }),
          2000,
          "Role insert"
        ).catch((error) => {
          if (!String(error?.message ?? "").toLowerCase().includes("duplicate")) {
            console.warn("Role insert warning:", error.message);
          }
        });
      }
    } catch (error: any) {
      console.error("Create user timed out:", error.message);
      return new Response(
        JSON.stringify({ error: "Account setup is slow. Please tap Verify again.", recoverable: true }),
        { status: 503, headers: jsonHeaders },
      );
    }

    try {
      const { data, error } = await generateMagicLink();
      if (error || !data?.properties?.hashed_token) {
        console.error("Generate link error after create:", error);
        return new Response(
          JSON.stringify({ error: "Session creation failed. Please tap Verify again.", recoverable: true }),
          { status: 503, headers: jsonHeaders },
        );
      }

      return new Response(
        JSON.stringify({ success: true, token_hash: data.properties.hashed_token, is_new_user: isNewUser }),
        { headers: jsonHeaders },
      );
    } catch (error: any) {
      console.error("Generate link timed out after create:", error.message);
      return new Response(
        JSON.stringify({ error: "Server busy. Please tap Verify again.", recoverable: true }),
        { status: 503, headers: jsonHeaders },
      );
    }
  } catch (error) {
    console.error("Verify OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again.", recoverable: true }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
