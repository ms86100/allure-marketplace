

# Final OTP Hardening: Dedup, Safe Retry, Race Protection

## Problem
Three edge cases remain:
1. Retry fires on API errors (e.g. rate limit) — may send duplicate OTPs
2. Double-click sends parallel requests
3. Late responses after abort can cause stale state

## Changes

### 1. `src/hooks/useAuthPage.ts`

**a) Retry only on network/timeout errors (lines 146-153, 219-226)**

Current code retries on `e.message?.includes('fetch')` which is too broad. Change retry condition in both `sendOtpRequest` and `verifyOtpRequest` to only retry on `AbortError` or `TypeError` (genuine network failures):

```typescript
// Replace: if (e.name === 'AbortError' || e.message?.includes('fetch'))
// With:    if (e.name === 'AbortError' || e instanceof TypeError)
```

`TypeError` is what `fetch()` throws on network failure. This prevents retrying on parsed API errors (rate limits, validation errors).

**b) Double-click guard (lines 96, 178)**

Add early return at the top of both handlers:

```typescript
// handleSendOtp
if (isLoading) return;

// handleVerifyOtp  
if (isLoading) return;
```

`isLoading` is already set to `true` at the start of each handler and `false` in `finally`. This prevents concurrent invocations from rapid taps.

**c) Catch block safety (lines 170-172)**

The outer catch currently re-throws from the retry helper. Add a guard so only network errors (not API errors that were already toasted) bubble up:

```typescript
} catch (error: any) {
  // Only show generic error if not already handled
  if (error?.name !== 'AbortError') {
    console.error('[OTP Send Failed]', { error, attempt: 'final' });
    toast.error('Connection error. Please check your internet and try again.');
  }
}
```

Same pattern for `handleVerifyOtp` outer catch.

### No other files change
- Edge function already hardened (env-first + timeouts)
- No DB changes
- No new dependencies

## Files changed

| File | Change |
|------|--------|
| `src/hooks/useAuthPage.ts` | Safe retry condition, double-click guard, structured error logging |

