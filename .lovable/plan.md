

# 5 Critical Buyer-Facing Bugs — Round 4

## Bug 1: Server RPC silently deletes cart during UPI/Razorpay order creation — "cart preservation" is an illusion

**Where in the flow:** Buyer has items in cart → selects UPI or Razorpay → taps "Place Order" → `createOrdersForAllSellers('pending')` is called → order is created → buyer is shown the payment UI.

**What happens:** The `create_multi_vendor_orders` RPC at the very end (after inserting orders and items) executes:
```sql
delete from public.cart_items where user_id = _buyer_id;  -- line 176 of RPC
```
This unconditionally wipes the buyer's cart from the database. The client code in `useCartPage.ts` deliberately says "Do NOT clear cart — cart stays until payment is confirmed" (line 330), and the Round 2 fix ensured `clearCartAndCache()` is only called after confirmed payment. But none of that matters — the RPC already deleted the cart server-side before the buyer even sees the payment screen.

The buyer's cart appears to exist because react-query has a stale cache. But if the buyer:
- Closes and reopens the app during payment
- Refreshes the page
- The app resumes from background (Capacitor `appStateChange` invalidates `cart-items` query)

…the cart refetch returns empty. The buyer's "preserved cart" vanishes.

**Who is confused and why:**
- **Buyer** is on the Razorpay payment screen. Their bank app crashes. They reopen the app. Cart is empty. Order is stuck at `pending` with `payment_status: pending`. They can't retry because their items are gone. They have to manually re-add everything and place a new order (which will fail because the pending duplicate guard blocks them). They're stuck: no cart, can't reorder, pending orders blocking new ones.
- The entire Round 2 fix (Bug 1: "Razorpay success clears cart even when payment is NOT confirmed") is undermined because the server already cleared it.

**Fix:** Remove the `DELETE FROM cart_items` line from the `create_multi_vendor_orders` RPC. Cart clearing is already handled client-side at the correct moment (after confirmed payment for UPI/Razorpay, immediately for COD). The COD path already calls `clearCartAndCache()` which deletes from DB. This is a one-line SQL migration.

---

## Bug 2: Coupon stays applied after buyer removes items below minimum order amount — discount applied to ineligible order

**Where in the flow:** Buyer has ₹600 in cart → applies a coupon with `min_order_amount: ₹500` → coupon validates and shows "You save ₹60" → buyer removes an item → cart drops to ₹350 → coupon still shows as applied with recalculated discount → buyer proceeds to checkout.

**What happens:** The `CouponInput` component validates `min_order_amount` only at the moment of application (line 89, `canApplyCoupon`). After that, the `appliedCoupon` state object sits in `useCartPage` and is never re-validated when `totalAmount` changes. The `effectiveCouponDiscount` recalculates the discount amount (line 106-114), so the displayed discount adjusts. But the coupon's minimum order threshold is never re-checked. The server RPC `create_multi_vendor_orders` doesn't validate coupon eligibility at all — it just stores whatever `_coupon_id` and `_coupon_discount` it receives.

**Who is confused and why:**
- **Buyer** sees the coupon still applied — green checkmark, "You save ₹35" — and assumes everything is valid. They complete the order.
- **Seller** sees an order with a coupon discount applied on a ₹350 order when the coupon requires ₹500 minimum. They think: "This coupon shouldn't apply to this order. Is there a bug? Am I losing money?"
- This erodes seller trust in the coupon system. Sellers may stop offering coupons if they believe the rules aren't enforced.

**Fix:** Add an effect in `useCartPage.ts` that watches `totalAmount` and `appliedCoupon`, and auto-removes the coupon with a toast if the total drops below the coupon's `min_order_amount`. The `appliedCoupon` object doesn't currently store `min_order_amount` — it needs to be added to the type and passed through from `CouponInput.onApply`.

---

## Bug 3: Delivery fee threshold uses cart subtotal instead of post-discount amount — buyer pays delivery fee they shouldn't

**Where in the flow:** Buyer has ₹520 in cart → applies 10% coupon → effective amount is ₹468 → `freeDeliveryThreshold` is ₹500 → buyer expects free delivery because their cart subtotal is ₹520.

**What happens:** Line 116 of `useCartPage.ts`:
```typescript
const effectiveDeliveryFee = fulfillmentType === 'delivery' 
  ? (totalAmount >= settings.freeDeliveryThreshold ? 0 : settings.baseDeliveryFee) 
  : 0;
```
`totalAmount` is the raw cart subtotal BEFORE coupon discount. So free delivery is calculated against the pre-discount amount.

