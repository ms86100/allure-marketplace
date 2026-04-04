
Root cause summary

This is not a database-space problem. The evidence points to a Lovable Cloud origin-timeout problem plus a partial OTP refactor that added blocking backend dependencies into the login path.

What I verified
- Browser logs show repeated `POST /auth/v1/token?grant_type=refresh_token` and REST requests failing with `Failed to fetch`.
- Edge logs for `msg91-send-otp` show a real OTP send success, then `Failed to create phone auth session: ... 522 Connection timed out`.
- Read-only backend queries and metadata calls are returning `544 Connection terminated due to connection timeout`.
- The repo contains `supabase/functions/_shared/phone-session.ts`, but no migration was found for `public.phone_auth_sessions`, and no migration was found for `cleanup_expired_auth_sessions`.

Why it broke after “working earlier”
1. The previously frozen OTP flow was partially replaced with a DB-backed state machine before the schema/supporting RPC was properly codified in the repo.
2. The new send function now waits on database work after MSG91 success.
3. The new verify function now waits on database lookup and auth-admin work with no hard server timeout.
4. At the same time, the auth screen is creating extra backend traffic (`societies` load on mount + stale refresh-token attempts), which makes recovery worse during backend instability.

Most likely failure chain
- OTP provider succeeds
- edge function blocks on session-table work or auth token minting
- browser-side timeout fires first
- user retries against a backend that is still timing out
- the flow feels random even with only 2 users

Plan to stabilize ASAP

1. Make OTP send non-blocking
- `msg91-send-otp` must return immediately after provider success.
- Session cleanup and session insert must become best-effort, short-timeout, non-blocking work.
- If the database is slow, OTP send must still succeed and return `reqId`.

2. Make OTP verify fail fast and recover cleanly
- Add hard internal timeout wrappers around:
  - `findSessionByReqId`
  - `auth.admin.generateLink`
  - `auth.admin.createUser`
- Keep 703 as a success/recovery path even when session-table state is unavailable.
- Database state updates must be optional; they cannot delay the verify response.

3. Reduce auth-screen load
- Stop fetching societies on initial auth page mount; only fetch when the user actually reaches the society step.
- Clear stale local auth state when the user is on `/auth` without a valid user so the SDK stops retrying refresh-token requests in the background.

4. Fix the schema drift properly
- Add a real migration for `public.phone_auth_sessions`.
- Add the cleanup RPC in the repo.
- Re-enable the durable state machine only as a recovery optimization, not as a prerequisite for returning send/verify responses.

5. Align client behavior with backend behavior
- Send timeout should be slightly above the provider timeout plus cold-start margin.
- Verify should return a recoverable response before the browser aborts.
- Replace endless “tap Verify again” loops with an explicit recovery state like “Finishing sign-in…” / “Continue sign-in”.

Files to update
- `supabase/functions/msg91-send-otp/index.ts`
- `supabase/functions/msg91-verify-otp/index.ts`
- `src/hooks/useAuthPage.ts`
- `src/pages/AuthPage.tsx`
- `src/contexts/auth/useAuthState.ts`
- new migration for `phone_auth_sessions` + cleanup RPC

Technical details
- `src/hooks/useAuthPage.ts` currently calls `fetchSocieties()` on mount and aborts send after 5s / verify after 15s.
- `msg91-send-otp` currently awaits `createSession()` after the provider already returned success.
- `msg91-verify-otp` currently awaits `findSessionByReqId()` before provider verification and has no hard timeout around token minting/user creation calls.
- That is why increasing database space did nothing: the failure is backend origin/connectivity/compute latency, not stored data size.

Expected result after implementation
- OTP send becomes immediate again.
- Verify either completes quickly or returns a clean recoverable response before the browser gives up.
- A correct OTP is no longer trapped by a slow backend.
- If infrastructure is still unstable after these code fixes, the relevant platform lever is Lovable Cloud instance health/size, not database space.
