

# Stabilize OTP Verify: 703 Recovery, No Auto-Retry, 522 Handling

## Problem

The verify-otp flow has three compounding failures:

1. **Client auto-retries on timeout** (line 246): first attempt consumes OTP at MSG91, retry gets 703 "already verified" → treated as error → user stuck
2. **Backend treats 703 as failure**: even though it means OTP was valid and consumed, the system returns an error instead of proceeding to session creation
3. **Supabase Auth 522 crashes the function**: `generateLink()` sometimes returns HTML instead of JSON, causing an unhandled exception
4. **In-memory dedup cache is useless**: `recentVerifiedOtps` Map doesn't persist across edge function isolates

## Changes

### File 1: `src/hooks/useAuthPage.ts`

**Remove auto-retry on verify timeout** (lines 244-249):
- Replace `if (attempt < 1) return verifyOtpRequest(attempt + 1)` with a simple timeout message
- On timeout, keep user on OTP screen, show "Verification is taking longer than expected. Please wait or tap Verify again."
- Do NOT auto-retry — the OTP is likely already consumed at MSG91

### File 2: `supabase/functions/msg91-verify-otp/index.ts`

Three changes:

1. **Treat 703 as recovery, not failure** (line 165-171):
   - When MSG91 returns code 703 ("already verified"), proceed to session creation instead of returning error
   - Remove the `hasRecentVerifiedOtp` condition — 703 always means the OTP was valid

2. **Remove in-memory dedup cache entirely** (lines 13-30, 110-111, 143, 147-148, 164):
   - Delete `recentVerifiedOtps` Map, `cleanupRecentVerifiedOtps()`, `hasRecentVerifiedOtp()`, `getVerifyCacheKey()`
   - These don't work across isolates and create false logic paths

3. **Wrap all Supabase Auth calls in try-catch for 522 HTML responses** (lines 194-265):
   - Catch `generateLink()` and `createUser()` failures that return HTML instead of JSON
   - Return `503` with friendly message instead of crashing

## What stays unchanged
- MSG91 API endpoints and payloads
- Apple review bypass
- Send-OTP function
- reqId flow
- No DB changes

## Expected result
- Timeout → user stays on OTP screen, can manually retry → 703 triggers recovery → session created
- No auto-retry = no race condition = no duplicate consumption
- Supabase Auth 522 = graceful 503 instead of crash

