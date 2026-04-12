

# Order Support System — Revised Implementation Plan

All 6 reviewer issues are addressed. Here is the corrected, production-ready plan.

---

## Architecture Overview

```text
User taps "Need Help"
        │
        ▼
┌─────────────────────┐
│  INSTANT DIAGNOSIS  │  ← NEW (Issue #1)
│  Pre-check layer    │
│  Auto-evaluate:     │
│  - Is delayed?      │
│  - Is cancelable?   │
│  - Payment failed?  │
└────────┬────────────┘
         │ shows instant insight + quick resolve
         ▼
┌─────────────────────┐
│  GUIDED FLOW        │
│  Category → Subtype │
│  → Evidence → Confirm│
└────────┬────────────┘
         │ user confirms
         ▼
┌─────────────────────┐
│  RULE ENGINE        │  ← Runs BEFORE ticket (Issue #2)
│  fn_evaluate_support│
│  _resolution()      │
└────────┬────────────┘
    ┌────┴────┐
    │ resolved│ → show result, NO ticket created
    └─────────┘
    ┌─────────┐
    │ not     │ → create ticket → notify seller
    │ resolved│   with SLA deadline (Issue #4)
    └─────────┘
```

---

## Fixes Applied

### Fix 1: Instant Diagnosis Layer (Pre-Check)
Before showing the category picker, the system auto-evaluates the order and shows an instant insight card:
- **Delayed?** → "Your order is running ~12 min late. Want to track it or report?"
- **Cancelable?** → "This order can still be cancelled. Want to cancel?"
- **Payment failed?** → "Payment issue detected. Want to retry or request refund?"

This is pure frontend logic using existing `orders` data + `computeETA()` from `etaEngine.ts`. No DB call needed.

### Fix 2: Ticket Creation Only When Needed
Flow becomes: user confirms summary → rule engine evaluates → if auto-resolved, show resolution and **never create a ticket**. Ticket is created only when no rule matches.

### Fix 3: Separate Support Messages (No Chat Reuse)
`support_ticket_messages` is a standalone table. `seller_conversations` is NOT used for support. If a support thread needs seller input, it happens inside the ticket message system with controlled actions (accept/reject/clarify), not free-form chat.

### Fix 4: SLA in Phase 1
Every ticket gets `sla_deadline = created_at + seller_config_hours` (default 2h). A Postgres function `fn_check_support_sla()` marks overdue tickets and re-notifies sellers. Triggered via pg_cron every 15 minutes.

### Fix 5: Idempotency at DB Level
Partial unique index:
```sql
CREATE UNIQUE INDEX idx_support_tickets_idempotent
ON support_tickets (order_id, issue_type)
WHERE status IN ('open', 'seller_pending');
```

### Fix 6: Evidence Storage
- New `support-evidence` storage bucket (private)
- Client-side: max 3 images, max 5MB each, JPEG/PNG only, compressed before upload
- RLS: buyer can upload to own ticket path, seller can read for their orders

---

## Database Changes (Single Migration)

### New Tables

**`support_tickets`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| order_id | uuid FK → orders | |
| buyer_id | uuid FK → profiles | |
| seller_id | uuid FK → profiles | |
| society_id | uuid | |
| issue_type | text | late_delivery, missing_item, wrong_item, payment_issue, cancel_request, other |
| issue_subtype | text | nullable |
| description | text | |
| evidence_urls | text[] | |
| status | text | open, auto_resolved, seller_pending, resolved, closed |
| resolution_type | text | refund, replacement, apology, cancel, manual, nullable |
| resolution_note | text | |
| sla_deadline | timestamptz | created_at + config hours |
| sla_breached | boolean | default false |
| resolved_at | timestamptz | |
| created_at / updated_at | timestamptz | |

Partial unique index: `(order_id, issue_type) WHERE status IN ('open','seller_pending')`

**`support_ticket_messages`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| ticket_id | uuid FK → support_tickets | |
| sender_id | uuid | |
| sender_type | text | buyer, seller, system |
| message_text | text | |
| action_type | text | nullable — accept_resolution, reject, clarify |
| metadata | jsonb | |
| created_at | timestamptz | |

