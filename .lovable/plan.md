

# End-to-End System Audit: Verified Bugs & Gaps

## Previously Fixed (Confirmed Resolved)
- **`failed` enum** — Now in `order_status` enum. ActiveOrderStrip queries succeed (200 status in network logs).
- **Celebration banner render side-effect** — Moved to `useEffect` in `CelebrationBanner` component.
- **OrderCancellation hardcoded fallback** — Removed. Now fully DB-driven via `canCancel` prop.
- **`buyer_cancel_order` RPC** — Now validates against `category_status_transitions` instead of hardcoding.
- **Buyer Action Bar render condition** — Now shows when `canBuyerCancel` is true even without forward action.
- **Service booking missing address/fulfillment** — Now passed in order insert.

---

## NEW BUGS FOUND

### Bug 1: Buyer forward action (`buyerNextStatus`) uses direct UPDATE — blocked by RLS (HIGH)

**Root cause:** `OrderDetailPage.tsx` line 515 calls `o.updateOrderStatus(o.buyerNextStatus!)`. This does `supabase.from('orders').update(...)` with `.eq('buyer_id', user.id)`. But the RLS UPDATE policy on `orders` is:
```
Sellers and admins can update orders
```
Buyers are excluded. The update returns 0 rows, triggering "Order status has changed. Refreshing..."

**Affected transitions (from DB):**
- `delivered → completed` (buyer, cart_purchase) — buyer confirms receipt
- `delivered → completed` (buyer, seller_delivery) — buyer confirms receipt
- `ready → completed` (buyer, self_fulfillment) — buyer confirms pickup
- `quoted → accepted` (buyer, request_service) — buyer accepts quote

**Impact:** These 4 buyer actions render a button but silently fail. The buyer sees "Order status has changed" error.

**Note:** `delivered → completed` has a separate `buyer_confirm_delivery` RPC that works (used in `BuyerDeliveryConfirmation` component). But the Buyer Action Bar doesn't use it — it uses the direct UPDATE path.

**Fix:** Route buyer forward actions through dedicated RPCs. Create a `buyer_advance_order` RPC (SECURITY DEFINER) that validates the transition against `category_status_transitions` where `allowed_actor = 'buyer'`, then performs the update. Replace the `updateOrderStatus` call in the Buyer Action Bar with this RPC.

---

### Bug 2: Duplicate `resolveTransactionType` functions with subtle behavioral difference (MEDIUM)

**Root cause:** Two copies exist:
- `src/hooks/useCategoryStatusFlow.ts` line 74-96
- `src/hooks/useOrderDetail.ts` line 12-31

The `useOrderDetail` version has a logic quirk on line 26:
```ts
if (fulfillmentType === 'delivery' && (deliveryHandledBy || 'seller') === 'seller') return 'seller_delivery';
```
The expression `(deliveryHandledBy || 'seller')` means: if `deliveryHandledBy` is ANY truthy string (including `'platform'`), it uses that value. But if `deliveryHandledBy` is `'platform'`, then `'platform' === 'seller'` is false, so it falls through to line 27 which checks `!deliveryHandledBy` (also false for `'platform'`), then to line 29 which correctly handles it. So the logic is accidentally correct but fragile.

The `useCategoryStatusFlow` version (line 90) is cleaner: `(deliveryHandledBy === 'seller' || !deliveryHandledBy)`.

**Impact:** Currently no functional bug, but a maintenance hazard. If someone edits one copy, the other diverges.

**Fix:** Extract into a shared utility and import in both locations.

---

### Bug 3: `cart_purchase` workflow has no seller transition from `ready` (MEDIUM-HIGH)

**Root cause:** For `cart_purchase` (platform delivery), the `ready` state transitions are:
- `ready → picked_up` (delivery actor only)
- `ready → cancelled` (admin only)

The seller has NO transitions from `ready`. This means once the seller marks an order as `ready`, they see NO action button. The order is stuck until a delivery actor picks it up.

**Impact:** If the platform delivery system is not implemented (which it isn't — there's no delivery partner pool or assignment system for `cart_purchase`), orders in `cart_purchase` workflow get stuck at `ready` permanently. The seller cannot advance the order.

**Mitigation:** The `resolveTransactionType` logic routes most orders to `seller_delivery` (where seller handles delivery). `cart_purchase` only applies when `deliveryHandledBy === 'platform'`. If no sellers are configured for platform delivery, this is a latent dead-end.

**Fix:** Either: (a) add `seller → picked_up` transition for `cart_purchase` as a fallback, or (b) ensure `cart_purchase` is only used when platform delivery infrastructure exists. Document this constraint.

---

### Bug 4: Item status badges hardcode status list (LOW)

**Root cause:** `OrderDetailPage.tsx` line 459:
```tsx
{(['pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled'] as ItemStatus[]).map(...)
```

This is a hardcoded list of item statuses. If a new item status is added to the workflow, it won't appear in the badge row.

**Impact:** Cosmetic — items with non-listed statuses show no badge. No functional impact since item-level status tracking is supplementary to order-level status.

