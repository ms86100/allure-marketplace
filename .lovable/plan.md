

# Round 3 Audit Report

## Previously Fixed Issues — Verified

All Round 1 and Round 2 fixes confirmed in place:
- UPI amount uses `c.finalAmount` — verified
- COD/Razorpay/UPI all call `clearCart()` — verified
- Favorites uses `.maybeSingle()` — verified
- Overnight store hours handled — verified
- RPC persists `delivery_fee`, `discount_amount`, `coupon_id` — verified
- RPC validates `auth.uid()` — verified
- Polling stops after idle — verified
- Duplicate `NewOrderAlertOverlay` removed from seller dashboard — verified

---

## New Issues Found

### MEDIUM SEVERITY

**1. Review Check Uses `.single()` — Throws 406 on Completed Orders Without Reviews**
- **File**: `src/hooks/useOrderDetail.ts` line 87
- **Bug**: `supabase.from('reviews').select('id').eq('order_id', id).single()` — when a buyer views a completed order that has no review yet, `.single()` returns a PGRST116 error (406). The error is caught but swallowed, and `hasReview` stays `false` (correct), but the error pollutes logs and wastes a failed network request on every load.
- **Fix**: Change `.single()` to `.maybeSingle()`.

**2. System Settings Table Missing All Application Config Keys**
- **Location**: `system_settings` table (database) and `src/hooks/useSystemSettings.ts`
- **Bug**: The table contains only 8 OTP/webhook-related keys. None of the 29 keys queried by `useSystemSettings` (e.g. `base_delivery_fee`, `free_delivery_threshold`, `currency_symbol`, `refund_promise_text`) exist in the database. The query always returns `[]` (confirmed in network logs). The hook falls back to hardcoded defaults, so the app works, but **no admin can change delivery fees, currency, refund policy, or any system config** because the rows don't exist.
- **Fix**: Insert default rows for all 29 keys into the `system_settings` table via migration. This is not a new feature — it's data population to make the existing admin settings panel functional.

**3. Double Toast on Cart Item Removal**
- **File**: `src/hooks/useCart.tsx` line 177 and `src/pages/CartPage.tsx` line 143
- **Bug**: `removeItem()` in `useCart.tsx` calls `toast.success('Removed from cart')`. The CartPage also calls `toast('{name} removed', { action: { label: 'Undo', ... } })` immediately after `c.removeItem()`. The user sees two toasts stacked simultaneously.
- **Fix**: Remove the generic `toast.success('Removed from cart')` from `useCart.tsx` `removeItem()`, since callers handle their own contextual toasts. Other callers of `removeItem` (if any) can add their own toast.

### LOW SEVERITY

**4. BottomNav Ref Warning in Console**
- **File**: `src/components/layout/BottomNav.tsx` line 102
- **Bug**: `export const BottomNav = memo(BottomNavInner)` — React warns "Function components cannot be given refs" because `memo()` without `forwardRef` does not forward refs. The warning appears on every page navigation.
- **Fix**: Wrap with `forwardRef` or simply ignore since refs are not actually needed here — the parent (`AppLayout`) doesn't pass a ref. The warning may be triggered by React Router's internal ref handling. Cosmetic only.

**5. SellerDetailPage Reads localStorage Directly Instead of Using BrowsingLocationContext**
- **File**: `src/pages/SellerDetailPage.tsx` lines 116-122
- **Bug**: `JSON.parse(localStorage.getItem('sociva_browsing_location'))` duplicates the resolution logic in `BrowsingLocationContext`. If the context's storage key or fallback chain changes, this page won't reflect it.
- **Fix**: Import and use `useBrowsingLocation()` hook instead of raw localStorage access. The hook is already available and provides `browsingLocation.lat` / `browsingLocation.lng`.

---

## Implementation Plan

### Phase 1 — Medium Fixes

1. **Fix review `.single()` → `.maybeSingle()`** in `useOrderDetail.ts` line 87.

2. **Seed system_settings rows**: Create a migration that INSERTs the 29 missing keys with their current hardcoded default values (using `INSERT ... ON CONFLICT DO NOTHING` to be idempotent).

3. **Fix double toast**: Remove `toast.success('Removed from cart')` from `useCart.tsx` `removeItem()`.

### Phase 2 — Low Fixes

4. **Use BrowsingLocationContext in SellerDetailPage**: Replace localStorage read with `useBrowsingLocation()`.

All fixes are backward-compatible, preserve existing functionality, and introduce no new features.

