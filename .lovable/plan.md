

# Round 2 Audit Report

## Summary

Most critical issues from Round 1 have been fixed. The RPC now persists `delivery_fee` and `discount_amount`, validates `auth.uid()`, and handles overnight store hours. The favorites `.single()` bug was fixed. UPI amount now uses `finalAmount`. Cart is cleared optimistically after COD orders.

However, several remaining issues were found.

---

## Issues Found

### MEDIUM SEVERITY

**1. Coupon ID Not Persisted in Orders**
- **Location**: `create_multi_vendor_orders` RPC (line 120-132 of migration)
- **Bug**: The orders table has a `coupon_id` column (uuid, nullable), and the RPC receives `_coupon_id` as a parameter, but the INSERT does not include `coupon_id`. Every order is stored with `coupon_id = NULL` even when a coupon was applied. This breaks coupon usage tracking, prevents coupon redemption limits from being enforced correctly, and makes order auditing incomplete.
- **Fix**: Add `coupon_id` to the INSERT statement, populated with `NULLIF(_coupon_id, '')::uuid` for the first seller group's order.

**2. Cart Not Cleared After Razorpay/UPI Success**
- **Location**: `useCartPage.ts` lines 211-224 (Razorpay) and 238-244 (UPI)
- **Bug**: After successful Razorpay or UPI payment, the code calls `await refresh()` but NOT `clearCart()`. While the RPC deletes cart_items server-side, the `refresh()` call only invalidates the query — during the gap before refetch completes, the user could momentarily see stale cart items (e.g., if they hit back). The COD path (line 200) correctly calls `clearCart()` first.
- **Fix**: Add `clearCart()` before `refresh()` in both `handleRazorpaySuccess` and `handleUpiDeepLinkSuccess`, matching the COD flow.

**3. Seller Order Polling Never Stops**
- **Location**: `useNewOrderAlert.ts` lines 156-202
- **Bug**: The polling fallback runs indefinitely with exponential backoff up to 30s. For sellers who leave the dashboard open for hours with no orders, this generates continuous network traffic (confirmed in network logs — empty `[]` responses every ~30s). The realtime subscription is the primary mechanism; polling is just a fallback.
- **Fix**: After reaching `MAX_POLL_MS`, stop polling entirely and rely solely on the realtime subscription. Restart polling only when a realtime event fires (indicating connectivity is active).

### LOW SEVERITY

**4. `_coupon_code` Parameter Unused in RPC**
- **Location**: `create_multi_vendor_orders` RPC
- **Bug**: The `_coupon_code` parameter is accepted but never used in any INSERT or logic. It exists as dead code. No functional impact, but it adds confusion.
- **Fix**: Either persist it alongside `coupon_id` (if the schema supports a `coupon_code` text column) or remove the parameter.

**5. Distance Calculation Duplicated Across Files**
- **Location**: `BrowsingLocationContext.tsx` (line 63), `SellerDetailPage.tsx` (lines 136-146), `useSearchPage.ts` (implicit via RPC)
- **Bug**: The Haversine formula is implemented inline in at least 2 places. Not a bug per se, but a maintenance risk — if the formula needs updating, multiple files must be changed.
- **Fix**: Extract to a shared utility (e.g., `src/lib/geo-utils.ts`). Low priority — no functional issue.

**6. Duplicate `NewOrderAlertOverlay` Rendering**
- **Location**: `App.tsx` (line 297) AND `SellerDashboardPage.tsx` (line 172)
- **Bug**: Both mount `NewOrderAlertOverlay` with the same `sellerId`. When a seller is on the dashboard, two overlays render simultaneously, potentially causing duplicate alerts or visual stacking issues.
- **Fix**: Remove the overlay from `SellerDashboardPage.tsx` since `App.tsx` already handles it globally, OR add a context flag to prevent double rendering.

---

## Previously Fixed (Verified)

- UPI amount: Uses `c.finalAmount` — **confirmed fixed** (line 293)
- COD cart clear: Calls `clearCart()` — **confirmed fixed** (line 200)
- Favorites: Uses `.maybeSingle()` — **confirmed fixed** (line 42)
- Overnight hours: Client + server both handle wrap-around — **confirmed fixed**
- RPC auth guard: `auth.uid()` check present — **confirmed fixed** (line 33)
- Delivery fee/discount in orders: Persisted — **confirmed fixed** (lines 124, 131)

---

## Implementation Plan

### Phase 1 — Medium Fixes

1. **Persist coupon_id in RPC**: New migration to add `coupon_id` to the INSERT in `create_multi_vendor_orders`, using `NULLIF(_coupon_id, '')::uuid`.

2. **Clear cart after payment success**: Add `clearCart()` calls in `handleRazorpaySuccess` and `handleUpiDeepLinkSuccess` in `useCartPage.ts`.

3. **Stop idle polling**: In `useNewOrderAlert.ts`, after backoff reaches `MAX_POLL_MS` and 3 consecutive empty polls, stop the timer. Re-trigger polling only on realtime subscription events.

### Phase 2 — Low Fixes

4. **Remove duplicate overlay**: Remove `NewOrderAlertOverlay` from `SellerDashboardPage.tsx`.

5. **Extract Haversine utility**: Optional cleanup — extract shared distance calculation.

All fixes are backward-compatible and do not introduce new features.

