const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, country_code = "91", resend = false, reqId } = await req.json();

    if (resend && !reqId) {
      return new Response(
        JSON.stringify({ error: "Missing request ID for resend" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    if (!resend) {
      if (!phone || !/^\d{10}$/.test(phone)) {
        return new Response(
          JSON.stringify({ error: "Invalid phone number. Please provide a 10-digit number." }),
          { status: 400, headers: jsonHeaders }
        );
      }

      // Apple reviewer bypass
      if (phone === "0123456789" && country_code === "91") {
        console.log("Apple reviewer demo phone — returning bypass reqId");
        return new Response(
          JSON.stringify({ success: true, message: "OTP sent", reqId: "apple-review-bypass" }),
          { headers: jsonHeaders }
        );
      }
    }

    const authKey = Deno.env.get("MSG91_AUTH_KEY");
    const widgetId = Deno.env.get("MSG91_WIDGET_ID");
    const tokenAuth = Deno.env.get("MSG91_TOKEN_AUTH");

    if (!authKey || !widgetId || !tokenAuth) {
      console.error("MSG91 Widget credentials not configured");
      return new Response(
        JSON.stringify({ error: "OTP service not configured" }),
        { status: 500, headers: jsonHeaders }
      );
    }

    let data: any;

    // 8s timeout on outbound MSG91 API calls
    const apiController = new AbortController();
    const apiTimeout = setTimeout(() => apiController.abort(), 8000);

    try {
      if (resend) {
        const retryRes = await fetch("https://api.msg91.com/api/v5/widget/retryOtp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reqId, retryChannel: 11, authkey: authKey, widgetId, tokenAuth }),
          signal: apiController.signal,
        });
        data = await retryRes.json();
        console.log("MSG91 Widget retry response:", JSON.stringify(data));
      } else {
        const identifier = `${country_code}${phone}`;
        const sendRes = await fetch("https://api.msg91.com/api/v5/widget/sendOtp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, widgetId, tokenAuth, authkey: authKey }),
          signal: apiController.signal,
        });
        data = await sendRes.json();
        console.log("MSG91 Widget send response:", JSON.stringify(data));
      }
    } catch (e: any) {
      console.error("MSG91 API call failed:", e.message);
      return new Response(
        JSON.stringify({ error: "OTP service temporarily unavailable. Please try again." }),
        { status: 503, headers: jsonHeaders }
      );
    } finally {
      clearTimeout(apiTimeout);
    }

    if (data.type === "success") {
      return new Response(
        JSON.stringify({
          success: true,
          message: resend ? "OTP resent" : "OTP sent",
          reqId: data.reqId || data.message || reqId,
        }),
        { headers: jsonHeaders }
      );
    }

    console.error("MSG91 Widget OTP failed:", JSON.stringify(data));
    return new Response(
      JSON.stringify({ error: data.message || "Failed to send OTP. Please try again." }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (error) {
    console.error("Send OTP error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
