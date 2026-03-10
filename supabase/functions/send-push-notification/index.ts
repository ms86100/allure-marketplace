import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface FirebaseServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// ─── APNs Direct Delivery (iOS) ───

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

/** Resolve FCM token → APNs device token via Firebase Instance ID API */
async function resolveApnsToken(
  fcmToken: string,
  serviceAccount: FirebaseServiceAccount,
  accessToken: string
): Promise<string | null> {
  try {
    // Use the IID API to get APNs token from FCM token
    const url = `https://iid.googleapis.com/iid/info/${fcmToken}?details=true`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.warn(`[APNs] IID lookup failed (${resp.status}): ${errText}`);
      return null;
    }
    const info = await resp.json();
    const apnsToken = info?.applicationVersion // not the right field
      ? null
      : null;
    // The IID API doesn't directly expose the APNs token in a reliable way.
    // Instead, we'll store APNs tokens alongside FCM tokens in device_tokens.
    console.warn("[APNs] IID API doesn't reliably expose APNs tokens; falling back to stored apns_token");
    return null;
  } catch (e) {
    console.warn(`[APNs] IID lookup exception: ${e}`);
    return null;
  }
}

async function sendApnsDirectNotification(
  apnsToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const p8Key = Deno.env.get("APNS_KEY_P8");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");

  if (!p8Key || !keyId || !teamId || !bundleId) {
    console.error("[APNs] Missing APNs secrets, falling back to FCM");
    return { success: false, error: "APNS_NOT_CONFIGURED" };
  }

  try {
    const cryptoKey = await importP8Key(p8Key);
    const jwt = await createApnsJwt(cryptoKey, keyId, teamId);

    const apnsPayload: Record<string, unknown> = {
      aps: {
        alert: { title, body },
        sound: "default",
        badge: 1,
      },
      ...(data || {}),
    };

    const url = `https://api.push.apple.com/3/device/${apnsToken}`;
    console.log(`[APNs] Sending to production APNs, token prefix: ${apnsToken.substring(0, 16)}…`);

    const apnsResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apnsPayload),
    });

    const statusCode = apnsResponse.status;
    let responseBody = "";
    try { responseBody = await apnsResponse.text(); } catch { responseBody = ""; }

    if (statusCode === 200) {
      const apnsId = apnsResponse.headers.get("apns-id");
      console.log(`[APNs] ✅ Delivered (apns-id: ${apnsId})`);
      return { success: true };
    }

    if (statusCode === 410) {
      console.warn(`[APNs] Token gone (410) — device unregistered`);
      return { success: false, error: "INVALID_TOKEN" };
    }

    console.error(`[APNs] Failed (${statusCode}): ${responseBody}`);
    return { success: false, error: `APNs ${statusCode}: ${responseBody}` };
  } catch (err) {
    console.error(`[APNs] Exception: ${err}`);
    return { success: false, error: String(err) };
  }
}

// ─── FCM Delivery (Android + fallback) ───

async function generateAccessToken(serviceAccount: FirebaseServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: serviceAccount.token_uri,
    iat: now,
    exp: exp,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKeyPem = serviceAccount.private_key.replace(/\\n/g, "\n");
  const pemContents = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .trim();

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signatureB64}`;

  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function sendFCMNotification(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const message: Record<string, unknown> = {
    message: {
      token: deviceToken,
      notification: { title, body },
      data: data || {},
      android: {
        priority: "high",
        notification: { sound: "default" },
      },
      apns: {
        headers: {
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            badge: 1,
          },
        },
      },
    },
  };

  try {
    const response = await fetch(fcmUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorData: any;
      try { errorData = JSON.parse(responseText); } catch { errorData = { raw: responseText }; }

      if (
        errorData.error?.details?.some(
          (d: { errorCode?: string }) =>
            d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT"
        )
      ) {
        return { success: false, error: "INVALID_TOKEN" };
      }

      return { success: false, error: JSON.stringify(errorData) };
    }

    console.log(`[FCM] ✅ Delivered: ${responseText.substring(0, 200)}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // C3: Only allow service-role callers (internal edge functions)
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — service role required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT not configured");
    }

    let serviceAccount: FirebaseServiceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (parseErr) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT is not valid JSON`);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, title, body, data }: PushPayload = await req.json();

    if (!userId || !title || !body) {
      return new Response(
        JSON.stringify({ error: "userId, title, and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch device tokens for user (now includes apns_token column for iOS)
    const { data: tokens, error: tokensError } = await supabase
      .from("device_tokens")
      .select("id, token, platform, apns_token")
      .eq("user_id", userId);

    if (tokensError) {
      throw new Error(`Failed to fetch tokens: ${tokensError.message}`);
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No device tokens found for user", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate iOS tokens: same apns_token means same physical device,
    // keep only the most recently updated row per apns_token.
    const seenApns = new Set<string>();
    const deduped = tokens.filter((t: any) => {
      if (t.platform === "ios" && t.apns_token) {
        if (seenApns.has(t.apns_token)) return false;
        seenApns.add(t.apns_token);
      }
      return true;
    });

    if (deduped.length < tokens.length) {
      console.log(`[Push] Deduplicated ${tokens.length} tokens → ${deduped.length} (removed ${tokens.length - deduped.length} duplicate iOS devices)`);
    }

    // Generate FCM access token (needed for Android and iOS fallback)
    const accessToken = await generateAccessToken(serviceAccount);

    // Send to deduplicated device tokens — iOS uses direct APNs when apns_token available
    const results = await Promise.all(
      deduped.map(async (tokenRecord: any) => {
        let result: { success: boolean; error?: string };

        // iOS with stored APNs token → direct APNs delivery (bypasses FCM)
        if (tokenRecord.platform === "ios" && tokenRecord.apns_token) {
          console.log(`[Push] iOS device — using direct APNs for token prefix: ${tokenRecord.apns_token.substring(0, 16)}…`);
          result = await sendApnsDirectNotification(
            tokenRecord.apns_token,
            title,
            body,
            data
          );

          // If APNs fails due to config, fall back to FCM
          if (!result.success && result.error === "APNS_NOT_CONFIGURED") {
            console.log(`[Push] APNs not configured, falling back to FCM`);
            result = await sendFCMNotification(
              accessToken,
              serviceAccount.project_id,
              tokenRecord.token,
              title,
              body,
              data
            );
          }
        } else {
          // Android or iOS without APNs token → FCM
          console.log(`[Push] ${tokenRecord.platform} device — using FCM`);
          result = await sendFCMNotification(
            accessToken,
            serviceAccount.project_id,
            tokenRecord.token,
            title,
            body,
            data
          );
        }

        // Remove invalid tokens
        if (result.error === "INVALID_TOKEN") {
          await supabase.from("device_tokens").delete().eq("id", tokenRecord.id);
          console.log(`Removed invalid token: ${tokenRecord.id}`);
        }

        return { ...result, platform: tokenRecord.platform };
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        message: `Sent ${successCount} notifications, ${failedCount} failed`,
        sent: successCount,
        failed: failedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Push notification error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
