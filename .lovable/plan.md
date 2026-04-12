

# Order Support System — Implementation Audit & Completion Plan

## What Is DONE (Verified in DB + Code)

| Component | Status | Verified |
|-----------|--------|----------|
| `support_tickets` table | DONE | All columns present, RLS policies for buyer SELECT/INSERT/UPDATE, seller SELECT/UPDATE |
| `support_ticket_messages` table | DONE | FK to tickets, RLS for participants, realtime-ready |
| `auto_resolution_rules` table | DONE | Seeded with 3 rules (cancel, late_delivery, payment) |
| Partial unique index (idempotency) | DONE | `idx_support_tickets_idempotent` on `(order_id, issue_type) WHERE status IN ('open','seller_pending')` |
| `fn_evaluate_support_resolution()` | DONE | Runs before ticket creation, checks rules against order state |
| `fn_check_support_sla()` | DONE | Marks breached tickets, enqueues seller re-notification |
| `support-evidence` storage bucket | DONE | Private bucket with RLS for buyer upload/view + seller view |
| `src/hooks/useSupportTickets.ts` | DONE | All hooks: evaluate, create, list (buyer/seller/order), messages, send, resolve, upload |
| `src/components/order/OrderHelpSheet.tsx` | DONE | 6-step guided flow: diagnosis → category → subtype → evidence → summary → resolution |
| `src/components/support/SupportTicketCard.tsx` | DONE | Compact card with status, SLA breach indicator |
| `src/components/support/SupportTicketDetail.tsx` | DONE | Full sheet with messages, seller actions (accept/reject) |
| `src/components/seller/SellerSupportTab.tsx` | DONE | Active/resolved filter, SLA stats, ticket list |
| `OrderDetailPage.tsx` wiring | DONE | OrderHelpSheet + SupportTicketCard + SupportTicketDetail integrated for both buyer/seller views |

---

## What Is NOT Done (Gaps Found)

### GAP 1: SellerSupportTab Not Wired Into Seller Dashboard
`SellerSupportTab` component exists but is **not imported or rendered** anywhere. The seller dashboard at `SellerDashboardPage.tsx` has 4 tabs (Orders, Schedule, Tools, Stats) — none include support tickets.

### GAP 2: Bug in `fn_evaluate_support_resolution` — ETA Breach Logic Is Inverted
The current SQL checks:
```sql
v_order.estimated_delivery_at > (now() - 15min)
```
This means "ETA is AFTER 15 minutes ago" — which is TRUE for orders that are NOT late. The condition should be `<` (ETA is BEFORE 15 minutes ago = order is late by 15+ minutes).

### GAP 3: No pg_cron Job Scheduled for SLA Enforcement
`fn_check_support_sla()` function exists but no cron job is scheduled to call it. Without this, SLA breaches are never detected and sellers never get re-notified.

### GAP 4: Rule Engine Does Not Execute Actions (cancel_and_refund, refund)
`fn_evaluate_support_resolution` only RETURNS a resolution result — it does not actually cancel orders or create refund_requests. The frontend shows "Order cancelled and refund initiated automatically" but nothing actually happens.

---

## Completion Plan

### Step 1: Fix ETA Breach Logic in `fn_evaluate_support_resolution`
**Migration**: Change the comparison operator from `>` to `<`:
```sql
IF v_order.estimated_delivery_at IS NULL
   OR v_order.estimated_delivery_at < (now() - ((v_conditions->>'eta_breached_minutes')::int * interval '1 minute'))
```
This correctly matches: "ETA was 15+ minutes ago = order is late."

### Step 2: Add Action Execution to Rule Engine
Enhance `fn_evaluate_support_resolution` to actually perform the resolved action:
- **cancel_and_refund**: Update `orders.status` to `'cancelled'` and insert into `refund_requests`
- **refund**: Insert into `refund_requests` table
- **apology**: No DB action needed (just returns the note)

This is critical — without it, auto-resolution is cosmetic only.

### Step 3: Wire SellerSupportTab Into Seller Dashboard
- Add a 5th tab "Support" to the seller dashboard tab bar (grid changes from `grid-cols-4` to `grid-cols-5`)
- Import and render `SellerSupportTab` with `sellerProfile.id`
- Show a badge count for active tickets (same pattern as pending orders badge)

### Step 4: Schedule pg_cron Job for SLA Enforcement
Add a cron job via migration:
```sql
SELECT cron.schedule('check-support-sla', '*/15 * * * *', 'SELECT public.fn_check_support_sla()');
```
This runs every 15 minutes to mark overdue tickets and re-notify sellers.

---

## Safety Guarantees

- **No regressions**: All changes are additive. The ETA fix is a single operator change in an isolated function. Seller dashboard tab addition uses existing tab pattern.
- **No new dependencies**: Everything uses existing infrastructure (refund_requests table, notification_queue, Tabs component).
- **Idempotent**: The cron job function is already idempotent (only processes `sla_breached = false`). The rule engine action execution will use `ON CONFLICT` / status checks to avoid double-processing.
- **Tested patterns**: SellerSupportTab follows the exact same pattern as other dashboard tabs. The refund_request insert mirrors existing refund logic.

