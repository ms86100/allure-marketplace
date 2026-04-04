

# Bulletproof OTP Send: Client Resilience + Edge Function Hardening

## Problem
`handleSendOtp` still uses `supabase.functions.invoke()` which throws opaque errors and hangs on proxy issues. No client-side timeout, no retry, no response validation. Edge function hits DB first for credentials, adding latency during DB stress.

## Changes

### 1. `src/hooks/useAuthPage.ts` — Rewrite `handleSendOtp` (lines 96-126)

Replace `supabase.functions.invoke()` with raw `fetch()` + full hardening:

- **AbortController timeout (8s)**: Prevents infinite hang if edge function is unresponsive
- **1 automatic retry**: On network failure or timeout, retry once before showing error
- **Response shape validation**: Check `data` is a valid object before accessing properties
- **Friendly error toasts**: Never expose raw technical errors
- Loading state already exists (`setIsLoading`) — no change needed there

```typescript
const sendOtp = async (attempt = 0): Promise<any> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/msg91-send-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ phone, country_code: '91', resend, reqId: resend ? otpReqId : undefined }),
        signal: controller.signal,
      }
    );
    const data = await response.json();
    if (!data || typeof data !== 'object') throw new Error('Invalid response');
    if (!response.ok || data.error) {
      toast.error(data.error || 'Failed to send OTP');
      return;
    }
    return data;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      if (attempt < 1) return sendOtp(attempt + 1); // retry once
      toast.error('Request timed out. Please try again.');
      return;
    }
    if (attempt < 1) return sendOtp(attempt + 1); // retry on network glitch
    throw e;
  } finally {
    clearTimeout(timeout);
  }
};
```

### 2. `supabase/functions/msg91-send-otp/index.ts` — Env-first credential lookup

Replace the 3 `getCredential()` calls with an env-first pattern: check `Deno.env.get()` first, only hit DB if env is missing. This eliminates DB dependency for the common case (secrets are configured as env vars).

```typescript
function getCredentialFast(adminClient, dbKey, envKey) {
  const envVal = Deno.env.get(envKey);
  if (envVal) return Promise.resolve(envVal);
  // DB fallback with 3s timeout
  return Promise.race([
    getCredential(adminClient, dbKey, envKey),
    new Promise((_, rej) => setTimeout(() => rej(new Error('db-timeout')), 3000)),
  ]).catch(() => undefined);
}
```

Also add AbortController (5s) on the outbound MSG91 API calls to prevent the edge function itself from hanging on a slow third-party response.

### 3. `src/hooks/useAuthPage.ts` — Harden `handleVerifyOtp` (lines 128-160)

Apply the same AbortController timeout (8s) + 1 retry to the existing `fetch()` call in `handleVerifyOtp` for consistency. It already uses `fetch()` but lacks timeout protection.

## Files changed

| File | Change |
|------|--------|
| `src/hooks/useAuthPage.ts` | Rewrite `handleSendOtp` to raw fetch + timeout + retry; add timeout to `handleVerifyOtp` |
| `supabase/functions/msg91-send-otp/index.ts` | Env-first credential lookup + MSG91 API call timeout |

## What stays unchanged
- OTP freeze architecture (reqId flow, magiclink bridge)
- Apple review bypass
- Rate limiting
- `msg91-verify-otp` edge function (already working)
- All other auth flow logic

