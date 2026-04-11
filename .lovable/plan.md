

# Bulletproof System Completion — Plan

## Root Cause Analysis

### A. Notification Queue — TRUE ROOT CAUSE FOUND
The notifications are **not stuck due to code bugs**. The edge function works correctly:
1. Cron claims pending → processing
2. Tries to load Firebase credentials
3. **Fails because `FIREBASE_SERVICE_ACCOUNT` secret does not exist** (confirmed: not in secrets list)
4. Re-queues items back to pending
5. Next minute, cron claims them again → infinite loop

The recovery logic, retry mechanism, dead-letter handling — all work correctly in code. The **only fix needed is adding the Firebase service account secret**, or gracefully handling the "no push provider" scenario so notifications don't loop forever.

### B. Disputes Table — ALREADY FIXED
The `disputes` table exists with proper schema (id, order_id, buyer_id, seller_id, status, reason, description, resolution_notes, seller_response, sla fields). Created in the last migration. No action needed.

### C. Low Stock Alerts — ALREADY FIXED  
`LowStockAlerts.tsx` already uses `p.low_stock_threshold || 5` per product. Fully DB-driven. No action needed.

---

## What Actually Needs to Be Done

### Fix 1: Stop Notification Infinite Loop (P0)
**Problem:** Without `FIREBASE_SERVICE_ACCOUNT`, notifications cycle forever (pending → processing → pending).

**Solution — two parts:**

**Part A: Edge function resilience**
- When credentials fail, instead of re-queuing to `pending` (which causes infinite retry), mark items as `failed` with `last_error: "Push provider not configured"` after 3 credential-failure cycles
- Add a `credential_failures` counter or check `retry_count` — if retry_count >= 3 and the error is always "credentials", move to `failed` status

**Part B: Reset the 77 stuck records**
- Migration to update all 77 `processing` records to `failed` with `last_error: 'FIREBASE_SERVICE_ACCOUNT not configured — no push provider available'`
- This stops the infinite loop immediately

**Part C: In-app notification fallback**
- When push credentials are missing, still insert into `user_notifications` (in-app notifications work without Firebase)
- Mark queue item as `processed` with note that push was skipped but in-app was delivered

### Fix 2: Dispute System Verification (P1)
Disputes table exists. Need to verify:
- RLS policies are in place (check and add if missing)
- `sla_deadline` column exists (it doesn't — the schema shows no `sla_deadline` column, need to add it)
- Connect the existing cron job `check_dispute_sla_every_15m` to the actual table schema
- Verify dispute functions reference correct column names

### Fix 3: Monitor-Stalled-Deliveries Permission Fix (P1)
Edge function logs show: `permission denied for table delivery_assignments`. The edge function uses `SUPABASE_SERVICE_ROLE_KEY` but still gets permission denied — likely an RLS issue or the function is using anon key. Quick fix in the edge function.

---

## Implementation Steps

1. **Migration**: Reset 77 stuck notifications to `failed`, add `sla_deadline` to disputes table
2. **Edge function update**: Make `process-notification-queue` gracefully handle missing credentials (deliver in-app only, mark as processed, don't loop)
3. **Disputes RLS**: Add policies if missing
4. **Deploy & validate**: Deploy edge function, verify queue stops looping

## What This Does NOT Do
- Does not add Firebase — you need to provide the service account JSON from your Firebase project
- Does not redesign anything — purely completes and hardens existing systems

## Technical Details
- Edge function change: ~15 lines in the credential-failure handler (lines 358-370)
- Migration: ~20 lines SQL
- Total scope: 2 files modified, 1 migration created

