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
    const { phone, otp, country_code = "91" } = await req.json();

    if (!phone || !/^\d{10}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
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
    if (!authKey) {
      return new Response(
        JSON.stringify({ error: "OTP service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mobile = `${country_code}${phone}`;
    const fullPhone = `+${mobile}`;
    const syntheticEmail = `${mobile}@phone.sociva.app`;

    // ─── 1. Verify OTP with MSG91 ───
    const verifyUrl = `https://control.msg91.com/api/v5/otp/verify?otp=${otp}&mobile=${mobile}`;
    const verifyRes = await fetch(verifyUrl, {
      method: "GET",
      headers: { authkey: authKey },
    });
    const verifyData = await verifyRes.json();
    console.log("MSG91 verify response:", JSON.stringify(verifyData));

    if (verifyData.type !== "success") {
      return new Response(
        JSON.stringify({ error: verifyData.message || "Invalid or expired OTP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 2. OTP verified — find or create Supabase user ───
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
        // Might already exist with synthetic email (previous OTP attempt that didn't complete)
        if (createError.message?.includes("already") || createError.message?.includes("duplicate")) {
          console.log("User exists with synthetic email, treating as existing user");
          // Find via profiles or auth
          const { data: profileByEmail } = await adminClient
            .from("profiles")
            .select("id")
            .eq("email", syntheticEmail)
            .maybeSingle();

          if (profileByEmail) {
            isNewUser = false;
          } else {
            // Profile might not have been created yet — still treat as new-ish user
            // but the auth user exists, so generateLink will work
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
        // Successfully created — insert profile and role
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

        // Insert buyer role (ignore duplicate)
        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({ user_id: userId, role: "buyer" });
        if (roleError && !roleError.message?.includes("duplicate")) {
          console.warn("Role insert warning:", roleError.message);
        }

        console.log("Created new user:", userId);
      }
    }

    // ─── 3. Generate magiclink to establish client session ───
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
