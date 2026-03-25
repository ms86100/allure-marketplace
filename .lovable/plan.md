

# App Store / Play Store Production Readiness Audit — Round 4

## Issue 1: `reset-and-seed-scenario` Edge Function is Publicly Callable — Full Database Wipe

**Severity: P0 — Critical Security / Data Destruction**

**Evidence** — `supabase/config.toml` line 57-58:
```toml
[functions.reset-and-seed-scenario]
verify_jwt = false
```

`supabase/functions/reset-and-seed-scenario/index.ts` lines 1-22: No `withAuth`, no `getUser`, no authorization check whatsoever. The function uses the service role key to **purge all user data, listings, orders, and related records** then seeds test data.

**Exact Scenario**: Anyone with knowledge of the Supabase project URL can call:
```
POST https://ywhlqsgvbkvcvqlsniad.supabase.co/functions/v1/reset-and-seed-scenario
```
No token needed. The function executes with service role privileges and destroys all production data.

**Root Cause**: `verify_jwt = false` + zero in-code auth. The function was built for dev/test and never gated for production.

**User Impact**: Complete data loss — all users, orders, seller profiles, financial records wiped and replaced with seed data.

**App Store Risk**: Not a rejection cause directly, but a catastrophic production incident that would destroy the business and all user trust.

**Recommended Fix**: Add `withAuth` + admin role check (like `manage-cron-jobs` does), or remove the function entirely from production deployment.

---

## Issue 2: `auto-cancel-orders` Edge Function Has No Authentication — Public Invocation

**Severity: P0 — Security**

**Evidence** — `supabase/config.toml` line 3-4:
```toml
[functions.auto-cancel-orders]
verify_jwt = false
```

`supabase/functions/auto-cancel-orders/index.ts` lines 17-22: No auth check. Uses service role key. Designed to be called by a cron job, but anyone can invoke it at any time.

**Exact Scenario**: Attacker calls the endpoint repeatedly → all orders in cancellable statuses with `auto_cancel_at` set are cancelled immediately, even if the timeout hasn't actually elapsed. Wait — the function does check `lt('auto_cancel_at', now)`, so timing isn't bypassable. However, the function also cancels "orphaned UPI orders" older than 30 minutes with `payment_status = pending`. An attacker can trigger this on-demand to sweep any pending-payment order that's 30+ minutes old, even if the buyer is still in the payment flow.

**Root Cause**: Cron-invoked functions should still validate the caller is the cron service or an admin. Compare with `process-settlements` which correctly checks for service-role authorization.

**User Impact**: Orders cancelled prematurely or maliciously. Buyers who paid but webhook is delayed lose their order.

**Recommended Fix**: Add service-role-key check like `process-settlements` does (line 15-16).

---

## Issue 3: Auth Page Legal Links Open External Browser with `www.sociva.in` — Content May Not Exist

**Severity: P0 — Rejection Risk**

**Evidence** — `src/pages/AuthPage.tsx` lines 167-168:
```tsx
<a href="https://www.sociva.in/terms" target="_blank" ...>Terms & Conditions</a>
<a href="https://www.sociva.in/privacy-policy" target="_blank" ...>Privacy Policy</a>
```

The app uses `HashRouter` (`src/App.tsx` line 491). All in-app routes are hash-based: `/#/terms`, `/#/privacy-policy`. The links point to `https://www.sociva.in/terms` — a **non-hash URL**. This will only work if the web server at `www.sociva.in` is configured with a catch-all redirect to `index.html` (SPA fallback). If it isn't (e.g., static hosting without rewrite rules, or if only `/#/terms` works), the link returns a 404.

Additionally, `target="_blank"` on a native Capacitor WebView opens the **system browser**, taking the user completely outside the app. Even if the URL resolves, the user leaves the registration flow.

**Exact Scenario**: Apple reviewer on the signup page taps "Terms & Conditions" → system browser opens → if `www.sociva.in` isn't deployed with SPA fallback, shows 404 → **rejection** (Guideline 5.1.2).

**Root Cause**: External absolute URLs used instead of in-app `<Link to="/terms">` navigation (which would use `/#/terms` via HashRouter).

**Recommended Fix**: Use React Router `<Link>` or navigate programmatically to `/terms` within the app. Alternatively, use `https://www.sociva.in/#/terms` if external browser is intentional.

---

## Issue 4: `seed-test-data` Edge Function Also Has No Auth — Publicly Callable

**Severity: P1 — Security**

**Evidence** — `supabase/config.toml` line 45-46: `verify_jwt = false`. `supabase/functions/seed-test-data/index.ts`: Only imports for CORS headers visible, no `withAuth` or `getUser` call.

**Exact Scenario**: Anyone can inject test data into the production database by calling this function endpoint.

**Root Cause**: Same pattern as `reset-and-seed-scenario` — dev/test function deployed to production without auth gate.

**Recommended Fix**: Add admin auth check or exclude from production deployment.

---

