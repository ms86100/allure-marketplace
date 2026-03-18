import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCredential } from "../_shared/credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge function: update-live-activity-apns
 *
 * Sends an APNs push with `apns-push-type: liveactivity` to update
 * a Live Activity widget on iOS even when the app process is killed.
 *
 * Called by the DB trigger on order status changes when a push token exists.
 */

interface LAUpdatePayload {
  order_id: string;
  status: string;
  push_token: string;
  seller_name?: string;
  seller_logo?: string;
}

/** Status → progress percent mapping (mirrors liveActivityMapper.ts) */
const STATUS_PROGRESS: Record<string, number> = {
  accepted: 0.10,
  confirmed: 0.10,
  preparing: 0.40,
  ready: 0.75,
  picked_up: 0.55,
  on_the_way: 0.70,
  en_route: 0.80,
  delivered: 1.0,
  completed: 1.0,
};

const PROGRESS_DESCRIPTIONS: Record<string, string> = {
  accepted: "Order Accepted",
  confirmed: "Booking Confirmed",
  preparing: "Order Being Prepared",
  ready: "Order Ready",
  picked_up: "Order Picked Up",
  en_route: "Order On The Way",
  on_the_way: "Order On The Way",
  delivered: "Delivered",
  completed: "Completed",
};

const TERMINAL_STATUSES = new Set([
  "delivered", "completed", "cancelled", "no_show", "failed",
]);

function b64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

async function importP8Key(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function createApnsJwt(
  key: CryptoKey,
  keyId: string,
  teamId: string
): Promise<string> {
  const header = b64urlStr(JSON.stringify({ alg: "ES256", kid: keyId }));
  const now = Math.floor(Date.now() / 1000);
  const claims = b64urlStr(
    JSON.stringify({ iss: teamId, iat: now, exp: now + 3600 })
  );
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow service-role callers
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — service role required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey!);

    // Load APNs credentials
    const [apnsP8Key, apnsKeyId, apnsTeamId, apnsBundleId] = await Promise.all([
      getCredential(supabase, "apns_key_p8", "APNS_KEY_P8"),
      getCredential(supabase, "apns_key_id", "APNS_KEY_ID"),
      getCredential(supabase, "apns_team_id", "APNS_TEAM_ID"),
      getCredential(supabase, "apns_bundle_id", "APNS_BUNDLE_ID"),
    ]);

    if (!apnsP8Key || !apnsKeyId || !apnsTeamId || !apnsBundleId) {
      console.warn("[LA-APNs] APNs credentials not configured, skipping");
      return new Response(
        JSON.stringify({ error: "APNs not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: LAUpdatePayload = await req.json();
    const { order_id, status, push_token, seller_name, seller_logo } = payload;

    if (!order_id || !status || !push_token) {
      return new Response(
        JSON.stringify({ error: "order_id, status, push_token required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[LA-APNs] Updating LA for order=${order_id} status=${status} token=${push_token.substring(0, 16)}…`);

    // Fetch delivery data for ETA/distance
    let etaMinutes: number | null = null;
    let driverDistance: number | null = null;
    let driverName: string | null = null;
    let vehicleType: string | null = null;
    let itemCount: number | null = null;

    const { data: delivery } = await supabase
      .from("delivery_assignments")
      .select("eta_minutes, distance_meters, rider_name, status")
      .eq("order_id", order_id)
      .maybeSingle();

    if (delivery) {
      etaMinutes = delivery.eta_minutes ?? null;
      driverDistance = delivery.distance_meters ? delivery.distance_meters / 1000 : null;
      driverName = delivery.rider_name ?? null;
    }

    // Get item count
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order_id);
    itemCount = count ?? null;

    // Build content-state matching LiveDeliveryAttributes.ContentState
    const progressPercent = STATUS_PROGRESS[status] ?? null;
    const progressStage = PROGRESS_DESCRIPTIONS[status] ?? null;

    const contentState: Record<string, unknown> = {
      workflowStatus: status,
      etaMinutes,
      driverDistance,
      driverName,
      vehicleType,
      progressStage,
      progressPercent,
      sellerName: seller_name || null,
      itemCount,
    };

    // Build APNs payload for Live Activity update
    const isTerminal = TERMINAL_STATUSES.has(status);
    const apnsPayload: Record<string, unknown> = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: isTerminal ? "end" : "update",
        "content-state": contentState,
        ...(isTerminal ? { "dismissal-date": Math.floor(Date.now() / 1000) + 5 } : {}),
      },
    };

    // Sign and send
    const cryptoKey = await importP8Key(apnsP8Key);
    const jwt = await createApnsJwt(cryptoKey, apnsKeyId, apnsTeamId);

    // APNs topic for Live Activity must be: bundleId + ".push-type.liveactivity"
    const laTopic = `${apnsBundleId}.push-type.liveactivity`;

    const apnsResponse = await fetch(
      `https://api.push.apple.com/3/device/${push_token}`,
      {
        method: "POST",
        headers: {
          Authorization: `bearer ${jwt}`,
          "apns-topic": laTopic,
          "apns-push-type": "liveactivity",
          "apns-priority": "10",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apnsPayload),
      }
    );

    const statusCode = apnsResponse.status;
    let responseBody = "";
    try { responseBody = await apnsResponse.text(); } catch { responseBody = ""; }

    if (statusCode === 200) {
      const apnsId = apnsResponse.headers.get("apns-id");
      console.log(`[LA-APNs] ✅ Live Activity updated (apns-id: ${apnsId})`);

      // If terminal, clean up the token
      if (isTerminal) {
        await supabase
          .from("live_activity_tokens")
          .delete()
          .eq("order_id", order_id);
        console.log(`[LA-APNs] Cleaned up token for terminal order ${order_id}`);
      }

      return new Response(
        JSON.stringify({ success: true, apnsId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (statusCode === 410) {
      // Token expired / activity ended — clean up
      await supabase
        .from("live_activity_tokens")
        .delete()
        .eq("order_id", order_id);
      console.warn(`[LA-APNs] Token gone (410) — cleaned up for order ${order_id}`);
      return new Response(
        JSON.stringify({ success: false, error: "TOKEN_EXPIRED" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error(`[LA-APNs] Failed (${statusCode}): ${responseBody}`);
    return new Response(
      JSON.stringify({ success: false, error: `APNs ${statusCode}: ${responseBody}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[LA-APNs] Exception:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
