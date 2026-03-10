import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reqId, otp, country_code = "91" } = await req.json();

    if (!reqId) {
      return new Response(
        JSON.stringify({ error: "Missing request ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!otp || !/^\d{4,6}$/.test(otp)) {
      return new Response(
        JSON.stringify({ error: "Invalid OTP format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authKey = Deno.env.get("MSG91_AUTH_KEY");
    const widgetId = Deno.env.get("MSG91_WIDGET_ID");
    const tokenAuth = Deno.env.get("MSG91_TOKEN_AUTH");
    if (!authKey || !widgetId || !tokenAuth) {
      return new Response(
        JSON.stringify({ error: "OTP service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 1. Verify OTP via Widget API ───
    const verifyRes = await fetch("https://api.msg91.com/api/v5/widget/verifyOtp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reqId, otp, widgetId, tokenAuth, authkey: authKey }),
    });
    const verifyData = await verifyRes.json();
    console.log("MSG91 Widget verify response:", JSON.stringify(verifyData));

    if (verifyData.type !== "success" || !verifyData.access_token) {
      // MSG91 sometimes returns the reqId JWT as the message — never forward raw tokens
      const friendlyMsg = (verifyData.type === "error" && verifyData.message && verifyData.message.length < 100)
        ? verifyData.message
        : "Invalid or expired OTP. Please try again.";
      return new Response(
        JSON.stringify({ error: friendlyMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 2. Server-side token validation ───
    const tokenRes = await fetch("https://api.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: verifyData.access_token, widgetId, tokenAuth, authkey: authKey }),
    });
    const tokenData = await tokenRes.json();
    console.log("MSG91 Widget token verify response:", JSON.stringify(tokenData));

    if (tokenData.type !== "success") {
      return new Response(
        JSON.stringify({ error: "Token verification failed. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract verified phone number from token response
    // The identifier comes back as the phone number used during sendOtp (e.g. "91XXXXXXXXXX")
    const verifiedIdentifier = tokenData.identifier || tokenData.mobile || tokenData.phone;
    if (!verifiedIdentifier) {
      console.error("No identifier in token response:", JSON.stringify(tokenData));
      return new Response(
        JSON.stringify({ error: "Could not determine verified phone number" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize: ensure it starts with country code, then format as +CCXXXXXXXXXX
    const cleanIdentifier = verifiedIdentifier.replace(/\D/g, "");
    const mobile = cleanIdentifier.startsWith(country_code)
      ? cleanIdentifier
      : `${country_code}${cleanIdentifier}`;
    const phone = mobile.slice(country_code.length); // 10-digit phone
    const fullPhone = `+${mobile}`;
    const syntheticEmail = `${mobile}@phone.sociva.app`;

    // ─── 3. OTP verified — find or create Supabase user ───
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let isNewUser = false;
    let userEmail = syntheticEmail;

    // Check if a profile exists with this phone
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("phone", fullPhone)
      .maybeSingle();

    if (existingProfile) {
      // Existing user — get their canonical email from auth.users
      const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(existingProfile.id);
      if (authUser?.email) {
        userEmail = authUser.email;
      }
      console.log("Found existing user:", existingProfile.id);
    } else {
      // New user — create via admin API
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
          console.log("User exists with synthetic email, treating as existing user");
          const { data: profileByEmail } = await adminClient
            .from("profiles")
            .select("id")
            .eq("email", syntheticEmail)
            .maybeSingle();

          if (profileByEmail) {
            isNewUser = false;
          } else {
            isNewUser = true;
          }
        } else {
          console.error("Create user error:", createError);
          return new Response(
            JSON.stringify({ error: "Account setup failed. Please try again." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (newUser?.user) {
        const userId = newUser.user.id;

        const { error: profileError } = await adminClient.from("profiles").upsert(
          {
            id: userId,
            email: syntheticEmail,
            phone: fullPhone,
            name: "User",
            flat_number: "",
            block: "",
          },
          { onConflict: "id" }
        );
        if (profileError) {
          console.warn("Profile upsert warning:", profileError.message);
        }

        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({ user_id: userId, role: "buyer" });
        if (roleError && !roleError.message?.includes("duplicate")) {
          console.warn("Role insert warning:", roleError.message);
        }

        console.log("Created new user:", userId);
      }
    }

    // ─── 4. Generate magiclink to establish client session ───
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("Generate link error:", linkError);
      return new Response(
        JSON.stringify({ error: "Session creation failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        token_hash: linkData.properties.hashed_token,
        is_new_user: isNewUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Verify OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
