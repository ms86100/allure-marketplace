

# App Store / Play Store Production Readiness Audit — Round 2

## Issue 1: STORE_METADATA Age Rating Says "Location Sharing = No" — Incorrect

**Severity: P0 — Rejection Risk**

**Evidence** — `STORE_METADATA.md` line 168:
```
- Does the app share location? **No**
```

But the app:
- Has `NSLocationAlwaysAndWhenInUseUsageDescription` (background location)
- Uses `useBackgroundLocationTracking.ts` with `stopOnTerminate: false`
- Broadcasts GPS coordinates to other users via delivery tracking
- Uses location for society membership verification

**Scenario**: Apple reviewer sees background location permission + delivery tracking GPS broadcasting → checks age rating questionnaire → "location sharing = No" → **metadata rejection** (Guideline 2.3.1).

**Root Cause**: `STORE_METADATA.md` was never updated when delivery tracking was added.

**Recommended Fix**: Change line 168 to `**Yes** (for delivery tracking and society verification)`.

---

## Issue 2: Demo Account Uses Email/Password but App Uses Phone OTP

**Severity: P0 — Rejection Risk**

**Evidence** — `STORE_METADATA.md` lines 105-106:
```
Email: demo@sociva.app
Password: DemoReview2026!
```

The app uses MSG91 phone OTP login exclusively (memory confirms "unified phone-based OTP login"). There is no email/password login flow in the app.

**Scenario**: Apple reviewer opens app → sees phone number input → tries email/password credentials → cannot log in → **immediate rejection** (Guideline 2.1).

**Root Cause**: Demo credentials predate the switch to phone-only OTP.

**Recommended Fix**: Either provide a phone number with auto-bypass OTP for Apple review, or implement a hidden email/password path for the demo account only. This is a manual/product decision.

---

## Issue 3: `delete-user-account` Has No Transaction — Partial Deletion on Failure

**Severity: P1 — GDPR / App Store Compliance Risk**

**Evidence** — `supabase/functions/delete-user-account/index.ts` lines 65-92:

The function iterates through 25+ tables sequentially with individual `DELETE` calls. If table 15 fails (network timeout, RLS error), tables 1-14 are already deleted but tables 16-25 still have data. The auth user is NOT deleted (line 92 never reached).

```ts
for (const { table, column } of cleanupTables) {
  await supabaseAdmin.from(table).delete().eq(column, userId);
}
// ... then later:
const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
```

No rollback mechanism. User's account is partially wiped — they can still log in but with broken data state.

**Scenario**: User requests account deletion → deletion fails at `chat_messages` table → favorites, reviews, cart items already deleted → user logs back in to find partial data → confused, submits App Store complaint.

**App Store Risk**: Apple requires account deletion to work reliably (Guideline 5.1.1(v)). A broken partial deletion violates this requirement. Google Play has similar requirements since 2023.

**Recommended Fix**: Wrap cleanup in a database function (single transaction), or at minimum catch per-table errors and continue, then delete auth user regardless. Log failures for manual cleanup.

---

## Issue 4: No Crash Reporting / Monitoring in Production

**Severity: P1 — Production Stability**

**Evidence**: Searched for `Sentry`, `crashlytics`, `crash.*report` — zero matches in any integration code. Only `ErrorBoundary` components exist, which catch React render errors but don't report them externally.

**Scenario**: App crashes on specific device/OS combination → no telemetry → users leave 1-star reviews → you discover the issue weeks later from App Store reviews.

**App Store Risk**: Not a direct rejection cause, but Apple's automated testing flags ANRs and crashes. Without monitoring, you're blind to issues that could trigger removal.

**Recommended Fix**: Integrate Firebase Crashlytics (already have Firebase for push). Native integration required in Xcode/Android Studio.

---

## Issue 5: `TEAM_ID` and `SHA256_FINGERPRINT_PLACEHOLDER` Still in Production Files

