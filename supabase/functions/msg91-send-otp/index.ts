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
    const { phone, country_code = "91", resend = false } = await req.json();

    // Validate phone
    if (!phone || !/^\d{10}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number. Please provide a 10-digit number." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authKey = Deno.env.get("MSG91_AUTH_KEY");
    const templateId = Deno.env.get("MSG91_OTP_TEMPLATE_ID");

    if (!authKey || !templateId) {
      console.error("MSG91 credentials not configured");
      return new Response(
        JSON.stringify({ error: "OTP service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mobile = `${country_code}${phone}`;

    let url: string;
    if (resend) {
      url = `https://control.msg91.com/api/v5/otp/retry?mobile=${mobile}&retrytype=text`;
    } else {
      url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${mobile}&otp_length=6`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: { authkey: authKey },
    });

    const data = await response.json();
    console.log("MSG91 send response:", JSON.stringify(data));

    if (data.type === "success" || response.ok) {
      return new Response(
        JSON.stringify({ success: true, message: resend ? "OTP resent" : "OTP sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error("MSG91 send OTP failed:", data);
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
