

# App Store / Play Store Submission Audit — Production Readiness

## Issue 1: `/help` Route Requires Authentication — Apple Reviewer Blocked

**Severity: P0 — Rejection Risk**

**Evidence** — `src/App.tsx` line 437:
```tsx
<Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
```

`STORE_METADATA.md` lists `https://www.sociva.in/help` as the Support URL submitted to both stores.

**Scenario**: Apple reviewer clicks the Support URL from the App Store listing → redirected to `/auth` login page → cannot access help content → **rejection for broken support link** (Guideline 2.3 — Accurate Metadata).

**Root Cause**: Help page wrapped in `ProtectedRoute`. Store Support URLs must be publicly accessible.

**App Store Risk**: Apple explicitly requires the Support URL to be accessible without login. This is a known, common rejection reason.

**Recommended Fix**: Remove `ProtectedRoute` wrapper from `/help` route. Make it public like `/privacy-policy` and `/terms`.

---

## Issue 2: Background Location Usage Without Proper Justification String

**Severity: P0 — Rejection Risk**

**Evidence** — `capacitor.config.ts` line 83:
```
NSLocationAlwaysAndWhenInUseUsageDescription: 'Sociva uses your location to verify your residential society membership and show nearby sellers, even in the background.'
```

`useBackgroundLocationTracking.ts` line 254: `stopOnTerminate: false` — GPS continues after app termination.

But the usage description says "verify residential society membership and show nearby sellers" — this is a FOREGROUND use case. Apple will ask: **why does verifying membership need background location?**

The actual reason is delivery tracking (seller/rider GPS broadcasting), but the plist string doesn't mention it.

**Scenario**: Apple reviewer sees `NSLocationAlwaysAndWhenInUseUsageDescription` → reads "verify membership" → sees background location capability → flags as unjustified background usage → **rejection** (Guideline 5.1.1 — Data Collection and Storage).

**App Store Risk**: Apple is extremely strict about background location. The description MUST explain the specific delivery/tracking use case.

**Recommended Fix**: Update to: `'Sociva uses your location in the background to provide real-time delivery tracking when you are making deliveries as a seller.'`

---

## Issue 3: `TEAM_ID` Placeholder in AASA — Universal Links Fail During Review

**Severity: P0 — Rejection Risk**

**Evidence** — `public/.well-known/apple-app-site-association` contains `TEAM_ID.app.sociva.community`.

**Scenario**: Apple's AASA validator fetches `https://www.sociva.in/.well-known/apple-app-site-association` → finds literal string `TEAM_ID` → universal links validation fails → app may be rejected or universal links won't work.

**App Store Risk**: If the app claims Associated Domains, Apple validates the AASA file. A placeholder breaks this validation.

**Recommended Fix**: Replace `TEAM_ID` with your actual Apple Developer Team ID before deploying the web app to `www.sociva.in`. This is a manual action outside Lovable.

---

## Issue 4: `SHA256_FINGERPRINT_PLACEHOLDER` in Android Asset Links

**Severity: P1 — Play Store Risk**

**Evidence** — `public/.well-known/assetlinks.json` line 7: `"SHA256_FINGERPRINT_PLACEHOLDER"`.

**Scenario**: Google verifies asset links for App Links. Placeholder value means Android App Links silently fail — deep links open in browser instead of app.

**Recommended Fix**: Replace with your actual signing key SHA256 fingerprint (from `keytool` or Play Console).

---

## Issue 5: Privacy Manifest Missing `NSPrivacyAccessedAPICategoryUserDefaults` Reason for Capacitor Storage

**Severity: P1 — Potential Rejection**

**Evidence** — `PrivacyInfo.xcprivacy` declares `CA92.1` for UserDefaults. But the app uses `@capacitor/preferences` (which wraps UserDefaults) for auth session persistence AND `persistent-kv.ts` for celebration banners. Apple's new enforcement (Spring 2024+) requires ALL UserDefaults usage to be declared with correct reason codes.

`CA92.1` covers "accessing user defaults to read/write data within the app." This is likely correct, but verify that all Capacitor plugins using UserDefaults are covered. If any plugin uses UserDefaults for a purpose not covered by `CA92.1`, Apple will reject.

**App Store Risk**: Moderate — `CA92.1` is the catch-all for app-internal UserDefaults. Should pass, but review against actual Capacitor plugin behavior.

---

## Issue 6: No Crash/ANR Monitoring in Production

**Severity: P1 — Production Stability Risk**

**Evidence**: No Sentry, Crashlytics, or equivalent crash reporting integration found in the codebase. The `ErrorBoundary` components exist but only catch React render errors — they don't report to an external service.

**Scenario**: App crashes in production → no visibility → bad reviews accumulate → store rating drops below threshold.

**App Store Risk**: Not a direct rejection cause, but Apple's automated testing may flag ANRs. Without monitoring, you won't know about crashes until user reviews.