This seems correct at first — but the **display** creates confusion. The "Bill Details" section shows:
1. Subtotal: ₹520
2. Coupon: -₹52
3. Delivery: FREE (because ₹520 ≥ ₹500)
4. To Pay: ₹468

Now consider the opposite case: cart is ₹480, no coupon. Delivery fee is ₹20 (below threshold). Buyer applies a coupon that adds ₹0 discount but the coupon's presence doesn't change the delivery calculation — this is fine.

**The real bug:** The threshold is applied to `totalAmount` (raw subtotal), but `finalAmount` is calculated as `(totalAmount - couponDiscount) + deliveryFee`. If a buyer adds a product to reach ₹500 specifically for free delivery, then applies a coupon, the delivery stays free because the threshold checks the pre-discount total. This is actually favorable to the buyer but inconsistent with what sellers expect — sellers see "free delivery" on an order that effectively totals ₹450 after discount.

Actually, re-examining this — the current behavior (threshold on subtotal) is the standard e-commerce pattern. Let me replace this bug with a more critical one.

---

## Bug 3 (Revised): `CelebrationBanner` calculates order duration using `updated_at` minus `created_at` — shows wrong delivery time

**Where in the flow:** Buyer's order reaches terminal success (delivered/completed) → `CelebrationBanner` renders once → shows "Delivered in X min!"

**What happens:** Line 51 of `OrderDetailPage.tsx`:
```typescript
const durationMs = new Date(order.updated_at || order.created_at).getTime() 
  - new Date(order.created_at).getTime();
const durationMin = Math.max(1, Math.round(durationMs / 60000));
```
`updated_at` is the timestamp of the **last UPDATE to the orders row**, not the timestamp when the order reached the terminal status. Any subsequent update (e.g., payment confirmation, internal field change, admin note) bumps `updated_at`. If the seller confirms payment 2 hours after delivery, `updated_at` moves forward and the banner shows "Delivered in 180 min!" instead of the actual 25 minutes.

Even without delayed updates, `updated_at` reflects the last status change — which could be `completed` (buyer confirmation) rather than `delivered` (actual delivery). If the buyer confirms 30 minutes after delivery, the banner says "Delivered in 55 min" when actual delivery was 25 minutes.

**Who is confused and why:**
- **Buyer** sees "🎊 Delivered in 180 min!" and thinks: "That can't be right. It took like 25 minutes." The celebration banner — meant to create a positive emotional moment — instead creates doubt. "Is this app tracking my order correctly?"
- Worse, on the next order, they might not trust the ETA estimates if the system can't even correctly report past delivery times.

**Fix:** Use `order.status_updated_at` if available, or fall back to a reasonable heuristic: use the timestamp of the last non-terminal status change. Simplest surgical fix: cap the duration display at a reasonable maximum (e.g., show nothing or a generic message if duration > 120 min), and use `Math.min(durationMin, 120)` with a different message for outliers.

---

## Bug 4: `hasReview` resets to `false` when flow loads after initial fetch — "Leave a Review" button flashes

**Where in the flow:** Buyer opens a completed order they already reviewed → `fetchOrder` runs → `flow` is `[]` (not loaded yet) → review check runs (fallback path from Round 2 fix: `flow.length === 0` means "check anyway") → `hasReview` is set to `true` → flow loads → `fetchOrder` does NOT re-run → all good so far. BUT: the realtime subscription at line 138 triggers on any order UPDATE → `fetchOrder` runs again → NOW `flow` is loaded → `isSuccessfulTerminal(flow, status)` returns `true` → review check runs → `hasReview` is set correctly. This path is fine.

**The actual race:** When `fetchOrder` runs at line 153, it sets `setHasReview(false)` in the `else` branch — this fires when `flow.length > 0 AND !isSuccessfulTerminal(flow, data.status)`. If there's a window where `flow` is partially loaded but doesn't yet include the terminal status definition (e.g., `useCategoryStatusFlow` returns an intermediate result), `isSuccessfulTerminal` returns `false`, and `hasReview` gets reset to `false` — flashing the review button.

