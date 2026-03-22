

## In-App Notification System — Critical QA Audit (Buyer Perspective)

### Top 5 Bugs Found

---

### Bug 1 (P0): Buyer Gets ZERO "Order Placed" Confirmation Notification

**Issue:** When a buyer places an order, they receive no in-app notification confirming it. The `create_multi_vendor_orders` RPC only inserts a notification for the **seller** (type `order`, "New Order Received!"). The `fn_enqueue_order_status_notification` trigger fires on UPDATE only — not INSERT — so it never fires for the initial `placed` status. The `category_status_flows` table has `notify_buyer=false` for `placed` across all transaction types.

Verified: Order `c8872956` (buyer `ef690ff1`) has been in `placed` status since March 21 with zero notifications for the buyer. The seller (`dc38ff66`) got their notification.

**Why critical:** The buyer places an order and sees no confirmation in their notification inbox or home banner. This is the most fundamental trust signal — "we got your order" — and it's completely missing.

**Impact:** Every single buyer on every single order. The notification inbox shows nothing after placing an order. The home banner shows nothing. The unread badge doesn't increment.

**Risk of fixing:** Low. Adding a buyer notification to the RPC is additive. Must ensure the dedup logic doesn't conflict.

**Fix:** Add a buyer notification insert in `create_multi_vendor_orders` RPC alongside the existing seller notification. Insert with type `order_status`, title like "🛒 Order Placed!", body "Your order from {seller} has been placed.", payload including `action: 'Track Order'`.

---

### Bug 2 (P0): No Unique Constraint on `queue_item_id` — Duplicate Notifications on Retry

**Issue:** The `process-notification-queue` edge function inserts into `user_notifications` with `queue_item_id` and comments say "C5: deduplicate on retry" by relying on a unique constraint violation (code `23505`). But **no unique constraint exists** on `user_notifications.queue_item_id`. The only constraints are the primary key and two foreign keys.

Verified: Order `a194de7d` has 2 identical "New Order Received!" notifications in `user_notifications` with different `queue_item_id` values — one from the original queue item, one from a phantom queue_item_id that no longer exists in the queue (deleted by archive/purge). 3 orders have confirmed duplicates.

**Why critical:** Every time a queue item fails and is retried (stuck recovery resets to `pending`), the retry creates a **second** notification in the inbox. The seller sees "New Order Received!" twice for the same order.

**Impact:** Notification noise, inflated unread counts, eroded trust. The cron safety net and stuck recovery mechanisms actively cause duplicates.

**Risk of fixing:** None — adding a unique index is purely protective.

**Fix:** Add a unique index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_queue_item_id ON user_notifications(queue_item_id) WHERE queue_item_id IS NOT NULL;`

---

### Bug 3 (P1): `food_beverages/self_fulfillment` Seeded with `notify_buyer=false` and `notify_seller=false` for ALL Statuses

**Issue:** Our previous migration (March 22, 05:50) seeded `food_beverages/self_fulfillment` flow rows with `notify_buyer=false`, `notify_seller=false`, and `notification_title=NULL` for ALL statuses. The trigger fallback logic happens to work (since `notification_title=NULL` triggers the `default` fallback), but this is fragile. If anyone later populates `notification_title` on these rows without also setting `notify_buyer=true`, the fallback stops firing and buyers get zero notifications.

Additionally, the `placed` status row has `notify_seller=false` — meaning if the fallback ever fails, the seller also gets no notification for new food pickup orders.

**Why critical:** The seeded data is a time bomb. It works today only by accident (fallback fires because titles are NULL). Any admin editing these rows through the workflow builder UI will inadvertently break notifications.

**Impact:** All food_beverages self-pickup orders. Currently masked by fallback.

**Risk of fixing:** None — updating the rows to match `default/self_fulfillment` values is strictly corrective.

**Fix:** Update `food_beverages/self_fulfillment` rows to copy `notify_buyer`, `notify_seller`, `notification_title`, `notification_body`, and `notification_action` values from `default/self_fulfillment`.

---

### Bug 4 (P1): Settlement Notifications Pollute Buyer Inbox — No Role Filtering

**Issue:** This dual-role user (`ef690ff1`) has 5 unread settlement notifications in their inbox. These are seller-facing ("Payment Settlement Created") but appear in the buyer notification feed. The inbox has no role-based filtering. The unread badge shows 5 — all from settlements — giving the false impression of buyer-relevant updates.

Verified: All 5 unread notifications for this user are type `settlement`. Zero buyer-relevant unread notifications exist.

**Why critical:** The buyer sees a badge of "5" and opens the inbox expecting order updates. Instead, they find financial settlement notices they can't act on from the buyer interface. This erodes trust and trains users to ignore notifications.

**Impact:** Every dual-role user (seller who also buys). The unread count is misleading.

**Risk of fixing:** Medium — must not hide legitimate cross-role notifications. Settlement type is unambiguously seller-facing, so filtering it from the buyer inbox is safe.

**Fix:** In `useNotifications` and `useUnreadNotificationCount`, exclude seller-only notification types (`settlement`, `seller_approved`, `seller_rejected`, `seller_suspended`, `product_approved`, `product_rejected`, `license_approved`, `license_rejected`) when the user is viewing the buyer interface. Add a `SELLER_ONLY_TYPES` constant and filter with `.not('type', 'in', '(settlement,...)')`.

---

### Bug 5 (P2): `order` Type Notifications from RPC Missing `action` in Payload — Inconsistent Inbox Rendering

**Issue:** The RPC `create_multi_vendor_orders` inserts seller notifications with payload `{orderId, status, type}` — no `action` field. The `fn_enqueue_order_status_notification` trigger inserts with `{orderId, status, action, type, ...}`. In the inbox, `RichNotificationCard` only renders for notifications with `payload.action && !is_read`. Without `action`, the `order` type notifications render as plain buttons instead of rich cards with action buttons.

The home banner fallback we added (check `/orders/` reference_path) partially compensates, but the inbox itself renders these inconsistently.

**Why critical:** Sellers see two different visual treatments for order-related notifications — some have action buttons, some don't. This creates visual inconsistency.

**Impact:** Seller inbox UI. Minor — functional but aesthetically inconsistent.

**Risk of fixing:** None — adding `action` to the RPC payload is additive.

**Fix:** Update `create_multi_vendor_orders` RPC to include `'action', 'View Order'` in the seller notification payload jsonb_build_object.

---

### Implementation Plan

**SQL Migration** (Bugs 1, 2, 3, 5):

| Fix | What |
|-----|------|
| Bug 1 | Add buyer notification INSERT in `create_multi_vendor_orders` for order placement |
| Bug 2 | Add unique index on `user_notifications(queue_item_id)`, deduplicate existing rows |
| Bug 3 | UPDATE `food_beverages/self_fulfillment` rows to match `default/self_fulfillment` notification fields |
| Bug 5 | Add `action: 'View Order'` to seller notification payload in `create_multi_vendor_orders` |

**Client-side changes** (Bug 4):

| File | Change |
|---|---|
| `src/hooks/queries/useNotifications.ts` | Add `SELLER_ONLY_TYPES` filter to `useNotifications` query |
| `src/hooks/useUnreadNotificationCount.ts` | Add same filter to unread count query |

### Files Changed
| File | Change |
|---|---|
| SQL Migration | Buyer notification in RPC, unique index, flow data fix, action field |
| `src/hooks/queries/useNotifications.ts` | Filter seller-only notification types |
| `src/hooks/useUnreadNotificationCount.ts` | Filter seller-only types from badge count |

