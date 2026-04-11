

## Audit Results and Bulletproof Fix Plan

### What the audit found vs reality

**A. Notification Queue — NOT broken, but has 77 orphaned records**
- The pipeline code is solid: has retry, dead-letter, stuck recovery, dedup, exponential backoff, preference filtering
- Root cause: `FIREBASE_SERVICE_ACCOUNT` secret is not configured. Without it, the old code path failed and never created in-app notifications for 77 items
- The current code already handles missing Firebase gracefully (marks as `processed` with in-app delivery) — but the 77 legacy failures predate that fix
- Fix: Re-queue the 77 orphaned failed items back to `pending` so the current (working) pipeline picks them up and delivers them as in-app notifications

**B. Disputes Table — EXISTS, but is empty and not connected**
- The `disputes` table already exists with correct columns: `id, order_id, buyer_id, seller_id, status, reason, description, resolution_notes, seller_response, seller_responded_at, escalated_at, resolved_at, sla_deadline, created_at, updated_at`
- 0 rows — the refund system uses `refund_requests`, not `disputes`
- The system currently treats refund requests AS disputes (buyer raises refund → seller approves/rejects). This is a simple refund-only flow, not a full dispute system
- No code references the `disputes` table for the current buyer-seller flow
- Fix: Leave the disputes table as-is for future use. The refund_requests table IS the active dispute mechanism. No schema changes needed.

**C. Low Stock Alerts — Already DB-driven**
- Code uses `p.stock_quantity <= (p.low_stock_threshold || 5)` — threshold comes from DB per product, with fallback of 5
- NOT hardcoded to 10. The `.lte('stock_quantity', 20)` is just a wider fetch range to reduce DB calls, then client filters against the real threshold
- Fix: None needed. Already correct.

**D. End-to-end validation — needs the notification requeue**
- Order placement → status updates → delivery all work
- Notifications are the only broken link (the 77 orphaned items)

---

### Implementation Plan

**Step 1: Requeue 77 orphaned failed notifications** (Data fix)
- Use Supabase insert tool to run:
  ```sql
  UPDATE notification_queue 
  SET status = 'pending', retry_count = 0, last_error = NULL, processed_at = NULL
  WHERE status = 'failed' 
  AND id NOT IN (SELECT queue_item_id FROM user_notifications WHERE queue_item_id IS NOT NULL)
  ```
- The current pipeline will pick these up on next cron tick, create in-app notifications, and mark them `processed` (push will be skipped gracefully since Firebase isn't configured)

**Step 2: Harden the edge function against future credential failures** (Code fix)
- In `process-notification-queue/index.ts`, the current code already handles this correctly for new items. No change needed.

**Step 3: Add a max-age dead-letter for permanently failed items** (Migration)
- Add a check: if a queue item has been `failed` for more than 24 hours and has no corresponding `user_notification`, auto-create the in-app notification and mark as `processed`
- This prevents future orphaning

**Step 4: Verify low stock is fully DB-driven** (No-op — already correct)

**Step 5: Verify disputes table RLS** (Quick check)
- Ensure the disputes table has appropriate RLS policies ready for when it's used

---

### Files to modify
- `supabase/functions/process-notification-queue/index.ts` — Add orphan recovery logic (items failed > 24h without in-app delivery get auto-delivered)
- Data operation: Requeue 77 orphaned items via UPDATE

### What does NOT need fixing
- Notification pipeline architecture (already has retry, backoff, dead-letter, dedup, preference checks)
- Disputes table schema (already complete)
- Low stock alerts (already DB-driven with fallback)
- End-to-end order flow (works, just notifications were orphaned)

### Risk note
- Firebase push notifications will remain skipped until `FIREBASE_SERVICE_ACCOUNT` is configured as an edge function secret. In-app notifications will work fine.