More critically: the `useEffect` at line 134 that triggers `fetchOrder` runs when `id` or `refetchTick` changes. But `flow` changes DON'T trigger a re-fetch. So if the initial fetch happened with `flow = []` and set `hasReview = true`, and then `flow` loads and a realtime update fires, `fetchOrder` re-runs with the loaded flow, and IF the status is somehow NOT in the terminal-success set (e.g., the flow definition uses a different terminal key than expected), `hasReview` flips to `false`.

**Who is confused and why:**
- **Buyer** opens a completed order they reviewed yesterday → briefly sees "Rate this order" button → it disappears. Or worse, it stays visible and they submit a duplicate review.
- The flash of the review prompt on an already-reviewed order feels buggy.

**Fix:** Never reset `hasReview` to `false` once it's been set to `true` for a given order. Add a guard: `if (!cancelled && !hasReview) setHasReview(false)` — only set to false if it wasn't already true. Or better: move the review check into a separate `useEffect` that depends on `[order?.id, order?.status, flow]` and only runs the DB query once per order lifecycle.

---

## Bug 5: Coupon discount amount stored on `appliedCoupon` is stale for fixed-amount coupons when cart total drops below coupon value

**Where in the flow:** Buyer has ₹300 in cart → applies a "₹200 off" fixed coupon → `discountAmount` is calculated as `Math.min(200, 300) = 200` → buyer removes an item → cart is now ₹150 → `effectiveCouponDiscount` returns `appliedCoupon.discountAmount` (₹200, the stale value from application time) → `finalAmount = Math.max(0, 150 - 200) + delivery = 0 + delivery`.

**What happens:** Line 106-114 of `useCartPage.ts`:
```typescript
const effectiveCouponDiscount = (() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.discount_type === 'percentage' && appliedCoupon.discount_value) {
      // Percentage coupons: recalculated dynamically ✓
      let d = (totalAmount * appliedCoupon.discount_value) / 100;
      ...
      return Math.round(d * 100) / 100;
    }
    return appliedCoupon.discountAmount; // Fixed amount: STALE ✗
})();
```

Percentage coupons recalculate correctly (they use current `totalAmount`). But fixed-amount coupons return the `discountAmount` that was calculated at apply-time. If the buyer had ₹300 and applied a ₹200 coupon, `discountAmount` was set to `Math.min(200, 300) = 200`. If they remove items to ₹150, `effectiveCouponDiscount` still returns ₹200.

The `finalAmount` line (117) does `Math.max(0, totalAmount - effectiveCouponDiscount)` which caps at 0 — so the buyer doesn't pay negative. But the **display** at line 216 of `CartPage.tsx` shows `Math.min(effectiveCouponDiscount, totalAmount)` = `Math.min(200, 150)` = ₹150. So the display is actually correct for the bill breakdown. But the `_coupon_discount` sent to the RPC (line 208) is `effectiveCouponDiscount` = ₹200, while the actual order total is ₹150. The order records a ₹200 discount on a ₹150 order — data inconsistency.

**Who is confused and why:**
- **Seller** sees an order: subtotal ₹150, coupon discount ₹200. That's mathematically impossible. They think: "Am I being charged for a discount larger than the order? Is the buyer gaming the system?"
- **Admin** sees reconciliation reports where discount > subtotal. Financial reports look wrong.

**Fix:** Recalculate fixed-amount coupons the same way as percentage: `Math.min(appliedCoupon.discount_value ?? appliedCoupon.discountAmount, totalAmount)`. This ensures the stored and transmitted discount never exceeds the cart total.

---

## Summary

| # | Bug | Who is confused | What goes wrong |
|---|-----|----------------|-----------------|
| 1 | Server RPC deletes cart during UPI/Razorpay order creation | **Buyer** loses cart on app resume, can't retry payment | Cart "preservation" is a client-side illusion |
| 2 | Coupon stays applied below minimum order amount | **Seller** sees invalid coupon on below-threshold order | No re-validation when cart items change |
| 3 | Celebration banner shows wrong delivery duration | **Buyer** sees "Delivered in 180 min" when it was 25 | Uses `updated_at` instead of actual delivery time |
| 4 | `hasReview` flashes false during flow loading race | **Buyer** briefly sees review prompt on already-reviewed order | Review state reset during async flow hydration |
| 5 | Fixed-amount coupon discount exceeds order total in DB | **Seller/Admin** sees discount > subtotal in records | Stale `discountAmount` not recalculated |

All fixes are surgical. Bug 1 requires a DB migration (one-line DELETE removal). Bugs 2-5 are client-side only.

