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
 * Gap 2: Now queries category_status_flows for DB-backed labels and progress.
 */

interface LAUpdatePayload {
  order_id: string;
  status: string;
  push_token: string;
  seller_name?: string;
  seller_logo?: string;
  seller_logo_url?: string;
}

/** Safety-net fallback — overridden by DB query below */
const FALLBACK_TERMINAL = new Set([
  "delivered", "completed", "cancelled", "no_show", "failed",
]);

async function loadTerminalStatuses(
  supabase: ReturnType<typeof createClient>,
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("category_status_flows")
      .select("status_key")
      .eq("is_terminal", true);
    if (error || !data || data.length === 0) return FALLBACK_TERMINAL;
    const dbSet = new Set(data.map((r: any) => r.status_key));
    // Union with fallbacks for safety
    for (const s of FALLBACK_TERMINAL) dbSet.add(s);
    return dbSet;
  } catch {
    return FALLBACK_TERMINAL;
  }
}

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

/** Cached status flow data to avoid re-querying within the same function invocation */
interface StatusFlowEntry {
  status_key: string;
  display_label: string;
  sort_order: number;
}

async function getStatusFlowData(
  supabase: ReturnType<typeof createClient>,
  transactionType: string,
  parentGroup: string,
): Promise<Map<string, StatusFlowEntry>> {
  const { data, error } = await supabase
    .from("category_status_flows")
    .select("status_key, display_label, sort_order")
    .eq("transaction_type", transactionType)
    .eq("parent_group", parentGroup)
    .order("sort_order");

  const map = new Map<string, StatusFlowEntry>();
  if (!error && data) {
    for (const entry of data) {
      map.set(entry.status_key, entry as StatusFlowEntry);
    }
  }
  return map;
}

function deriveProgressPercent(
  statusKey: string,
  flowMap: Map<string, StatusFlowEntry>,
): number | null {
  const entry = flowMap.get(statusKey);
  if (!entry) return null;
  const sortOrders = Array.from(flowMap.values()).map((e) => e.sort_order);
  const minSort = Math.min(...sortOrders);
  const maxSort = Math.max(...sortOrders);
  if (maxSort === minSort) return 0.5;
  return 0.05 + ((entry.sort_order - minSort) / (maxSort - minSort)) * 0.95;
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
    const { order_id, status, push_token, seller_name, seller_logo_url, transaction_type, parent_group } = payload;

    if (!order_id || !status || !push_token) {
      return new Response(
        JSON.stringify({ error: "order_id, status, push_token required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[LA-APNs] Updating LA for order=${order_id} status=${status} token=${push_token.substring(0, 16)}…`);

    // Fetch delivery data + DB-backed status flow in parallel
    const [deliveryRes, itemCountRes, flowMap] = await Promise.all([
      supabase
        .from("delivery_assignments")
        .select("eta_minutes, distance_meters, rider_name, status")
        .eq("order_id", order_id)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order_id),
      getStatusFlowData(
        supabase,
        transaction_type || "cart_purchase",
        parent_group || "default",
      ),
    ]);

    let etaMinutes: number | null = null;
    let driverDistance: number | null = null;
    let driverName: string | null = null;
    const vehicleType: string | null = null;

    const delivery = deliveryRes.data;
    if (delivery) {
      etaMinutes = delivery.eta_minutes ?? null;
      driverDistance = delivery.distance_meters ? delivery.distance_meters / 1000 : null;
      driverName = delivery.rider_name ?? null;
    }

    const itemCount = itemCountRes.count ?? null;

    // DB-backed progress and labels
    const progressPercent = deriveProgressPercent(status, flowMap);
    const flowEntry = flowMap.get(status);
    const progressStage = flowEntry?.display_label ?? null;

    // Derive short order ID from UUID
    const orderShortId = `#${order_id.replace(/-/g, "").slice(-4).toUpperCase()}`;

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
      orderShortId,
      sellerLogoUrl: seller_logo_url || null,
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
