

# Bug Audit: Buyer & Seller Journey — All Verified Issues

## Bug 1: `failed` status in DB but not in `order_status` enum (CRITICAL — LIVE ERROR)

**Proof:** Console logs show repeated 400 errors: `invalid input value for enum order_status: "failed"`. The `category_status_flows` table has `status_key = 'failed'` with `is_terminal = true`, but the Postgres `order_status` enum does NOT include `failed`.

**Impact:** The `ActiveOrderStrip` query uses `status=not.in.(...)` with the terminal set from DB, which includes `"failed"`. PostgREST rejects it. The strip silently fails on every poll (~30s), meaning buyers with active orders see NO active order strip at all. This is happening RIGHT NOW in production.

**How buyer encounters it:** Buyer places an order, returns to home screen — no active order strip appears. They think the order didn't go through.

**Fix:** Add `failed` to the `order_status` enum via migration: `ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'failed';`

---

## Bug 2: Celebration banner calls `setString()` during render (High)

**Proof:** `OrderDetailPage.tsx` line 177 — `setString(celebration_${order.id}, 'true')` is called inside a render expression (an IIFE inside JSX). This is a side effect during render, violating React rules. It writes to persistent storage on every render cycle before the component commits.

**Impact:** On React strict mode (dev), it fires twice. In production, if the render is interrupted/discarded by concurrent mode, the celebration flag is set but the UI never shows. The banner becomes unreliable — sometimes shown, sometimes not.

**How buyer encounters it:** After delivery, the celebration banner may flash once and disappear, or never appear at all.

**Fix:** Move the `setString` call into a `useEffect` that triggers when `isSuccessfulTerminal` becomes true for the first time.

---

## Bug 3: Service booking has no payment collection (Medium)

**Proof:** `ServiceBookingFlow.tsx` line 185 hardcodes `payment_type: 'cod'` and `payment_status: 'pending'`. There is no payment selector, no UPI flow, no Razorpay integration in the booking drawer.

**Impact:** ALL service bookings default to COD with no ability for the buyer to pay upfront via UPI, even if the seller requires it. For high-value services (e.g., home cleaning), this creates trust issues — buyer has no "skin in the game."

**How buyer encounters it:** Buyer books a ₹2000 service and is never asked to pay. Seller has no payment guarantee.

**Fix:** This is a design gap, not a crash bug. Add a payment method selector to the booking flow if the seller accepts UPI.

---

## Bug 4: Service booking order missing `delivery_address` and `fulfillment_type` (Medium)

**Proof:** `ServiceBookingFlow.tsx` line 177-188 — the `orders.insert()` call does NOT set `delivery_address` or `fulfillment_type` columns. For `home_visit` services, the buyer enters an address, but it's only passed to `book_service_slot` RPC as `_buyer_address`, not stored on the order itself.

**Impact:** The `OrderDetailPage` and `OrdersPage` have no way to show the buyer's address from the order record. Seller sees the order but can't find the address without looking at the booking record separately.

**How seller encounters it:** Seller accepts a home visit booking, opens order detail — no address shown on the order card.

**Fix:** Pass `delivery_address: buyerAddress` and `fulfillment_type: resolvedLocationType` in the order insert.

---

## Bug 5: Multi-seller UPI payment only charges for first seller (Medium-High)

**Proof:** `CartPage.tsx` line 311 — `UpiDeepLinkCheckout` receives `orderId={c.pendingOrderIds[0]}` and `sellerUpiId` from first seller only. For multi-seller carts, only the first seller's order gets the UPI payment sheet. Other sellers' orders remain unpaid.

**Impact:** Buyer with items from 2 sellers pays via UPI — only seller 1 gets paid. Seller 2's order stays `payment_status: pending` forever.

**How buyer encounters it:** Buyer checks out a multi-seller cart with UPI. Gets one payment link. Pays. Second order shows "Payment pending" indefinitely.

**Fix:** Either: (a) block UPI for multi-seller carts, or (b) implement sequential payment flows per seller.

---

## Bug 6: Razorpay checkout also only handles first seller (Medium-High)

**Proof:** `CartPage.tsx` line 305 — `RazorpayCheckout` receives `orderId={c.pendingOrderIds[0]}` and `sellerId={c.sellerGroups[0]?.sellerId}`. Same issue as Bug 5 but for Razorpay.

**Impact:** Same as Bug 5 — only first seller's order is paid via Razorpay in multi-seller carts.

---

## Bug 7: `updateOrderStatus` in Buyer Action Bar blocked by RLS (Low — mitigated)

**Proof:** `OrderDetailPage.tsx` line 508 — if `buyerNextStatus` exists (e.g., buyer needs to "Accept Quote"), it calls `o.updateOrderStatus(o.buyerNextStatus!)` which does a direct `orders` table UPDATE. RLS policy only allows sellers/admins to update.

**Impact:** If a workflow defines a forward buyer action (like "Accept Quote" for quoted services), the button renders but the action silently fails. Currently mitigated because most buyer forward actions don't exist in default workflows.

**How buyer encounters it:** Seller sends a quote, buyer sees "Accept Quote" button, taps it — nothing happens, toast says "Order status has changed."

**Fix:** Buyer forward actions need a dedicated RPC (like `buyer_cancel_order` but for advancing), or the RLS policy needs to allow buyer updates for specific transitions.

---

## Bug 8: COD orders created with `payment_status: 'pending'` instead of a COD-specific status (Low)

**Proof:** `useCartPage.ts` line 333 — COD orders call `createOrdersForAllSellers('pending')`. The order is created with `payment_status: 'pending'`, same as UPI orders awaiting payment. There's no distinction.

**Impact:** On the seller side and admin dashboards, COD orders look identical to unpaid UPI orders in payment status. Seller might think the buyer hasn't paid when it's expected to be COD.

**How seller encounters it:** Seller sees "Payment: Pending" badge on a COD order — confusing since COD is collected on delivery by definition.

---

## Summary Table

| # | Bug | Severity | Live? |
|---|-----|----------|-------|
| 1 | `failed` not in enum — ActiveOrderStrip broken | Critical | YES — 400 errors in logs |
| 2 | `setString()` side effect during render | High | Yes |
| 3 | Service booking no payment collection | Medium | By design |
| 4 | Service booking missing address/fulfillment on order | Medium | Yes |
| 5 | Multi-seller UPI pays only first seller | Medium-High | Yes |
| 6 | Multi-seller Razorpay pays only first seller | Medium-High | Yes |
| 7 | Buyer forward action blocked by RLS | Low | Latent |
| 8 | COD payment_status indistinguishable from unpaid | Low | Yes |

## Recommended Fix Priority

1. **Bug 1** — Add `failed` to enum (1 migration, immediate impact)
2. **Bug 2** — Move setString to useEffect (small code change)
3. **Bug 5+6** — Multi-seller payment handling (block UPI for multi-seller or implement sequential)
4. **Bug 4** — Add address/fulfillment to service booking order insert
5. **Bug 7** — Create buyer action RPC for forward transitions

