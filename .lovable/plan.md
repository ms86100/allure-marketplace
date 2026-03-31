

# 5 Critical Silent Buyer Bugs — Pre-Production Audit

## Bug 1: Cancellation Banner Mislabels Seller Rejections as "Auto-Cancelled"

**What**: On `OrderDetailPage.tsx` line 395, the rejection reason banner uses this logic:
```
order.rejection_reason?.startsWith('Cancelled by buyer:') ? 'Order Cancelled' : 'Auto-Cancelled'
```
This means when a **seller rejects** an order (reason like "Out of stock"), the buyer sees **"Auto-Cancelled"** — not "Rejected by Seller". The buyer has no idea the seller explicitly refused the order.

**Where**: OrderDetailPage.tsx, line 391-401 — the cancellation banner in the order detail view.

**Why critical**: The buyer feels the system randomly cancelled their order. They lose trust in the platform and may re-order the same item, only to get rejected again. There is zero feedback loop telling them the seller declined.

**Gap it creates**: The cancellation reasons system (with `buyer_cancel_order` RPC prepending "Cancelled by buyer:") was designed for buyer-initiated cancels. Seller rejections use `seller_advance_order` with a `rejection_reason`, but the banner treats anything non-buyer as "Auto-Cancelled" — collapsing two semantically different scenarios.

**Why fixing it completes the system**: The order lifecycle already tracks who cancelled (buyer vs seller vs system). The UI simply doesn't surface this distinction.

**Impact analysis**:
- `OrderDetailPage.tsx` — banner text logic
- `useOrderDetail.ts` — no change needed (already exposes rejection_reason)
- Notification templates (edge functions) — may need audit for consistent wording

**Risks**:
1. If `rejection_reason` format varies across RPCs, the new detection logic could misclassify — mitigate by checking `seller_advance_order` RPC to confirm it stores reasons without prefixes.
2. Changing banner text could confuse users who already saw "Auto-Cancelled" for the same order if they revisit — mitigate by using neutral "Order Cancelled by Seller" phrasing.

**Fix plan**: In `OrderDetailPage.tsx` line 395, replace the binary check with a 3-way classification:
- Starts with "Cancelled by buyer:" → "You Cancelled This Order"
- Contains system phrases ("not completed in time", "seller didn't respond") → "Auto-Cancelled"
- Everything else → "Cancelled by Seller"

---

## Bug 2: Buyer Sees "Block undefined, undefined" for Non-Society Sellers

**What**: On `OrderDetailPage.tsx` line 688, the seller info card renders:
```
Block {sellerProfile?.block}, {sellerProfile?.flat_number}
```
For marketplace sellers (not society-based), `block` and `flat_number` are null. The buyer sees **"Block undefined, undefined"** — a raw code artifact.

**Where**: OrderDetailPage.tsx line 688 — Seller info card at the bottom of order detail.

**Why critical**: This instantly destroys trust. A buyer seeing "Block undefined" thinks the app is broken or the seller is fake. For a marketplace platform supporting sellers beyond communities, this is a guaranteed occurrence for commercial sellers.

**Gap it creates**: The platform's architecture explicitly separates marketplace (coordinate-based) from society (block/flat-based). The order detail UI assumes all sellers are society-based, violating this core separation.

**Why fixing it completes the system**: Sellers already have `address` or location data. Simply falling back to the seller's business address (or hiding the line entirely when block/flat are null) aligns the UI with the domain model.

**Impact analysis**:
- `OrderDetailPage.tsx` line 686-692 — seller/buyer info rendering
- No backend changes needed

**Risks**:
1. Hiding the address entirely could leave the buyer with no location context for pickup orders — mitigate by showing seller's `address` or `area` field as fallback.
2. The same pattern might exist for buyer info shown to sellers when buyer has no block/flat — check and fix both sides in the same card.

**Fix plan**: Wrap the address line in a conditional: only render if `block` or `flat_number` is truthy. Otherwise show a generic location label or omit entirely.

---

## Bug 3: Reorder Silently Ignores Price Changes

**What**: `ReorderButton.tsx` line 71-76 checks `is_available` and `approval_status` but uses the current product price to insert into cart. If the product price has changed since the original order, the buyer sees no warning — they only discover the price difference at checkout (or never).

**Where**: ReorderButton.tsx, `executeReorder` function, lines 66-92.

**Why critical**: A buyer taps "Reorder" expecting the same total. If a ₹150 item is now ₹250, they only notice at checkout (if at all). This breaks the fundamental promise of "same items, one tap" shown in the order detail UI.

**Gap it creates**: The system already stores `unit_price` in `order_items`. The reorder flow has the data to compare old vs new prices but doesn't use it.

**Why fixing it completes the system**: The checkout flow already has server-side price validation (`price_changed_items` from `create_multi_vendor_orders`). But that catches it too late — after cart assembly. A proactive toast during reorder ("2 items have different prices") sets expectations correctly.

**Impact analysis**:
- `ReorderButton.tsx` — add price comparison logic
- `useCart.tsx` — no change (accepts items at current price)

**Risks**:
1. Comparing prices requires matching `order_items.unit_price` to `products.price` — if `unit_price` was stored with discounts applied, the comparison would flag false positives. Mitigate by comparing against `order_items.unit_price` only.
2. If ALL items changed price, the toast could be alarming — mitigate with neutral phrasing: "Some prices may have changed since your last order."

