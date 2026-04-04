

# Fix Duplicate OTP + Instant UX: Idempotency, Tap Lock, No Retry

## Problem

Three remaining vulnerabilities cause duplicate OTPs and slow UX:

1. **Client retries send-OTP on timeout** (line 149) — backend may still succeed, causing 2 OTPs
2. **No tap protection** — rapid button clicks fire parallel requests
3. **Rate limiter is DB-only** — under DB stress it blocks the entire request (no timeout wrapper)

The network logs confirm the backend is currently returning 544 timeouts, meaning the DB-based rate limiter is the bottleneck blocking OTP sends.

## Changes

### 1. `src/hooks/useAuthPage.ts` — Remove send retry + add tap lock + optimistic transition

**a) Remove retry on send-OTP (line 148-149).** Replace with immediate return of `'timeout'` signal. Verify-OTP retry stays (idempotent).

**b) Add `useSubmitGuard` wrapper** around `handleSendOtp` to prevent double-tap. The project already has this hook (`src/hooks/useSubmitGuard.ts`) — reuse it with a 2s cooldown.

**c) Optimistic transition on timeout:** Instead of showing an error toast when timeout occurs, move user to OTP screen with "OTP is on the way..." message. The backend likely succeeded.

**d) Reduce timeout from 8s to 5s.** Combined with rate limiter timeout (2s) + MSG91 timeout (5s), responses will arrive within budget.

```text
Before: timeout → retry → duplicate OTP → error toast
After:  timeout → move to OTP screen → "OTP is on the way"
```

### 2. `supabase/functions/msg91-send-otp/index.ts` — Rate limiter timeout + in-memory dedup

**a) Wrap rate limiter calls in 2s `Promise.race` timeout.** If DB is slow, skip rate limiting and proceed — same pattern already used for credentials.

**b) Add in-memory dedup guard** using a module-level `Map<string, number>` that tracks `phone → timestamp`. If same phone requested within 30s, return the previous success response without calling MSG91 again. This is lightweight (no DB needed) and prevents duplicate OTPs from any source (retries, double-taps, network replays).

```typescript
const recentSends = new Map<string, { ts: number; reqId: string }>();

// At start of handler:
const dedupeKey = `${country_code}${phone}`;
const recent = recentSends.get(dedupeKey);
if (recent && Date.now() - recent.ts < 30_000) {
  return Response.json({ success: true, message: "OTP sent", reqId: recent.reqId });
}

// After successful MSG91 response:
recentSends.set(dedupeKey, { ts: Date.now(), reqId: data.reqId });
```

This is per-isolate (not globally distributed), but covers the primary case: same user hitting the same edge function instance within 30s.

### 3. No "fire-and-forget" / async queue

I am NOT adding a background job queue for OTP sending. Here's why:

- MSG91's Widget API is fast (typically <2s). The slowness comes from the DB rate limiter, which we're fixing with the timeout wrapper.
- Supabase Edge Functions don't have a built-in job queue. Adding one would require a new table + polling + complexity with no clear benefit given MSG91's response times.
- The optimistic UI transition already gives users instant perceived speed regardless of backend latency.

## Technical details

### Files changed

| File | Change |
|------|--------|
| `src/hooks/useAuthPage.ts` | Remove send retry, add `useSubmitGuard`, optimistic timeout transition, 5s timeout |
| `supabase/functions/msg91-send-otp/index.ts` | 2s rate limiter timeout, in-memory 30s dedup guard |

### What stays unchanged (OTP freeze respected)
- MSG91 API call logic (same endpoints, same payload)
- Apple review bypass
- reqId flow and magiclink bridge
- Verify-OTP function and its retry (idempotent)
- Rate limiting logic itself (just wrapped in timeout)
- No DB changes, no new tables, no new dependencies

### Expected result
- Double-tap: blocked by `useSubmitGuard` (client) + in-memory dedup (server)
- Timeout: user moves to OTP screen optimistically, no error shown
- DB stress: rate limiter skipped after 2s, OTP still sends
- Retry storm: eliminated (no client retry on send)
- Perceived latency: <2s in normal conditions, instant transition on timeout