**Severity: P0 — Rejection Risk (Universal Links / App Links)**

**Evidence**:
- `public/.well-known/apple-app-site-association`: `TEAM_ID.app.sociva.community`
- `public/.well-known/assetlinks.json`: `SHA256_FINGERPRINT_PLACEHOLDER`

These are served by `www.sociva.in`. Apple validates AASA during review. Google validates assetlinks for App Links.

**Scenario**: Apple review bot fetches AASA → sees literal `TEAM_ID` → universal links fail → Associated Domains entitlement is unjustified → rejection or universal links silently broken.

**Recommended Fix**: Replace with real values before deploying web assets to `www.sociva.in`. This is a manual action — you need your Apple Team ID and your Android signing key SHA256 fingerprint.

---

## Issue 6: Payment Verification Falls Back to "Trust SDK" After Timeout

**Severity: P1 — Financial Integrity**

**Evidence** — `RazorpayCheckout.tsx` lines 67-72:
```tsx
if (attempt >= MAX_ATTEMPTS) {
  // Backend hasn't confirmed yet — trust SDK and proceed
  console.warn('[Payment] Backend verification timed out, proceeding with SDK success');
  setStatus('success');
  setTimeout(() => onPaymentSuccess(paymentId), 1200);
  return;
}
```

After 12s of polling, if the webhook hasn't confirmed payment, the UI shows "Success" anyway. The user navigates away believing payment is confirmed. If webhook eventually fails or is delayed beyond 12s, the order stays `payment_pending` in the DB → gets auto-cancelled → user is confused.

**Scenario**: Webhook is delayed 20s (common under load) → UI says success → user sees order → 30 minutes later order is auto-cancelled → user paid but order cancelled.

**Root Cause**: Optimistic trust of client-side SDK callback without backend confirmation.

**Recommended Fix**: Instead of falling through to success, show a "Payment received — confirming with your bank" intermediate state with a longer background poll, or link to the orders page where real-time subscription will update when webhook processes.

---

## Issue 7: Razorpay Checkout Polls Single `orderId` but Payment May Cover Multiple Orders

**Severity: P1 — Multi-Vendor Payment Desync**

**Evidence** — `RazorpayCheckout.tsx` lines 55-59:
```tsx
const { data } = await supabase
  .from('orders')
  .select('payment_status')
  .eq('id', orderId)    // Only checks FIRST order
  .maybeSingle();
```

Props accept `orderIds?: string[]` (line 19), but verification only polls the first `orderId`. In a multi-vendor cart, the webhook updates ALL orders, but the UI only checks one.

**Scenario**: Multi-vendor order (3 sellers) → webhook processes order 2 first → poll on order 1 hasn't updated yet → 6 attempts pass → falls back to "trust SDK" → shows success but order 1 might still be pending.

**Root Cause**: Verification logic doesn't account for multi-order payments.

**Recommended Fix**: Poll using `.in('id', orderIds || [orderId])` and check that ALL orders are `paid`.

---

## Summary Table

| # | Issue | Severity | Type | Action |
|---|---|---|---|---|
| 1 | Age rating "location = No" is wrong | **P0** | Metadata fix | Update STORE_METADATA.md |
| 2 | Demo account email/password vs phone OTP | **P0** | Manual | Provide phone-based demo |
| 3 | Partial account deletion on failure | **P1** | Code fix | Wrap in transaction or continue-on-error |
| 4 | No crash monitoring | **P1** | Manual | Add Crashlytics |
| 5 | AASA/assetlinks placeholders | **P0** | Manual | Replace before deploy |
| 6 | Payment verification falls back to trust SDK | **P1** | Code fix | Show intermediate state |
| 7 | Multi-order payment polls single order | **P1** | Code fix | Poll all orderIds |

Items 1, 3, 6, 7 are code-fixable. Items 2, 4, 5 require manual action. Want me to fix the code-level issues?