## Issue 5: `locationAuthorizationRequest: 'WhenInUse'` Combined with `stopOnTerminate: false` and `preventSuspend: true`

**Severity: P1 — Apple Review Scrutiny**

**Evidence** — `src/hooks/useBackgroundLocationTracking.ts` lines 254-266:
```ts
stopOnTerminate: false,    // Continue after app killed
preventSuspend: true,      // Keep app alive
locationAuthorizationRequest: 'WhenInUse',  // Only "When In Use" permission
```

And `capacitor.config.ts` declares `NSLocationAlwaysAndWhenInUseUsageDescription` (line 83) — which is the string for "Always" permission. But the code only requests "When In Use". This creates a contradiction:

1. The plist declares an "Always" usage description (required for the "Always" permission prompt)
2. The code only requests "WhenInUse" permission
3. But configures `stopOnTerminate: false` + `preventSuspend: true` which are "Always"-level behaviors

On iOS, `stopOnTerminate: false` with "When In Use" permission is effectively ignored — the OS kills the process. But Apple's automated review may flag the declared "Always" usage description as unused (no code path requests "Always" permission), or flag the contradiction between declared capability and actual permission level.

**Exact Scenario**: Apple automated scan sees `NSLocationAlwaysAndWhenInUseUsageDescription` in plist → checks entitlements for `UIBackgroundModes: location` → checks code never calls `requestAlwaysAuthorization` → flags as unused privacy declaration or excessive permission declaration → rejection or follow-up inquiry.

**Root Cause**: Permission request level doesn't match plist declaration or background behavior configuration.

**Recommended Fix**: Either request `'Always'` permission (if delivery tracking truly needs it) or remove `NSLocationAlwaysAndWhenInUseUsageDescription` from plist and set `stopOnTerminate: true`.

---

## Issue 6: `config.toml` Has Wrong `project_id` — Mismatched Supabase Reference

**Severity: P1 — Deployment / Routing Risk**

**Evidence** — `supabase/config.toml` line 1:
```toml
project_id = "rvvctaikytfeyzkwoqxg"
```

But the actual Supabase project ref (from `.env`) is `ywhlqsgvbkvcvqlsniad`. The `config.toml` references a completely different project.

**Exact Scenario**: If any tooling uses `config.toml`'s `project_id` for deployment targeting (e.g., `supabase deploy` CLI commands), edge functions could be deployed to the wrong project. Lovable Cloud may handle this differently, but it's a configuration inconsistency that could cause issues with local dev, CI/CD, or any tooling that reads `config.toml`.

**Root Cause**: The `project_id` was never updated when the project was migrated or reconnected.

**Recommended Fix**: This is auto-managed by Lovable — verify it doesn't cause issues. If using any external Supabase CLI, this will route to the wrong project.

---

## Issue 7: Payment Verification Still Shows "Success" After Timeout — False Confirmation

**Severity: P1 — Financial Integrity**

**Evidence** — `src/components/payment/RazorpayCheckout.tsx` lines 71-77:
```tsx
if (attempt >= MAX_ATTEMPTS) {
  console.warn('[Payment] Backend verification timed out after 20s');
  setStatus('success');      // ← Still shows "Payment Successful!"
  setTimeout(() => onPaymentSuccess(paymentId), 1200);
  return;
}
```

After 20s of polling (10 attempts), if the webhook hasn't confirmed payment, the UI **still shows "Payment Successful!"** and calls `onPaymentSuccess`. The comment says "Still proceed" but the user sees a definitive green checkmark with "Payment Successful! Your order is confirmed."

**Exact Scenario**: Razorpay webhook is delayed 25s (common under load or network issues) → polling times out → UI shows "Payment Successful!" → user navigates to orders → order still shows `payment_pending` → auto-cancel cron fires 30 min later → order cancelled → user paid but lost their order.

**Root Cause**: The timeout fallback still uses `setStatus('success')` instead of showing an intermediate "Payment received, confirmation pending" state.

**Recommended Fix**: Show a different state on timeout — e.g., "Payment received — we're confirming your order" with a link to the orders page, not a green success checkmark.

---

## Summary Table

| # | Issue | Severity | Type | Action |
|---|---|---|---|---|
| 1 | `reset-and-seed-scenario` publicly callable — wipes database | **P0** | Security | Add auth or remove from prod |
| 2 | `auto-cancel-orders` no auth — can be triggered externally | **P0** | Security | Add service-role check |
| 3 | Auth page legal links may 404 in native WebView | **P0** | Code fix | Use in-app navigation |
| 4 | `seed-test-data` publicly callable | **P1** | Security | Add auth |
| 5 | Location permission request vs plist declaration mismatch | **P1** | Config | Align permission level |
| 6 | `config.toml` has wrong `project_id` | **P1** | Config | Verify/update |
| 7 | Payment timeout still shows "Success" green checkmark | **P1** | Code fix | Show pending state |

Items 1, 2, 3, 4, 7 are code-fixable. Items 5, 6 require configuration review.