**`auto_resolution_rules`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| issue_type | text | |
| condition_json | jsonb | e.g. `{"order_status": "placed"}` |
| action_json | jsonb | e.g. `{"type": "cancel_and_refund"}` |
| priority | int | |
| is_active | boolean | |

### Postgres Functions

1. **`fn_evaluate_support_resolution(p_order_id, p_issue_type, p_issue_subtype)`** — checks `auto_resolution_rules` against order state. Returns `{resolved: bool, resolution_type, resolution_note}`. Called BEFORE ticket insert.

2. **`fn_check_support_sla()`** — cron job function. Marks tickets past `sla_deadline` as `sla_breached = true`, enqueues re-notification to seller via `notification_queue`.

### Storage

- Create `support-evidence` bucket (private)
- RLS: authenticated users can upload to `{user_id}/{ticket_context}/` path
- Sellers can read files linked to their order tickets

### Seed Data (auto_resolution_rules)

| issue_type | condition | action |
|-----------|-----------|--------|
| cancel_request | order_status IN (placed, preparing) | cancel + create refund_request |
| late_delivery | ETA breached > 15min | apology + updated ETA notification |
| payment_issue | payment_status = failed | verify + trigger refund if needed |

---

## Frontend Changes

### Rewrite: `src/components/order/OrderHelpSheet.tsx`
Multi-step guided drawer:
1. **Instant Diagnosis Card** — auto-shows relevant insight based on order state (uses `computeETA`, order status, payment status)
2. **Category Selection** — 6 options (unchanged)
3. **Sub-type Selection** — context-dependent (e.g., missing item → one/multiple)
4. **Evidence Upload** — for wrong_item/damaged, max 3 images, client-side compression
5. **Summary Confirmation** — structured recap, user confirms
6. **Resolution Screen** — calls rule engine via Supabase RPC; shows result OR creates ticket

### New: `src/components/support/SupportTicketCard.tsx`
Compact card for buyer's ticket list showing status, issue type, SLA countdown.

### New: `src/components/support/SupportTicketDetail.tsx`
Full ticket view with message timeline, resolution status, evidence gallery.

### New: `src/components/seller/SellerSupportTab.tsx`
Seller dashboard tab showing incoming tickets with action buttons (accept resolution, reject with reason, send clarification). No free-form chat.

### New: `src/hooks/useSupportTickets.ts`
- `useMyTickets(buyerId)` — buyer's tickets
- `useSellerTickets(sellerId)` — seller's incoming tickets
- `useCreateTicket()` — mutation that first calls `fn_evaluate_support_resolution`, only inserts if unresolved
- `useTicketMessages(ticketId)` — with realtime subscription

### Modified: `src/pages/OrderDetailPage.tsx`
- Wire new `OrderHelpSheet` with order context (status, ETA, payment, items)
- Show active ticket status inline if one exists for this order

---

## What is NOT in Phase 1

- AI intent classification (Phase 3)
- Ticket merge logic (Phase 2)
- Proactive delay detection cron (Phase 2 — separate from SLA)
- AI recommendations to seller (Phase 3)
- Weighted confidence in rule engine (Phase 3)

---

## Files Summary

| File | Action |
|------|--------|
| New migration SQL | 3 tables + 2 functions + storage bucket + seed rules + partial unique index |
| `src/components/order/OrderHelpSheet.tsx` | Complete rewrite — multi-step with instant diagnosis |
| `src/components/support/SupportTicketCard.tsx` | New |
| `src/components/support/SupportTicketDetail.tsx` | New |
| `src/components/seller/SellerSupportTab.tsx` | New |
| `src/hooks/useSupportTickets.ts` | New |
| `src/pages/OrderDetailPage.tsx` | Wire support context |
| pg_cron job (via SQL insert) | `fn_check_support_sla` every 15 min |

No new dependencies. No AI costs. Pure deterministic Phase 1.

