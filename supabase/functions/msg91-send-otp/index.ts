import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Read credential from admin_settings, fall back to env secret */
async function getCredential(
  supabase: any,
  dbKey: string,
  envKey: string
): Promise<string | undefined> {
  try {
    const { data } = await supabase
      .from("admin_settings")
      .select("value, is_active")
      .eq("key", dbKey)
      .maybeSingle();
    if (data?.value && data.is_active !== false) return data.value;
  } catch (e) {
    console.warn(`DB credential lookup failed for ${dbKey}:`, e);
  }
  return Deno.env.get(envKey);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, country_code = "91", resend = false, reqId } = await req.json();

    if (resend && !reqId) {
      return new Response(
        JSON.stringify({ error: "Missing request ID for resend" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resend) {
      if (!phone || !/^\d{10}$/.test(phone)) {
        return new Response(
          JSON.stringify({ error: "Invalid phone number. Please provide a 10-digit number." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create admin client for DB credential lookup
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [authKey, widgetId, tokenAuth] = await Promise.all([
      getCredential(adminClient, "msg91_auth_key", "MSG91_AUTH_KEY"),
      getCredential(adminClient, "msg91_widget_id", "MSG91_WIDGET_ID"),
      getCredential(adminClient, "msg91_token_auth", "MSG91_TOKEN_AUTH"),
    ]);

    if (!authKey || !widgetId || !tokenAuth) {
      console.error("MSG91 Widget credentials not configured (checked DB + env)");
      return new Response(
        JSON.stringify({ error: "OTP service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let data: any;

    if (resend) {
      const retryRes = await fetch("https://api.msg91.com/api/v5/widget/retryOtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reqId, retryChannel: 11, authkey: authKey, widgetId, tokenAuth }),
      });
      data = await retryRes.json();
      console.log("MSG91 Widget retry response:", JSON.stringify(data));
    } else {
      const identifier = `${country_code}${phone}`;
      const sendRes = await fetch("https://api.msg91.com/api/v5/widget/sendOtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, widgetId, tokenAuth, authkey: authKey }),
      });
      data = await sendRes.json();
      console.log("MSG91 Widget send response:", JSON.stringify(data));
    }

    if (data.type === "success") {
      return new Response(
        JSON.stringify({
          success: true,
          message: resend ? "OTP resent" : "OTP sent",
          reqId: data.reqId || data.message || reqId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error("MSG91 Widget OTP failed:", JSON.stringify(data));
    return new Response(
      JSON.stringify({ error: data.message || "Failed to send OTP. Please try again." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
