
Do I know what the issue is? Yes.

## Root cause analysis

This is not one bug. It is one broken transaction split across 3 systems:

1. MSG91 verifies the OTP  
2. the backend creates/fetches the user and mints a magic-link token  
3. the client exchanges `token_hash` for a real session

Your logs show step 1 succeeds, but steps 2/3 fail intermittently:

- `msg91-send-otp` returned `200` with a real `reqId`
- the first `msg91-verify-otp` request was aborted by the client after 12s
- edge logs show `MSG91 OTP verified successfully`
- the next attempt shows `703 already verified`
- the same logs then show `Create user error: AuthUnknownError: Unexpected token '<'...` which is an HTML 522 response from the auth backend
- console/network also show repeated `auth/v1/token` and REST `Failed to fetch`, which confirms wider auth/backend instability

So the OTP is often correct and already consumed. What is failing is session creation/recovery after that.

## Why the current fixes still fail

- `msg91-send-otp` still uses an in-memory `recentSends` Map. That only works inside one isolate, so it is not real duplicate protection.
- `msg91-verify-otp` still couples OTP verification and session creation inside one request. If provider verification succeeds but auth creation fails, the OTP is consumed and the user is trapped.
- The 703 handling is only a partial recovery. It still depends on immediate auth success and has no durable verified state to resume from.
- For new users, verify does too much hot-path work: `createUser` + profile upsert + role insert + second `generateLink`. That increases latency and timeout risk.
- The client timeout message is now more honest, but the recovery path is still weak. “Tap Verify again” currently replays a fragile flow instead of resuming a verified session.

## Reliable end-to-end fix

This needs a small architecture correction, not another patch.

### 1) Add a durable phone login session table
Create a service-only table like `public.phone_auth_sessions` with RLS enabled and no public policies.

Store:
- `phone_e164`
- `req_id` (unique)
- `state` (`pending_send`, `otp_sent`, `provider_verified`, `auth_retryable_failure`, `session_ready`, `expired`)
- `send_bucket` (for 30s idempotency)
- `user_id` (plain uuid, no FK)
- `provider_verified_at`
- `last_error_code`, `last_error_message`
- `expires_at`
- timestamps / attempt counters

Important: do not store the OTP itself.

### 2) Rebuild send OTP around DB idempotency
In `supabase/functions/msg91-send-otp/index.ts`:
- remove the in-memory `recentSends` Map
- use the session table + unique `(phone_e164, send_bucket)` logic so concurrent sends across isolates reuse one active session
- if a session already exists in the active window, return the same `reqId`
- keep Apple review bypass unchanged

Result: no duplicate SMS from timeouts, retries, or isolate changes.

### 3) Rebuild verify OTP as a state machine
In `supabase/functions/msg91-verify-otp/index.ts`:
- load the session row first
- if `state = otp_sent`, call MSG91 once
- if MSG91 returns success or `703`, persist `provider_verified`
- if `state = provider_verified` or `auth_retryable_failure`, skip MSG91 entirely and continue session recovery only
- only create a user on an explicit “user not found” path; never treat “missing hash token” as proof the user does not exist
- if auth returns HTML/522/timeout, persist `auth_retryable_failure` and return a friendly recoverable response instead of forcing resend
- mint a fresh `token_hash` on each recovery attempt during the verified-session window

Result: once the OTP is correctly consumed, the user never needs a new OTP just because auth was flaky.

### 4) Remove non-essential DB work from the verify hot path
For new users:
- do `createUser`
- return the session token as soon as possible
- defer profile/role hydration to the existing authenticated bootstrap path (`useAuthState` already has auto-heal logic for missing profile/role)

Result: verify becomes much faster and less failure-prone.

### 5) Make the client resume sign-in, not re-verify OTP
In `src/hooks/useAuthPage.ts` and `src/pages/AuthPage.tsx`:
- keep `reqId` and entered OTP in state while recovery is still possible
- on verify timeout or `auth_retryable_failure`, do not tell the user to resend
- replace the current timeout loop with a recovery state:
  - “Code verified. Finishing sign-in…”
  - CTA: `Continue sign-in`
- if `supabase.auth.verifyOtp({ token_hash })` fails, keep the same session state and request a fresh token from the verified backend session instead of asking for a new OTP
- keep raw `fetch()` for OTP functions

Result: no more dead state after a correct OTP.

## Files to change

- `supabase/functions/msg91-send-otp/index.ts`
- `supabase/functions/msg91-verify-otp/index.ts`
- one new migration for `phone_auth_sessions`
- optionally one shared helper under `supabase/functions/_shared/` for session transitions
- `src/hooks/useAuthPage.ts`
- `src/pages/AuthPage.tsx`
- E2E tests in `e2e/`

## Safety / no-regression rules

- Preserve current contract where possible:
  - send returns `{ success, message, reqId }`
  - verify returns `{ success, token_hash, is_new_user }` on success
- Preserve Apple review bypass
- Preserve friendly handling for invalid/expired OTPs
- Do not edit generated auth client files
- Keep the auth session table inaccessible to the client
- Do not rely on in-memory Maps for correctness

## End-to-end behavior after this fix

```text
Send OTP
  -> one durable session row
  -> one provider send max per active window

Verify OTP
  -> MSG91 success or 703 marks session as provider_verified
  -> backend auth succeeds -> token_hash returned -> login completes

If auth is flaky
  -> session stays provider_verified/auth_retryable_failure
  -> user taps Continue sign-in
  -> backend skips MSG91, mints a fresh token_hash
  -> no new OTP required
```

## Regression tests to add

1. Fresh phone -> OTP sent once -> verify -> login succeeds  
2. Double-tap Send OTP -> same `reqId`, one provider send  
3. Verify succeeds at provider but auth fails -> retry resumes login without new OTP  
4. 703 after prior success -> recovery succeeds, no “OTP already used” dead state  
5. Invalid OTP still shows friendly error  
6. Expired OTP still forces resend  
7. Apple bypass still works  
8. Slow auth backend never causes a white-screen/runtime loop

This is the smallest change that makes the flow genuinely reliable: provider verification becomes durable, session creation becomes retryable, and the user cannot get trapped after entering a correct OTP.
