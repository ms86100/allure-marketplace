

# Round 30: Full Trigger Chain Audit — Order Accept Flow

## What happens when a seller clicks "Mark Accepted"

The frontend PATCH sets `status = 'accepted'` on the order. This fires **17 triggers** in sequence. Here is the exact chain and every hidden issue.

## Trigger Execution Chain (placed → accepted)

```text
BEFORE UPDATE triggers (execute in alphabetical order):
  1. trg_compute_delivery_eta        — computes ETA on accept for delivery orders
  2. trg_enforce_delivery_otp        — skip (only fires on → delivered)
  3. trg_set_auto_complete_at        — skip (only fires on → delivered/completed/cancelled)
  4. trg_update_updated_at_orders    — sets updated_at = now()
  5. trg_validate_order_status_transition — validates placed→accepted is legal
  6. update_orders_updated_at        — DUPLICATE of #4, sets updated_at again (harmless)

AFTER UPDATE triggers:
  7. trg_auto_dismiss_delivery_notifications — FIRES on every terminal, but scans ALL unread notifs (see Bug 3)
  8. trg_create_seller_delivery_assignment — skip (only on → picked_up)
  9. trg_create_settlement_on_delivery — skip (only on → delivered/completed)
 10. trg_enqueue_order_status_notification — enqueues buyer/seller push notifications
 11. trg_generate_delivery_code      — skip (only on → ready/picked_up)
 12. trg_log_order_activity          — logs to society_activity (if society_id set)
 13. trg_recompute_seller_stats      — skip (only on → completed/cancelled/delivered)
 14. trg_restore_stock_on_order_cancel — FIXED last round (only on → cancelled)
 15. trg_sync_booking_status         — skip (only for booking orders)
 16. trg_sync_order_to_delivery_assignment — skip (only on → on_the_way/delivered)
```

## Five Issues Found

### Bug 1 (P1): `food_beverages/seller_delivery` has ALL notification fields NULL

**Evidence:** The query shows `notification_title = NULL, notify_buyer = false, notify_seller = false` for EVERY status in the `food_beverages/seller_delivery` flow. This means the seller's test order (which is `food_beverages` + `delivery` + `delivery_handled_by = null` = resolves to `seller_delivery`) will **never generate any push notification** for any status change — accept, preparing, ready, delivered, completed, cancelled. The buyer gets zero updates.

The `default/seller_delivery` row does have `notification_title = '✅ Order Accepted!'` but the trigger looks up `parent_group = food_beverages` first and finds the NULL row, so it stops there. The fallback to `default` only happens in `validate_order_status_transition`, NOT in `fn_enqueue_order_status_notification`.

**Fix:** Seed notification titles/bodies for all `food_beverages/seller_delivery` flow entries, OR add fallback-to-default logic in the notification trigger (matching how the validation trigger works).

**Risk:** Minimal — just data seeding. Choosing fallback logic is safer long-term but more code.

### Bug 2 (P2): Duplicate `update_updated_at` triggers

Two triggers do the same thing: `trg_update_updated_at_orders` and `update_orders_updated_at`. Both call `update_updated_at()`. This is harmless (sets `updated_at` twice to `now()`) but wasteful and confusing. One should be dropped.

**Fix:** Drop `update_orders_updated_at` trigger.

**Risk:** None — purely redundant.

### Bug 3 (P2): `auto_dismiss_delivery_notifications` fires on EVERY order update to terminal status and does an unscoped table scan

The trigger body runs: `UPDATE user_notifications SET is_read = true WHERE is_read = false AND type IN (...) AND created_at < now() - interval '2 hours'`. This has NO `WHERE` scoping to the current order or user — it marks ALL old delivery notifications for ALL users as read whenever ANY order hits a terminal state. At scale this is both a performance bomb and a correctness bug (dismisses notifications for unrelated orders).

**Fix:** Scope to `WHERE user_id = NEW.buyer_id AND payload->>'order_id' = NEW.id::text`, or better yet, move this to a cron job.

**Risk:** Need to verify `user_notifications` schema has `user_id` and `payload` columns.

### Bug 4 (P1): `fn_enqueue_order_status_notification` has no fallback to `default` parent_group

The validation trigger (`validate_order_status_transition`) has a two-pass lookup: first tries `parent_group = specific`, then falls back to `parent_group = 'default'`. But the notification trigger only does ONE lookup with `parent_group = COALESCE(v_parent_group, 'default')`. If `v_parent_group` is `food_beverages` but the flow row has NULL notification fields, it doesn't fall back to `default`. This is the root cause of Bug 1 and will affect any new parent_group added in the future.

**Fix:** Add fallback logic: if `v_title IS NULL` after the first lookup, retry with `parent_group = 'default'`.

**Risk:** Minimal — just an additional SELECT if the first one yields NULL.

### Bug 5 (P2): `trg_compute_delivery_eta` silently skips when `estimated_delivery_at` is already set

The trigger has: `IF NEW.estimated_delivery_at IS NOT NULL THEN RETURN NEW; END IF;`. This means if an order somehow already has an ETA (e.g., set during creation or a retry), it will never recompute. Currently the frontend doesn't set this field, so it works, but if order creation logic ever pre-populates it, ETA would be stale.

**Fix:** Change condition to only skip if `OLD.estimated_delivery_at IS NOT NULL` (i.e., don't recompute on re-acceptance, but do compute on first acceptance).

**Risk:** Low.

---

## Verdict: Will accept work 200% reliably?

**The PATCH itself succeeds** — we confirmed this from the network traces (status 200, order moved to `accepted` then `preparing` then `ready`). The `restore_stock_on_order_cancel` fix from last round and the `fn_enqueue_order_status_notification` fix from Round 29 have unblocked the flow.

**What's silently broken:** Notifications are not being sent for `food_beverages/seller_delivery` orders (Bug 1 + Bug 4). The buyer will never receive "Order Accepted", "Preparing", "Ready", etc. push notifications for this specific flow. This is a silent failure — no errors, no crashes, just missing notifications.

---

## Implementation Plan

### Migration: Fix notification fallback + seed data + cleanup

1. **Seed `food_beverages/seller_delivery` notification fields** — UPDATE all rows to have proper titles/bodies matching the `default/seller_delivery` pattern
2. **Add fallback to `default` in `fn_enqueue_order_status_notification`** — if first lookup returns NULL title, retry with `parent_group = 'default'`
3. **Drop duplicate trigger** `update_orders_updated_at`
4. **Scope `auto_dismiss_delivery_notifications`** to the specific order's buyer

### Files to Edit

| Artifact | Change |
|----------|--------|
| New SQL migration | Seed notification data + update notification trigger + drop duplicate trigger + scope dismiss trigger |

