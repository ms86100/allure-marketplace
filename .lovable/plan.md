

## Enterprise-Grade Refund System — Final Plan

### Scope acknowledgement
Building a financial-grade refund system with ledger, state machine, idempotency, audit trail, realtime events, and guaranteed notifications. No real PSP integration yet — designed so Razorpay/Stripe can plug in without redesign.

---

### Part 1 — Database (source of truth)

**Migration `<ts>_refund_enterprise.sql`:**

1. **`payment_ledger`** — immutable financial record
   ```sql
   id, order_id, user_id, type ('debit'|'credit'|'refund'), amount, currency,
   status ('pending'|'success'|'failed'), reference_id, idempotency_key UNIQUE,
   gateway, gateway_response jsonb, created_at, updated_at
   ```
   RLS: buyer/seller of order can SELECT; INSERT only via SECURITY DEFINER RPC.

2. **Extend `refund_requests`**
   ```sql
   ADD COLUMN refund_state TEXT (state-machine column, default 'requested')
   ADD COLUMN gateway_refund_id TEXT
   ADD COLUMN gateway_status TEXT
   ADD COLUMN refund_method TEXT (already exists — keep)
   ADD COLUMN sla_deadline TIMESTAMPTZ
   ```
   Backfill `refund_state` from existing `status`.

3. **`refund_audit_log`** — append-only
   ```sql
   id, refund_id, action, actor_id, actor_role, before_state, after_state,
   metadata jsonb, created_at
   ```
   No UPDATE/DELETE policies. SELECT for buyer/seller of related order + admin.

4. **State-machine enforcement trigger** on `refund_requests`
   - BEFORE UPDATE: reject any `refund_state` transition not in the allowed map.
   - Allowed: `requested→approved|rejected`, `approved→refund_initiated`, `refund_initiated→refund_processing`, `refund_processing→refund_completed|refund_failed`, `refund_failed→refund_initiated` (retry).

---

### Part 2 — Core RPCs (idempotent, locked, SECURITY DEFINER)

1. **`approve_refund(p_refund_id uuid)`**
   - Lock row `FOR UPDATE`
   - Verify caller = seller of order
   - Validate state = `requested`
   - Transition → `approved`, set `approved_at`, `sla_deadline = now() + 72h`
   - Insert audit log
   - Auto-chain into `initiate_refund` (since `original_payment` flow is automatic)

2. **`reject_refund(p_refund_id uuid, p_reason text)`**
   - Same locking + auth
   - Requires `length(reason) >= 5`
   - Audit log

3. **`initiate_refund(p_refund_id uuid, p_idempotency_key text)`**
   - `INSERT INTO payment_ledger` with `idempotency_key` UNIQUE → duplicate calls fail cleanly
   - Lock refund row
   - Validate state = `approved`
   - Transition → `refund_initiated`
   - Audit log

4. **`complete_refund(p_refund_id uuid, p_gateway_ref text, p_gateway_status text)`**
   - Service-role / system only (cron + future PSP webhook)
   - Update ledger entry to `success` + `reference_id`
   - Transition `refund_initiated|refund_processing → refund_completed`
   - Set `settled_at`
   - Audit log
   - Insert notification + invoke push function

5. **`fail_refund(p_refund_id uuid, p_reason text)`**
   - Transition → `refund_failed`
   - Mark ledger entry `failed`
   - Audit log + notify

All RPCs: `SECURITY DEFINER`, `SET search_path = public`, `SELECT … FOR UPDATE` on refund row, structured exceptions.

---

### Part 3 — Realtime + notifications

- Enable `REPLICA IDENTITY FULL` + add `refund_requests` to `supabase_realtime` publication (if not already).
- AFTER INSERT/UPDATE trigger on `refund_requests` → insert into `notifications` for buyer & seller with role-aware copy + invoke `send-push-notification` via `pg_net` (best-effort; UI realtime is the guaranteed channel).
- Reuse existing `sendPushNotification` retry helper from edge.

---

### Part 4 — Edge functions

1. **`refund-processor` (new)** — invoked by frontend after `approve_refund` succeeds, OR by cron. 
   - Calls `initiate_refund` with a UUID idempotency key derived from `refund_id + attempt`.
   - Simulates gateway success (TODO marker for Razorpay/Stripe), then calls `complete_refund` with mock `gateway_ref`.
   - Returns final state.
   - Designed as the single abstraction point for future PSP plug-in.