**Fix:** Derive item statuses dynamically from the data (e.g., `[...new Set(items.map(i => i.status || 'pending'))]`).

---

### Bug 5: `window.location.reload()` used for post-action refresh (LOW-MEDIUM)

**Root cause:** 4 places in `OrderDetailPage.tsx` use `window.location.reload()` as the `onCancelled`/`onConfirmed` callback (lines 275, 304, 336, 512). This destroys all React state, realtime subscriptions, and in-memory caches.

**Impact:** After cancellation or payment confirmation, the entire app reloads. User loses scroll position, any open drawers, and the realtime channel must reconnect. On slow connections, this shows a blank screen briefly.

**Fix:** Replace with `fetchOrder()` to re-fetch from DB. The realtime subscription already handles state updates; `window.location.reload()` is a sledgehammer.

---

### Bug 6: Duplicate `OrderCancellation` rendered twice for buyers (LOW)

**Root cause:** `OrderCancellation` renders in TWO places:
1. Line 275 — Inside the status timeline card (always visible for buyers when `canBuyerCancel`)
2. Line 512 — Inside the Buyer Action Bar (also visible when `canBuyerCancel`)

Both are visible simultaneously when the Buyer Action Bar renders and `canBuyerCancel` is true.

**Impact:** Buyer sees two "Cancel Order" buttons — one in the timeline card and one in the action bar. Confusing but not functionally broken.

**Fix:** Remove the OrderCancellation from the Buyer Action Bar (line 512) since it's already accessible in the timeline card. Or conditionally hide the timeline one when the action bar is showing.

---

### Bug 7: COD orders `payment_status: 'pending'` indistinguishable from unpaid UPI (LOW)

**Root cause:** `useCartPage.ts` line 333 — COD orders use `createOrdersForAllSellers('pending')`. Same `payment_status` as UPI orders awaiting payment.

**Impact:** Seller sees "Payment: Pending" for COD orders, which is misleading since COD is collected on delivery. Also, the `auto-cancel-orders` function must carefully distinguish COD from genuinely unpaid orders (it does — line 56 filters by non-COD payment method).

**Fix:** Use `payment_status: 'cod_pending'` or a dedicated value. This requires adding to the payment_status enum and updating all references.

---

### Bug 8: Multi-seller UPI/Razorpay only processes first seller's payment (MEDIUM — mitigated)

**Root cause:** `useCartPage.ts` line 124 — `acceptsUpi` is forced `false` for multi-seller carts:
```ts
const acceptsUpi = sellerGroups.length <= 1 && ...
```

**Status:** MITIGATED. Multi-seller carts can only use COD. UPI is blocked. This is correct behavior given the limitation, but there's no UI explanation for why UPI disappears.

**Fix:** Add a subtle notice when multi-seller cart disables UPI: "UPI is available for single-seller orders only."

---

## Summary

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Buyer forward action blocked by RLS | HIGH | NEW — needs RPC |
| 2 | Duplicate `resolveTransactionType` | MEDIUM | NEW — refactor |
| 3 | `cart_purchase` dead-end at `ready` | MEDIUM-HIGH | Latent |
| 4 | Item status badges hardcoded | LOW | Cosmetic |
| 5 | `window.location.reload()` for refresh | LOW-MEDIUM | UX |
| 6 | Duplicate cancel buttons for buyer | LOW | UX |
| 7 | COD payment_status ambiguous | LOW | Existing |
| 8 | Multi-seller UPI hidden without notice | MEDIUM | Mitigated |

## Recommended Fix Priority

1. **Bug 1** — Create `buyer_advance_order` RPC + update Buyer Action Bar (CRITICAL for service workflows)
2. **Bug 2** — Extract shared `resolveTransactionType` utility
3. **Bug 5** — Replace `window.location.reload()` with `fetchOrder()`
4. **Bug 6** — Remove duplicate cancel button
5. **Bug 3** — Document `cart_purchase` constraint or add seller fallback transition

## Workflow Engine Verdict

The DB-driven workflow engine is **structurally sound**. The `validate_order_status_transition` trigger correctly validates all transitions against `category_status_transitions` with parent_group fallback. The only systemic gap is Bug 1 (buyer actions bypassing the validation by using direct UPDATE which RLS blocks). Once that's fixed with an RPC, the system is fully DB-driven with no hardcoded lifecycle logic in critical paths.

## Payment Verdict

COD works end-to-end. UPI is correctly blocked for multi-seller. Razorpay has proper retry/verification loops. The only gap is the COD `payment_status` ambiguity (Bug 7) which is cosmetic.

## Tracking & Live Activity Verdict

Four-tier sync (Realtime → Push → Visibility → Polling) is correctly wired. Terminal events properly end Live Activities via multiple independent paths. No stale state gaps identified.

## Notification Verdict

Push notifications correctly dispatch `order-terminal-push` CustomEvent. All critical surfaces (`useOrderDetail`, `useAppLifecycle`, `ActiveOrderStrip`, `LiveActivityOrchestrator`) listen for it. Silent push for mid-flow statuses when Live Activity is active. No gaps.

