/**
 * Shared helper for durable phone_auth_sessions state machine.
 * Used by both send-otp and verify-otp edge functions.
 */

export type SessionState =
  | "pending_send"
  | "otp_sent"
  | "provider_verified"
  | "auth_retryable_failure"
  | "session_ready"
  | "expired";

export interface PhoneAuthSession {
  id: string;
  phone_e164: string;
  req_id: string;
  state: SessionState;
  send_bucket: string | null;
  user_id: string | null;
  provider_verified_at: string | null;
  token_hash: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  verify_attempts: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/** Compute a 30-second send bucket key for idempotency */
export function computeSendBucket(phoneE164: string): string {
  const bucket = Math.floor(Date.now() / 30_000);
  return `${phoneE164}:${bucket}`;
}

/** Find an active (non-expired) session for a phone in the current send bucket */
export async function findActiveSendSession(
  adminClient: any,
  phoneE164: string,
  sendBucket: string
): Promise<PhoneAuthSession | null> {
  const { data } = await adminClient
    .from("phone_auth_sessions")
    .select("*")
    .eq("phone_e164", phoneE164)
    .eq("send_bucket", sendBucket)
    .in("state", ["pending_send", "otp_sent"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/** Find a session by reqId that hasn't expired */
export async function findSessionByReqId(
  adminClient: any,
  reqId: string
): Promise<PhoneAuthSession | null> {
  const { data } = await adminClient
    .from("phone_auth_sessions")
    .select("*")
    .eq("req_id", reqId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data || null;
}

/** Create a new phone auth session */
export async function createSession(
  adminClient: any,
  phoneE164: string,
  reqId: string,
  sendBucket: string,
  state: SessionState = "otp_sent"
): Promise<PhoneAuthSession | null> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  const { data, error } = await adminClient
    .from("phone_auth_sessions")
    .insert({
      phone_e164: phoneE164,
      req_id: reqId,
      state,
      send_bucket: sendBucket,
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (error) {
    console.error("Failed to create phone auth session:", error.message);
    return null;
  }
  return data;
}

/** Transition session state */
export async function updateSessionState(
  adminClient: any,
  sessionId: string,
  newState: SessionState,
  extra: Record<string, any> = {}
): Promise<boolean> {
  const { error } = await adminClient
    .from("phone_auth_sessions")
    .update({
      state: newState,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", sessionId);
  if (error) {
    console.error(`Failed to update session ${sessionId} to ${newState}:`, error.message);
    return false;
  }
  return true;
}

/** Increment verify attempts */
export async function incrementVerifyAttempts(
  adminClient: any,
  sessionId: string,
  currentAttempts: number
): Promise<void> {
  await adminClient
    .from("phone_auth_sessions")
    .update({ verify_attempts: currentAttempts + 1, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}

/** Opportunistic cleanup of old expired sessions (non-blocking) */
export function cleanupExpiredSessions(adminClient: any): void {
  adminClient.rpc("cleanup_expired_auth_sessions").then(() => {
    console.log("Cleaned up expired auth sessions");
  }).catch((e: any) => {
    // Non-critical — ignore
  });
}