**Fix plan**: In `executeReorder`, after fetching `availableProducts`, compare each product's current `price` against the original `orderItems[i].unit_price`. If any differ, show `toast.info('Heads up: Some prices have changed since your last order')`.

---

## Bug 4: Order List Filter "Active" Leaks `payment_pending` Orders

**What**: In `useOrdersList.ts` line 28-30, the "Active" filter excludes terminal statuses and `payment_pending`:
```
const terminalArr = [...terminalSet, 'payment_pending'];
query = query.not('status', 'in', `(${terminalArr.map(s => `"${s}"`).join(',')})`);
```
But the `ActiveOrderStrip` (home screen) separately excludes `payment_pending` (line 73). The **Orders page "All" tab** does NOT exclude `payment_pending`, so buyers see raw `payment_pending` orders mixed in with real orders — especially after failed payments where auto-cancel hasn't fired yet (30-min window).

**Where**: OrdersPage.tsx → useOrdersList.ts, "all" filter path; also `OrderCard` component.

**Why critical**: A buyer who abandoned a payment sees a confusing "Confirming Payment…" order in their "All" orders list for up to 30 minutes. They might tap it, see the payment banner, and think they're being charged. This creates anxiety and support tickets.

**Gap it creates**: The `ActiveOrderStrip` correctly hides these, but the Orders page doesn't apply the same logic for the "All" tab. The two views are inconsistent.

**Why fixing it completes the system**: The platform already has the auto-cancel sweep (30 min). The gap is purely the display layer showing transient states as if they were real orders.

**Impact analysis**:
- `useOrdersList.ts` — add `payment_pending` exclusion for buyer "all" filter
- `OrderCard` component — no change needed (already renders status correctly)
- `ActiveOrderStrip` — already correct, no change

**Risks**:
1. Hiding `payment_pending` from "All" means a buyer who genuinely paid but webhook is delayed won't see their order — mitigate by only hiding `payment_pending` orders older than 5 minutes (fresh ones may still be confirming).
2. The Supabase `.not()` syntax with string-interpolated arrays is fragile — ensure proper escaping.

**Fix plan**: In `useOrdersList.ts` `fetchOrdersPage`, when `type === 'buyer'` and `filter === 'all'`, add `.not('status', 'eq', 'payment_pending')` OR only exclude `payment_pending` orders older than 5 minutes using `.or('status.neq.payment_pending,created_at.gt.${fiveMinAgo}')`.

---

## Bug 5: Notification Badge Count Includes Stale Order Notifications

**What**: `useUnreadNotificationCount.ts` counts ALL unread notifications (excluding seller-only types) without any recency filter. But `useLatestActionNotification` (the banner) applies a 24-hour recency guard and terminal-order filter. This means the badge shows "3 unread" but the banner shows nothing — the buyer taps the bell expecting 3 items, but the inbox shows old, irrelevant notifications at the top.

**Where**: `useUnreadNotificationCount.ts` vs `useLatestActionNotification` in `useNotifications.ts`.

**Why critical**: A persistent unread badge that doesn't correspond to actionable content trains the buyer to ignore notifications entirely. This is the "boy who cried wolf" pattern — when a real urgent notification arrives, the buyer doesn't trust the badge.

**Gap it creates**: The stale notification cleanup (`cleanupStaleDeliveryNotifications`) runs only when the inbox page opens (line 41, `NotificationInboxPage.tsx`). If the buyer never opens the inbox, stale delivery notifications accumulate indefinitely, inflating the badge count.

**Why fixing it completes the system**: The cleanup logic already exists and works correctly. It just needs to run proactively — not only on inbox visit.

**Impact analysis**:
- `useUnreadNotificationCount.ts` — either apply same recency filter, or trigger cleanup
- `useNotifications.ts` — `cleanupStaleDeliveryNotifications` is already exported
- `useBuyerOrderAlerts.ts` — could trigger cleanup after order status changes
- `useAppLifecycle.ts` — could trigger cleanup on app resume

**Risks**:
1. Running cleanup too aggressively (on every badge re-fetch) could cause excessive DB writes — mitigate by running cleanup at most once per app session (use a ref guard).
2. The cleanup marks notifications as `is_read`, which means they won't appear as "new" if the user later opens the inbox — this is actually the desired behavior (stale = already irrelevant).

**Fix plan**: In `useAppLifecycle.ts`, after the visibility-change resume handler (line 45-68), add a one-time cleanup call: fetch the first page of unread notifications and run `cleanupStaleDeliveryNotifications`. Guard with a ref to ensure it runs only once per session.

---

## Summary

| # | Bug | File(s) | Severity | Effort |
|---|-----|---------|----------|--------|
| 1 | Seller rejections shown as "Auto-Cancelled" | OrderDetailPage.tsx | High — trust | ~15 min |
| 2 | "Block undefined, undefined" for non-society sellers | OrderDetailPage.tsx | High — trust | ~10 min |
| 3 | Reorder ignores price changes silently | ReorderButton.tsx | Medium — financial trust | ~20 min |
| 4 | `payment_pending` orders visible in "All" tab | useOrdersList.ts | Medium — anxiety | ~15 min |
| 5 | Badge count inflated by stale notifications | useAppLifecycle.ts, useUnreadNotificationCount.ts | Medium — notification trust | ~20 min |

All fixes are surgical — no new features, no schema changes, no refactoring.

