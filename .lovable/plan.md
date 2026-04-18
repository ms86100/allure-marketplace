

## Where the resolved ticket went

Short answer: **it was never a `support_ticket`** — refund requests live in a completely separate table (`refund_requests`) that the Seller → Support tab has no idea about.

### What I checked in the live DB

1. **`support_tickets` table — TOTALLY EMPTY** (0 rows). Every seller's Support tab will show "No active tickets" and "No resolved tickets yet". The seller's "Resolved" tab is correctly empty according to its own data source.

2. **`refund_requests` table — 2 rows**, both for seller `68a6cc09…` (Dabbas), both with `status = 'approved'` / `refund_state = 'approved'`:
   - `quality_issue` — "issue with the quantity" — created today 08:14 UTC
   - `wrong_item` — created 11 Apr

3. **`SellerSupportTab.tsx`** (`useSellerTickets`) only queries `support_tickets`. It has no awareness of `refund_requests`.

4. **`SellerRefundList.tsx`** is the component that shows refunds — it queries `refund_requests` joined to `orders.seller_id`. That's where the resolved refund is actually sitting.

### Why this looks broken to the seller

Two parallel, disconnected systems:

| System | Table | Where shown for seller |
|---|---|---|
| Support tickets (chat-style, SLA timer, Active/Resolved tabs) | `support_tickets` | Seller dashboard → **Support** tab |
| Refund requests (approve/reject, gateway refunds) | `refund_requests` | Seller dashboard → **Refunds** list (separate component) |

When the buyer raised the recent refund, the flow created a `refund_requests` row, never a `support_tickets` row. So:
- Support tab → empty (correct, given its data source)
- Refund list → has the approved refund (also correct)

The bug is that **the seller's mental model is "Support = anywhere a buyer raised an issue"**, but the UI splits these across two surfaces with no cross-link.

### Fix — unify "Resolved" view in Support tab

Make the seller's Support tab show refund requests alongside tickets, so resolved refunds appear under "Resolved".

**Plan:**

1. **New hook `useSellerSupportItems(sellerId)`** in `src/hooks/useSupportTickets.ts` — runs both queries in parallel (`support_tickets` + `refund_requests` via `orders.seller_id`) and returns a unified array shape:
   ```ts
   { kind: 'ticket' | 'refund', id, status, issue_type, description, created_at, resolved_at, sla_deadline, sla_breached, source_id }
   ```
   Maps refund states → unified status:
   - `pending` / `under_review` → `seller_pending`
   - `approved` / `processed` / `settled` → `resolved`
   - `rejected` → `closed`

2. **Update `SellerSupportTab.tsx`**:
   - Swap `useSellerTickets` → `useSellerSupportItems`.
   - Active filter: `['open', 'seller_pending']` (covers both kinds via the mapping).
   - Resolved filter: `['resolved', 'auto_resolved', 'closed']`.
   - Stats counters use the unified list.
   - Tap behaviour: tickets open `SupportTicketDetail` (existing); refunds open the existing refund detail view (`SellerRefundList` already has one — extract or reuse) OR navigate to the order page. I'll reuse the existing refund row UI inline so the seller can take action without leaving the tab.

3. **Card rendering**: small badge in `SupportTicketCard` (or new `SupportRefundRow`) labelled "Refund" vs "Ticket" so the seller knows which surface it came from.

No DB changes. Pure UI/data-layer unification.

### Files

- `src/hooks/useSupportTickets.ts` — add `useSellerSupportItems`
- `src/components/seller/SellerSupportTab.tsx` — switch source + render both kinds
- `src/components/support/SupportTicketCard.tsx` — accept optional "kind" prop for the Refund badge

### Out of scope

- Buyer-side unification (separate pass if you want).
- Migrating `refund_requests` into `support_tickets` (deeper refactor; not needed for visibility).