2. **`auto-cancel-orders` (extend)**
   - Auto-approve `requested` refunds older than 48h (already exists — keep).
   - Auto-initiate `approved` refunds immediately (sweep every cron tick).
   - Auto-complete `refund_processing` refunds older than 72h (manual fallback when no PSP wired).
   - Each step calls the proper RPC — no direct table updates.

---

### Part 5 — Frontend

1. **`src/components/refund/RefundRequestCard.tsx`** (buyer)
   - Add Supabase realtime subscription on `refund_requests` filtered by `order_id`.
   - Render full timeline component (Requested → Approved → Initiated → Processing → Completed) with timestamps from audit log.
   - Show: amount, method copy ("Returned to original UPI/card in 3–5 business days"), `gateway_refund_id` when present.
   - Add evidence picker (uses new shared component) — passes URLs to `request_refund`.

2. **`src/components/refund/SellerRefundActions.tsx`** (seller)
   - Replace direct `.update({status:'approved'})` with `supabase.rpc('approve_refund', …)`.
   - Replace reject path with `rpc('reject_refund', …)`.
   - Remove "Mark as Refunded" manual button — settlement is automatic via `refund-processor` after approve. Show read-only state badges instead.

3. **`src/components/ui/multi-image-capture.tsx` (new)** — shared component
   - Buttons: Gallery / Camera / Native (Capacitor).
   - Reuses existing `pickOrCaptureImage` from `@/lib/native-media`.
   - Web: `<input accept="image/*" capture="environment">` + plain gallery input.
   - Validates size (5MB) + count (max 3), uploads to `app-images` storage bucket, returns URL[].

4. **`src/components/order/OrderHelpSheet.tsx`** — swap evidence input for `MultiImageCapture`.

5. **New `src/components/refund/RefundTimeline.tsx`** — visual stepper reading audit log entries.

---

### Part 6 — Security & RLS

- All state-changing operations: RPC only. Revoke direct UPDATE on `refund_requests.refund_state` for `authenticated` (column-level grants).
- `payment_ledger`: no direct INSERT/UPDATE for `authenticated` — RPC only.
- `refund_audit_log`: INSERT only via trigger / RPC.
- Row locking (`FOR UPDATE`) in every RPC prevents double-spend / race conditions.
- `idempotency_key` UNIQUE constraint on ledger blocks replay attacks at DB level.

---

### Part 7 — Telemetry & validation

After implementation, user runs these tests (I will instrument console logs):
1. Buyer requests refund with 2 photos → seller sees with evidence.
2. Seller approves → buyer card auto-updates within 2s (no refresh).
3. Refund auto-progresses approved → initiated → completed within ~5s.
4. Manually call `initiate_refund` with same key twice → second call rejected.
5. Audit log shows 4 entries (request, approve, initiate, complete).
6. Ledger has one `refund` row with `status=success`.

---

### Files touched

| File | Change |
|---|---|
| `supabase/migrations/<ts>_refund_enterprise.sql` | Tables, columns, triggers, RLS, backfill |
| `supabase/migrations/<ts>_refund_rpcs.sql` | 5 RPCs with locking + idempotency |
| `supabase/functions/refund-processor/index.ts` | NEW — gateway abstraction |
| `supabase/functions/auto-cancel-orders/index.ts` | Extend cron sweep |
| `src/components/refund/RefundRequestCard.tsx` | Realtime + timeline + evidence |
| `src/components/refund/SellerRefundActions.tsx` | Switch to RPCs |
| `src/components/refund/RefundTimeline.tsx` | NEW — visual stepper |
| `src/components/ui/multi-image-capture.tsx` | NEW — shared capture |
| `src/components/order/OrderHelpSheet.tsx` | Use MultiImageCapture |

### Out of scope (declared)
- Real Razorpay/Stripe refund API call — `refund-processor` has a clearly-marked TODO with the exact integration point (`callGateway()` function). Until wired, refunds auto-complete with a synthetic `gateway_refund_id = 'manual-<uuid>'` and ledger `gateway = 'manual'`. The architecture supports plugging in a real PSP without schema or UI changes.

