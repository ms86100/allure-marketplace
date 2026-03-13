

# Pre-Go-Live Audit Report

## Issues Found

### CRITICAL SEVERITY

**1. UPI Deep Link Amount Mismatch**
- **File**: `src/pages/CartPage.tsx` line 293
- **Bug**: `UpiDeepLinkCheckout` receives `amount={c.sellerGroups[0]?.subtotal || c.finalAmount}` — this uses the seller's subtotal (ignoring coupon discount and delivery fee) instead of the correct `finalAmount`. The buyer pays the wrong amount via UPI.
- **Fix**: Change to `amount={c.finalAmount}`.

**2. Order RPC Does Not Persist Delivery Fee or Coupon Discount**
- **File**: `create_multi_vendor_orders` RPC (latest migration `20260311160728`)
- **Bug**: The INSERT into `orders` table does not include `delivery_fee` or `discount_amount` columns, despite the orders table having these fields and the RPC receiving `_delivery_fee` and `_coupon_discount` parameters. Every order is stored with `delivery_fee=0` and `discount_amount=NULL`, making financial reconciliation incorrect.
- **Fix**: Add `delivery_fee` and `discount_amount` to the INSERT statement. For multi-seller orders, the delivery fee should be applied to the first order (or split), and coupon discount to the applicable seller's order.

**3. Order `total_amount` Does Not Include Delivery Fee or Coupon**
- **File**: Same RPC
- **Bug**: `_total` is calculated purely from item prices × quantities. The `total_amount` stored in the DB does not reflect the coupon discount or delivery fee. The seller dashboard, order detail page, and any financial reporting will show incorrect amounts.
- **Fix**: Adjust `_total` to account for `_coupon_discount` (subtracted) and `_delivery_fee` (added) for the appropriate order(s).

### MEDIUM SEVERITY

**4. Cart Not Cleared Client-Side After Successful COD Order**
- **File**: `src/hooks/useCartPage.ts` lines 196-206
- **Bug**: After COD order placement, the code calls `await refresh()` which only invalidates/refetches the cart query. The RPC deletes cart_items server-side (line 347 of RPC), so the refetch returns empty — this works, but there's a race: the `items` array used for rendering may still be stale momentarily. The `clearCart()` function is never called after order placement (only exposed for the "Clear All" button). This is mostly safe because the RPC handles deletion, but if the refresh is slow, the user might see stale cart state.
- **Root cause**: Minor — the RPC handles it. But optimistic `setOptimistic(() => [])` would improve UX.

**5. Razorpay Checkout Uses `finalAmount` but UPI Uses `subtotal` — Inconsistency**
- **File**: `src/pages/CartPage.tsx` lines 289 vs 293
- **Bug**: Razorpay gets `amount={c.finalAmount}` (correct), UPI gets `amount={c.sellerGroups[0]?.subtotal || c.finalAmount}` (wrong). This inconsistency means different payment methods charge different amounts for the same order.
- **Fix**: Both should use `c.finalAmount`.

**6. Self-Pickup Shows "Deliver to: Not set" in Confirmation Dialog When No Address Selected**
- **File**: `src/pages/CartPage.tsx` line 276
- **Bug**: The confirm dialog shows `c.fulfillmentType === 'self_pickup' ? c.sellerGroups[0]?.sellerName || 'Seller' : c.selectedDeliveryAddress?.label || 'Not set'`. This is correct, but when fulfillment is delivery and no address is selected, the Place Order button should already be disabled. The guard at line 263 does disable it — this is fine.

**7. `computeStoreStatus` Does Not Handle Overnight Hours**
- **File**: `src/lib/store-availability.ts`
- **Bug**: If a store operates from 20:00 to 02:00 (overnight), `startMinutes=1200`, `endMinutes=120`. The condition `currentMinutes >= startMinutes && currentMinutes < endMinutes` will never be true because 1200 > 120. The store will always appear "closed."
- **Fix**: Add overnight detection: if `endMinutes < startMinutes`, check `currentMinutes >= startMinutes || currentMinutes < endMinutes`.

**8. Missing `buyer_id` Validation Guard in RPC**
- **File**: `create_multi_vendor_orders` RPC
- **Bug**: The RPC uses `SECURITY DEFINER` and accepts `_buyer_id` as a parameter. While the client passes `user.id`, the RPC does not verify that `_buyer_id = auth.uid()`. A malicious user could place orders on behalf of another user by modifying the request payload.
- **Note**: Previous conversation history mentions this was supposed to be added. Need to verify the actual deployed function.

### LOW SEVERITY

**9. `DeleteAccountDialog` ref Warning**
- **File**: `src/components/profile/DeleteAccountDialog.tsx`
- **Bug**: Console warning: "Function components cannot be given refs" on `AlertDialog`. Minor — no functional impact but indicates incorrect component composition.
- **Fix**: Wrap the component with `React.forwardRef` or remove the ref assignment.

**10. Favorites Query Returns 406 Error**
- **Network logs**: `GET /favorites?select=id&...` returns HTTP 406 with `PGRST116` (0 rows, but `.single()` was used).
- **Bug**: The favorites check query uses `.single()` which throws when no row exists. Should use `.maybeSingle()`.
- **Fix**: Change the query to use `.maybeSingle()` instead of `.single()`.

**11. Distance Display Uses Raw `distanceKm` Without Formatting Consistency**
- **File**: `src/pages/SellerDetailPage.tsx` line 389
- **Bug**: Uses `distanceKm < 1 ? Math.round(distanceKm * 1000) + ' m' : distanceKm + ' km'` — this matches the pattern documented in memory, but `distanceKm` could have many decimal places (e.g., "2.3456789 km"). The rounding to 1 decimal happens during calculation (line 146), so this is acceptable.

**12. Order Polling Interval (Every 30s) for Seller Dashboard**
- **Network logs**: Orders endpoint polled every ~30 seconds. Not a bug, but the response is always `[]` — the polling continues indefinitely even when there are no orders. Consider stopping after N empty polls.

---

## Implementation Plan

### Phase 1 — Critical Fixes (Deploy Immediately)

1. **Fix UPI amount**: Change `amount={c.sellerGroups[0]?.subtotal || c.finalAmount}` to `amount={c.finalAmount}` in CartPage.tsx line 293.

2. **Fix order RPC**: Create a new migration to update `create_multi_vendor_orders`:
   - Add `delivery_fee, discount_amount` to the INSERT columns
   - Populate with `_delivery_fee` and `_coupon_discount` respectively
   - Adjust `_total` to include delivery fee and subtract coupon discount
   - Add `_buyer_id = auth.uid()` validation guard

3. **Fix overnight store hours**: Update `computeStoreStatus` to handle `endMinutes < startMinutes` (wrap-around).

### Phase 2 — Medium Fixes

4. **Fix favorites 406**: Change `.single()` to `.maybeSingle()` in the favorites query hook.

5. **Optimistic cart clear**: Add `setOptimistic(() => [])` after successful order creation in `useCartPage.ts`.

### Phase 3 — Low Priority

6. **Fix DeleteAccountDialog ref warning**.
7. **Reduce idle polling** for seller order alerts.

All fixes are backward-compatible and do not introduce new features.

