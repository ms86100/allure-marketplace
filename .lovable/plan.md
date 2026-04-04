
Root cause

This is not an OTP-delivery problem. The SMS step is working.

Evidence already points to this sequence:
- `msg91-send-otp` returns `200` with a real `reqId`
- the first verify call gets aborted client-side
- later verify calls return `{"pending":true,"verified":true,"recoverable":true}`
- the UI changes to “Continue sign-in”
- sign-in never finishes

Why this happens:
1. The old verify flow was synchronous: verify OTP -> mint login token -> return token.
2. The new verify flow split that into:
   - provider verification
   - optional session-table persistence
   - background sign-in finalization
3. The new flow now depends on `phone_auth_sessions` plus background work (`runInBackground` / `waitUntil`) to finish later.
4. But:
   - no repo migration was found for `phone_auth_sessions`
   - no repo migration was found for `cleanup_expired_auth_sessions`
   - backend metadata reads are timing out (`544`)
   - function logs show shutdowns, not successful completion
5. Result: OTP gets accepted by MSG91, but the token-minting step does not reliably complete before the function exits. The client is then stuck in a pending loop.

Why receiving the OTP does not contradict this
````text
Phone receives OTP  = step 1 succeeded
Login completes     = step 2/3 succeeded

Your app is failing in step 2/3, not step 1.
````

Key differences from the backup

1. `supabase/functions/msg91-verify-otp/index.ts`
- Backup: one request, one response, immediate `token_hash`
- Current: state machine + background finalize + `pending` responses

2. `src/hooks/useAuthPage.ts`
- Backup: expects immediate success/error from verify
- Current: added “Continue sign-in” recovery path and pending handling

3. `supabase/functions/msg91-send-otp/index.ts`
- Backup: simple env-secret provider call
- Current: adds rate limits + credential fallback + session-table cleanup/create logic
- This is not the main blocker now, but it adds extra failure surface to auth

Primary root cause

The biggest regression is the verify refactor:
- it moved session creation out of the guaranteed request-response path
- it introduced a DB-backed recovery mechanism that is not fully codified in the repo
- it relies on background completion, but the live behavior shows that completion is not reliable

Bulletproof fix

Phase 1 — emergency stabilization (recommended now)
Goal: go back to a deterministic login transaction.

1. Rebuild `msg91-verify-otp` from the frozen backup shape
- make it synchronous again
- always try to return `token_hash` in the same request
- remove `pending` / background-finalize behavior from the critical path

2. Keep one critical improvement from the newer version
- treat MSG91 `703` as recovery success, not failure
- flow should be:
  - OTP verify success -> continue
  - OTP already verified (703) -> also continue
  - wrong / expired / max attempts -> friendly error

3. Remove `phone_auth_sessions` from the login critical path
- do not require session-table reads/writes to finish sign-in
- do not depend on cleanup RPC during login
- if the table is kept at all, it should be optional telemetry/recovery only

4. Replace “Continue sign-in” with true retryable verify
- no endless `pending:true`
- if backend auth token minting times out, return a recoverable `503`
- client keeps the same `reqId` and same OTP
- user taps Verify again
- because `703` is treated as success, retry resumes login without needing a new OTP

5. Make retry behavior explicit and safe
- no auto-retry for verify
- keep current `fetch()` approach
- keep duplicate-submit guard
- remove OTP auto-submit on 4 digits to avoid hidden duplicate verification attempts

6. Simplify `msg91-send-otp`
- keep the good parts: env-first secrets and outbound timeout
- remove session-table cleanup/create from the hot path for now
- do not block send on any DB/session persistence work

Phase 2 — only after stable
If durable recovery is still needed later:
- add a real migration for `public.phone_auth_sessions`
- add the cleanup RPC migration
- add a separate “resume sign-in” endpoint or status endpoint
- only then reintroduce a state machine
- never rely on background work without a guaranteed polling/resume contract

Files to update

Must change now:
- `supabase/functions/msg91-verify-otp/index.ts`
- `src/hooks/useAuthPage.ts`
- `src/pages/AuthPage.tsx`
- `supabase/functions/msg91-send-otp/index.ts`

Use as baseline/reference:
- `supabase/functions/msg91-verify-otp/index.ts.FROZEN_BACKUP`
- `src/hooks/useAuthPage.ts.FROZEN_BACKUP`
- `supabase/functions/msg91-send-otp/index.ts.FROZEN_BACKUP`

Do not rely on in emergency fix:
- `supabase/functions/_shared/phone-session.ts`

Optional later:
- migration for `phone_auth_sessions`
- migration for `cleanup_expired_auth_sessions`

Technical implementation shape

Target verify contract:
````text
POST verify
  -> MSG91 success OR 703
  -> generate/find user
  -> generate login token
  -> return { success: true, token_hash, is_new_user }

If token minting times out:
  -> return { success: false, recoverable: true, verified: true, error: "Server busy. Please tap Verify again." }
  -> keep reqId + OTP in UI
  -> next verify call uses same OTP and recovers through 703
````

Client behavior:
- remove `pending` branch
- remove “Finishing sign-in…” / “Continue sign-in” UX
- on recoverable verify failure:
  - stay on OTP step
  - do not clear OTP
  - do not restart flow
  - show “Tap Verify again”
- only clear OTP for truly invalid/expired/max-attempt responses

What should stay
- raw `fetch()` for OTP functions
- friendly error mapping
- auth-page load reductions (deferred societies/maps/settings)
- guarded submit behavior
- no auto-retry for OTP send/verify

Acceptance checks

1. Existing user:
- send OTP
- enter valid OTP
- login completes in one verify request

2. New user:
- send OTP
- enter valid OTP
- login completes and user reaches society step

3. Recovery path:
- backend token minting delayed once
- same OTP + same reqId + tap Verify again
- login succeeds without requesting a new OTP

4. Wrong OTP:
- friendly incorrect-code message

5. Expired OTP:
- friendly resend-required message

6. No dead-state UX:
- no endless “Continue sign-in”
- no repeated `pending:true` loop
- no “OTP already used” after a correct OTP unless it truly cannot be recovered

Decision

For fastest stable recovery, the safest path is:
- restore verify to the frozen synchronous model
- patch in 703 recovery
- strip session-table/background-finalization from the login path
- keep only the safe client improvements from the newer auth page
