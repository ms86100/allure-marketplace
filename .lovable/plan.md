

# Fix: Duplicate Push Notifications on Buyer Lock Screen

## Root Cause — Proven with Database Evidence

There are **TWO separate trigger functions** that fire on order INSERT, both inserting into `notification_queue`:

1. **`fn_enqueue_new_order_notification`** — fires on `AFTER INSERT ON orders` (trigger: `trg_enqueue_new_order_notification`)
2. **`fn_enqueue_order_status_notification`** — fires on `AFTER UPDATE ON orders` but ALSO matches INSERT events because other BEFORE INSERT triggers (like `trg_set_order_society_id`, `trg_update_updated_at_orders`) cause the row to be "updated" during the same transaction

**Database proof:** Every single order in the last 48 hours has exactly **2 copies** of the `placed` notification with the **exact same `created_at` timestamp**. For example:
- Order `0ca43884...`: 2 copies at `2026-03-18 11:46:32`
- Order `d9b5c141...`: 2 copies at `2026-03-18 09:42:44`
- This pattern is consistent for ALL recent orders

The 30-second idempotency check in `fn_enqueue_order_status_notification` does NOT catch these because both trigger functions run in the **same transaction** — the duplicate doesn't exist yet when the second one checks.

Additionally, looking at the screenshot: the buyer is getting "Your Order is Ready" and "We're Preparing Your Order" notifications stacked — these are status-change notifications that come from `fn_enqueue_order_status_notification`. The seller couldn't accept orders previously (now fixed with the `p.latitude` fix), so when the seller finally processed multiple orders at once, the buyer received a flood of backlogged notifications.

## Fix Plan

### 1. Database Migration — Drop the duplicate INSERT trigger

The `fn_enqueue_new_order_notification` trigger is redundant. The `fn_enqueue_order_status_notification` already handles the `placed` status (via the CASE statement). We need to:

- **Drop** `trg_enqueue_new_order_notification` trigger from `orders` table
- **Drop** the `fn_enqueue_new_order_notification` function

This eliminates the double-insert at the source.

### 2. Database Migration — Strengthen idempotency guard

Update `fn_enqueue_order_status_notification` to use a **UNIQUE constraint** approach instead of the time-window check. Add the idempotency check using `ON CONFLICT DO NOTHING` on `(reference_path, payload->>'status')` within a short window, or simply use a stronger dedup:

```sql
-- Before inserting, use INSERT ... ON CONFLICT to prevent any remaining edge cases
-- Add a partial unique index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_queue_order_status_dedup
ON public.notification_queue (reference_path, (payload->>'status'))
WHERE reference_path IS NOT NULL 
  AND reference_path LIKE '/orders/%'
  AND created_at > now() - interval '60 seconds';
```

Since partial unique indexes with `now()` won't work (not immutable), the better approach is:
- Keep the 30-second SELECT check but also add `ON CONFLICT DO NOTHING` on the insert itself using a deterministic idempotency key column

Actually, the simplest permanent fix is:
- Drop the duplicate trigger (fix 1 above)
- The existing 30-second idempotency SELECT guard in `fn_enqueue_order_status_notification` handles retries/edge cases

### 3. Clean up existing duplicate notifications

Run a one-time cleanup to remove duplicate `notification_queue` entries that have already been created.

## Summary

| Change | Type | Purpose |
|--------|------|---------|
| Drop `trg_enqueue_new_order_notification` trigger | DB Migration | Eliminates the root cause of double notifications |
| Drop `fn_enqueue_new_order_notification` function | DB Migration | Cleanup orphaned function |
| Clean existing duplicates | DB Migration | Remove already-queued duplicates |

No frontend changes needed. This is purely a database-level fix.

