

# P0 Production Incident: Full System Audit Report

**Reporting as:** Developer, Product Manager, QA Lead, and Business Owner — simultaneously.

---

## 1. Customer Reality (No Sugarcoating)

### Where Users Get Frustrated

**Moment 1: App Install → Blank White Screen (P0)**
The user installs via TestFlight. The app opens. Nothing renders. A white screen. No error message, no loading indicator, no retry button. The user has zero recourse. They delete the app. This has happened across multiple builds.

**Why it persists:** The fallback in `main.tsx` (line 55-59) waits 8 seconds before showing a fallback. But if the crash happens *inside* React's render tree (e.g., a context provider throws), the root element has children (the ErrorBoundary component itself is mounted), so `rootLooksEmpty()` returns `false` — the fallback never fires. The screen stays white indefinitely.

**Moment 2: Verification Limbo**
After signup, if the society admin has not approved the user, `VerificationPendingScreen` renders. But there is no way for the user to log out, change society, or edit their submitted details. They are permanently stuck until an admin acts. The only escape is "Contact support" — a link to `/help` which itself requires authentication.

**Moment 3: Cart Confusion**
User taps "Add to Cart" on a product detail sheet. Previously it navigated to cart (confusing). The fix now keeps the sheet open, but the quantity stepper appears with no visual feedback — no toast, no animation, no "Added!" confirmation. The user does not know if the action worked.

**Moment 4: Seller Dashboard — Sound Alarm With No Warning**
A seller receives a new order. The app plays a two-tone square-wave alarm at 880Hz and 660Hz, repeating every 3 seconds with haptic vibration. There is no volume control, no snooze, no way to configure this. If the seller is in a meeting or sleeping, the alarm is intrusive and cannot be silenced except by tapping "Dismiss" — which requires unlocking the phone, finding the app, and interacting with the overlay.

**Moment 5: Realtime Notifications Are Invisible on Background**
`useBuyerOrderAlerts` only works while the app is in the foreground and the React component tree is mounted. If the buyer closes the app, they receive no notification about order acceptance. The push notification system exists (`PushNotificationProvider`) but there is no evidence that the backend triggers push notifications when order status changes — the only notification path is the in-app Realtime listener.

---

## 2. QA / Tester Findings (End-to-End)

### Test 1: Fresh Install → Login → Home

| Step | Expected | Actual | Severity |
|---|---|---|---|
| Open app from TestFlight | See landing/auth page | White screen | **P0** |
| Root cause | ErrorBoundary catches render errors | ErrorBoundary is a class component wrapping the entire tree. If `AuthProvider` or any hook inside it throws during initial render, the error boundary catches it — but `import.meta.env.DEV` is false in production, so the error details are hidden. The user sees "Something went wrong" with no context | P0 |
| Secondary cause | Capacitor storage patch | `(supabase.auth as any).storage = capacitorStorage` patches storage AFTER client creation. The Supabase client's `GoTrueClient._loadSession()` may have already started with `localStorage`. The race condition: `onAuthStateChange` fires before the storage swap completes | P0 |

### Test 2: Signup Flow