**Recommended Fix**: Add Firebase Crashlytics or Sentry before go-live. This is a manual native integration.

---

## Issue 7: Razorpay Payment — No Server-Side Verification of `payment.captured` Before Updating UI

**Severity: P1 — Financial Integrity Risk**

**Evidence** — `useRazorpay.ts` line 181-184:
```tsx
handler: function (response: any) {
  options.onSuccess(response.razorpay_payment_id, response.razorpay_order_id);
}
```

The client-side handler fires `onPaymentSuccess` immediately when Razorpay's frontend SDK reports success. The webhook (`razorpay-webhook/index.ts`) also processes `payment.captured` — but the UI has already shown "Payment Successful!" and navigated away.

**Scenario**: Razorpay SDK reports success → client marks order as paid → webhook delivery is delayed or fails → order shows paid in UI but backend still shows `payment_pending`.

The system does have webhook processing, but there's no client-side verification step (polling order status after payment to confirm backend received it).

**App Store Risk**: Not a rejection risk, but a financial integrity risk in production. Users see "Payment Successful" before backend confirms.

**Recommended Fix**: After `onPaymentSuccess`, poll the order's `payment_status` for a few seconds to confirm backend has updated. Show "Verifying payment..." during this window.

---

## Issue 8: Demo Account Verification Needed

**Severity: P1 — Rejection Risk**

**Evidence**: `STORE_METADATA.md` lists `demo@sociva.app / Demo@12345` as review credentials. But the app uses phone-based OTP authentication (MSG91), not email/password.

**Scenario**: Apple reviewer tries to log in with `demo@sociva.app` and `Demo@12345` → the auth flow is phone OTP only → reviewer cannot log in → **rejection** (Guideline 2.1 — App Review Information).

**App Store Risk**: Critical. If the demo account doesn't match the actual login flow, immediate rejection.

**Recommended Fix**: Either (a) provide a phone number + auto-verified OTP for the reviewer, or (b) add an email/password fallback specifically for the demo account, or (c) provide a pre-authenticated test flight build. This is a manual action.

---

## Issue 9: Refund Policy Page Exists But Not Declared in Store Metadata

**Severity: P2 — Compliance Gap**

**Evidence**: `/refund-policy` route exists and is accessible. But `STORE_METADATA.md` only lists Privacy Policy and Terms URLs for store submission. Google Play requires a visible refund/cancellation policy for apps with in-app purchases or payments.

**Recommended Fix**: Add `https://www.sociva.in/refund-policy` to Play Store listing under "Refund Policy" or link it from the app description.

---

## Issue 10: `stopOnTerminate: false` May Trigger Background Processing Review

**Severity: P1 — Apple Review Scrutiny**

**Evidence** — `useBackgroundLocationTracking.ts` line 254:
```ts
stopOnTerminate: false,
```

This keeps GPS running after the app is force-quit. Apple is aggressive about apps that continue background processing after termination. Combined with `locationAuthorizationRequest: 'WhenInUse'` (line 266), this creates a contradiction — you request "When In Use" permission but configure the SDK to run after termination.

**App Store Risk**: Apple may flag this during review as excessive background activity. The Transistorsoft plugin handles this correctly on iOS (it uses significant location changes after termination), but the contradiction in permission level vs. behavior may invite scrutiny.

**Recommended Fix**: Ensure the Xcode project has `UIBackgroundModes: location` in Info.plist. If you only have "When In Use" permission, `stopOnTerminate: false` is effectively ignored on iOS — but it's better to be explicit.

---

## Summary Table

| # | Issue | Severity | Type | Action |
|---|---|---|---|---|
| 1 | `/help` requires auth — blocks Apple reviewer | **P0** | Code fix | Remove ProtectedRoute |
| 2 | Background location description doesn't mention delivery | **P0** | Code fix | Update plist string |
| 3 | AASA `TEAM_ID` placeholder | **P0** | Manual | Replace before deploy |
| 4 | Android `SHA256` placeholder | **P1** | Manual | Replace before deploy |
| 5 | Privacy manifest UserDefaults coverage | **P1** | Verify | Review Capacitor plugins |
| 6 | No crash monitoring | **P1** | Manual | Add Crashlytics/Sentry |
| 7 | Payment UI confirms before backend | **P1** | Code fix | Add verification polling |
| 8 | Demo account vs phone OTP mismatch | **P1** | Manual | Provide phone-based demo |
| 9 | Refund policy not in store metadata | **P2** | Manual | Add URL to listing |
| 10 | `stopOnTerminate` vs WhenInUse contradiction | **P1** | Review | Verify Xcode config |

**I can fix items 1 and 2 immediately (code changes). Items 3, 4, 6, 8 require manual action outside the codebase. Item 7 is a code enhancement. Want me to proceed with the fixes?**