| Step | Expected | Actual | Severity |
|---|---|---|---|
| Select society → Enter profile → Submit | Account created, verification pending screen | Works correctly | — |
| Verification pending → Logout | Can log out and try different society | No logout button on verification screen | **P1** |
| Verification pending → 60s poll | Auto-refreshes status | Works, but `fetchPreviewData` on line 53 uses `profile!.society_id` — if `profile.society_id` is null (user didn't select a society), this crashes | **P1** |

### Test 3: Browse → Product Detail → Add to Cart

| Step | Expected | Actual | Severity |
|---|---|---|---|
| Open product detail sheet | Details visible by default | Details visible, toggle says "Hide product details" (fixed) | — |
| Tap "Add to Cart" | Item added, stepper appears | Item added, stepper appears, NO confirmation feedback | **P2** |
| Tap stepper minus to 0 | Item removed from cart | Works | — |

### Test 4: Checkout → Order Placement

| Step | Expected | Actual | Severity |
|---|---|---|---|
| Cart → Checkout | See order summary | Works | — |
| Place order (COD) | Order created, cart cleared, redirected | Works — calls `create_multi_vendor_orders` RPC | — |
| Place order (UPI) | Razorpay opens | Razorpay only works if seller has `upi_id` configured. If not, button is disabled — but no explanation why | **P2** |

### Test 5: Seller Receives Order

| Step | Expected | Actual | Severity |
|---|---|---|---|
| Order placed by buyer | Seller gets alert | Only if seller has SellerDashboardPage open (Realtime subscription active) | **P1** |
| Seller navigates away from dashboard | Alert should still fire | Realtime channel is unmounted — no alert | **P1** |
| Seller accepts order | Buyer gets toast | Only if buyer has the app in foreground | **P1** |

### Test 6: Seller Onboarding

| Step | Expected | Actual | Severity |
|---|---|---|---|
| Apply to become seller | Application submitted | Works | — |
| Admin approves | Seller can access dashboard | Works, but requires full page refresh to pick up new role (Realtime on `user_roles` handles this) | — |
| Seller adds first product | Product listed | Works, but no guidance on required fields; product goes to `pending` approval status and seller gets no feedback about approval timeline | **P2** |

### Reproducible Bugs

1. **White screen on native** — P0, reproducible on every TestFlight build
2. **`useNewOrderAlert` only active on seller dashboard** — P1, alert does not fire if seller is on any other page
3. **`useBuyerOrderAlerts` only works in foreground** — P1, no push notification fallback
4. **Verification screen has no logout** — P1

### Silent Failures

1. `capacitor.ts` line 13: `(supabase.auth as any).storage = capacitorStorage` — If this assignment doesn't take effect (GoTrueClient has already initialized its internal storage reference), auth on native silently uses localStorage (non-persistent on iOS). No error logged.
2. `useAuthState.ts` line 163: `supabase.auth.getSession()` — On native, if the storage swap failed, this returns null session even when the user has valid credentials in Preferences. Silent session loss.
3. `main.tsx` line 53: `createRoot(rootElement).render(<App />)` — If `App` throws during render, React calls the ErrorBoundary's `componentDidCatch`. But the fallback UI is rendered inside `#root`, so `rootLooksEmpty()` returns false. The 8-second timeout never fires. If the ErrorBoundary's OWN render throws (e.g., missing CSS, broken import), the screen is blank forever.

### Regression Risks

1. Every new hook added to `App.tsx` or `AppRoutes` that calls `useAuth()` is a potential crash point during the auth loading phase
2. The `queryClient` is defined at module scope (line 94) — if two instances of App are mounted (HMR race), stale cache can bleed
3. `drop_console: mode === "production"` in `vite.config.ts` line 61 — ALL console.error/warn stripped in production. This means the fallback guards in `main.tsx` that log errors will be silently swallowed. The user sees a blank screen and the developer sees nothing.

---

## 3. Developer Honesty Check

### Fragile Code Paths

1. **Auth Storage Swap (capacitor.ts:13)** — Patching `supabase.auth.storage` after client creation is a hack. The Supabase `GoTrueClient` constructor reads `storage` once during initialization and stores an internal reference. Mutating the public property later may not affect the internal `_storage` field. This is the #1 suspect for blank screens on native.

2. **Module-scope QueryClient (App.tsx:94)** — The `QueryClient` is created outside of React's lifecycle. If the module is re-evaluated (hot reload, error recovery), a new client is created but old subscriptions reference the stale one.

3. **Auth State Race (useAuthState.ts:140-168)** — Both `onAuthStateChange` and `getSession()` can trigger `fetchProfile`. The `profileFetchedFor` ref prevents double-fetches for the same user, but if `onAuthStateChange` fires with a user BEFORE `getSession()` resolves, and then `getSession()` fires again, the profile is not re-fetched (ref already set). This is correct behavior — but if the first `fetchProfile` fails silently (network error), the profile stays null forever. There's no retry mechanism.

4. **Production Console Stripping** — `drop_console: mode === "production"` in terser config strips ALL `console.error` calls. This means:
   - `main.tsx` fallback guards log nothing
   - `ErrorBoundary.componentDidCatch` logs nothing
   - All `try/catch` blocks that only log errors become completely silent
   - This is actively making debugging impossible on production builds

### Hidden Dependencies

- `useNewOrderAlert` depends on `sellerId` which comes from `useAuth().currentSellerId` — but this is only set after profile fetch completes. If auth is loading, `sellerId` is null, and the Realtime subscription is never created. If auth finishes after the seller dashboard mounts, the `useEffect` re-runs — but there's a window where orders can arrive undetected.

- `useBuyerOrderAlerts` depends on `user.id` from `useAuth()`. If the user's session expires mid-use, the channel is cleaned up but no reconnection happens on re-auth.

### What Shortcuts Were Taken

1. Storage swap via property mutation instead of proper client configuration
2. Alert system only runs on a single page (seller dashboard) instead of globally
3. No push notification integration for order status changes — relying entirely on in-app Realtime
4. `import.meta.env.DEV` checks in error boundaries hide all error details in production — including from the user
5. No structured error reporting (no Sentry, no LogRocket, no crash analytics)

---

## 4. Product & UX Failures

### Flows That Require Too Many Steps

1. **Seller onboarding**: Apply → Wait for admin approval → Get approved → Navigate to seller dashboard → Add products → Wait for product approval → Products go live. Five wait-and-check steps with no progress indicator or timeline.

2. **User signup**: Enter email/password → Select society (search or create) → GPS verify → Enter profile details → Submit → Wait for verification. Six steps with a GPS check that can fail silently (`gpsStatus: 'unavailable'`).

### Actions That Don't Give Feedback

1. "Add to Cart" — no toast, no animation, just a quiet stepper appearance
2. Order status change by seller — no confirmation sound/animation on the seller's side
3. Profile update — depends on individual page implementation

### Features That Exist But Are Not Discoverable

1. **Society Quick Links** (`SocietyQuickLinks`) — rendered on home page but content depends on feature flags. If no features are enabled, the section is empty (invisible).
2. **Trust Directory** (`/directory`) — accessible only via profile menu or deep link. Not in bottom nav, not in quick links.
3. **Dispute System** (`/disputes`) — exists, fully built, but no entry point from order detail page unless the user knows the URL.
4. **Group Buys** (`/group-buys`) — page exists, route exists, no navigation leads to it.

### Inconsistent Behavior Across Roles

1. Bottom nav changes based on role (resident vs security vs worker) but with no transition or explanation. A user who is both a resident and a security officer sees security nav only if they're not an admin — confusing.
2. Seller dashboard alert overlay covers the entire screen. If a seller is also a buyer and receives a buyer notification at the same time, the seller overlay blocks all interaction.

---

## 5. Business Impact Assessment

### Trust

- **White screen = zero trust.** A user who downloads the app, sees nothing, and has to "reopen" it will uninstall immediately. The app has ONE chance to make a first impression on TestFlight testers.
- **Silent notification failures** mean sellers miss orders and buyers think sellers are ignoring them. Both parties lose trust in the platform.

### Churn Points

1. Verification pending screen with no logout — user is trapped
2. Seller gets no orders because alert only works on one page
3. Buyer gets no status updates when app is backgrounded

### Monetization Blockers

1. UPI payments only work if seller has configured `upi_id` — no onboarding prompt for this
2. No delivery fee transparency — `effectiveDeliveryFee` is calculated silently, user sees final amount without breakdown (actually shown, but only when delivery mode is selected)
3. Coupon system exists but is seller-managed — no platform-level promotions

### Revenue Risk

If sellers don't hear order alerts, they don't fulfill orders. If orders aren't fulfilled, buyers don't reorder. The entire marketplace flywheel depends on instant seller notification — and right now it only works on one page in one app state.

---

## 6. Hard Truth Summary

**If this app were released publicly today:**

### Users Would Complain About First:
"The app doesn't open" — blank white screen on first install.

### Would Cause 1-Star Reviews:
1. Blank screen on open (P0)
2. "I placed an order and the seller never responded" (because alerts only work on dashboard)
3. "I can't log out" (verification pending screen)

### Would Completely Block Adoption:
1. Blank screen prevents ANY user from using the app
2. Sellers not receiving alerts prevents ANY order from being fulfilled
3. No push notifications means the app only works while actively open

---

## 7. Actionable Fix Plan (No New Features)

### P0: Must Fix Before Any Release

| # | Issue | File(s) | Fix |
|---|---|---|---|
| 1 | **Console stripping in production** | `vite.config.ts` | Remove `drop_console: mode === "production"` — this silently swallows ALL error logging, making the blank screen impossible to debug. At minimum, keep `console.error` and `console.warn`. |
| 2 | **Auth storage swap race condition** | `src/integrations/supabase/client.ts`, `src/lib/capacitor.ts` | Stop patching `supabase.auth.storage` after creation. Instead, configure the Supabase client to use `capacitorStorage` from the start. In `client.ts`, conditionally pass `capacitorStorage` as the `storage` option during `createClient()`. Remove the runtime patch from `capacitor.ts`. |
| 3 | **Blank screen fallback never triggers** | `src/main.tsx` | The `rootLooksEmpty()` check fails when ErrorBoundary renders its fallback UI (root has children). Replace the 8-second check with a `MutationObserver` that watches for actual meaningful content, or set a data attribute on the root when the app successfully renders its first route. |
| 4 | **ErrorBoundary hides errors in production** | `src/components/ErrorBoundary.tsx` | The error details are hidden behind `import.meta.env.DEV`. In production, users see "Something went wrong" with zero context. Add a generic but useful message like "Error code: [first 8 chars of error message hash]" and a "Copy error details" button for support. |

### P1: Fix Before Scaling Users

| # | Issue | File(s) | Fix |
|---|---|---|---|
| 5 | **Seller alerts only work on dashboard** | `src/hooks/useNewOrderAlert.ts` | Move `useNewOrderAlert` to a global component inside `AuthProvider` (like `useBuyerOrderAlerts`), gated on `isSeller && currentSellerId`. This ensures alerts fire on ANY page. |
| 6 | **Buyer notifications only work in foreground** | `src/hooks/useBuyerOrderAlerts.ts` | This requires a backend trigger: when `orders.status` changes, fire a push notification via the existing `send-push-notification` edge function. The in-app toast is a bonus, not the primary channel. |
| 7 | **Verification screen has no logout** | `src/components/onboarding/VerificationPendingScreen.tsx` | Add a "Log out" button at the bottom. Call `signOut()` from auth context. |
| 8 | **`fetchProfile` has no retry on failure** | `src/contexts/auth/useAuthState.ts` | If `fetchProfile` fails (network error), `profile` stays null. The home page shows a skeleton forever. Add a single retry with exponential backoff, or show an explicit "Could not load your profile — tap to retry" UI. |

### P2: Must Track, Can Wait

| # | Issue | File(s) | Fix |
|---|---|---|---|
| 9 | "Add to Cart" gives no feedback | `src/hooks/useProductDetail.ts` | Add `toast('Added to cart', { icon: '🛒', duration: 1500 })` after `addItem()` for `add_to_cart` action type. |
| 10 | Disputes not discoverable from order detail | `src/pages/OrderDetailPage.tsx` | Add "Report a Problem" button on completed/cancelled orders that links to `/disputes`. |
| 11 | Group Buys page has no navigation entry | `src/components/home/SocietyQuickLinks.tsx` or BottomNav | Add entry point if feature is enabled. |
| 12 | Seller alarm has no volume/snooze control | `src/hooks/useNewOrderAlert.ts` | Add a "Snooze 5 min" option to the overlay, and respect device silent mode. |
| 13 | No crash analytics | Global | Integrate a lightweight error reporter (even a simple edge function that logs errors to a `crash_reports` table). |

### Constraints Met
- No new features proposed — all fixes address existing broken or incomplete flows
- No redesign — all changes are surgical
- All backward compatible — no API changes, no schema changes except optional crash_reports table

---

## Accountability Statement

**Why this was not caught earlier:**
1. The `drop_console` setting meant production errors were invisible
2. Testing was done in the web sandbox (Lovable preview), never on native production builds
3. The auth storage swap was designed for a synchronous storage API but uses an async adapter — this mismatch was never tested on a real iOS device
4. Alert features were tested by verifying Realtime works on the same page — cross-page and background scenarios were never validated

**What permanent guardrails must be added:**
1. Never strip `console.error` in production builds
2. Add a startup health check that sets a `data-app-ready` attribute on `#root` — the fallback timer checks for this attribute, not child count
3. Test every Codemagic build by opening the app cold on a device before distributing
4. Add a `/_health` diagnostic screen accessible via deep link that shows: auth state, storage type, session presence, network status, and feature flags — so blank-screen issues can be diagnosed without dev tools

