

## Root Cause Analysis (verified against live DB)

**Schema (confirmed by `pg_constraint`):**
- `support_tickets.seller_id` → FK → `public.profiles(id)` (a **user_id**, not a seller_profiles.id)
- `support_tickets.buyer_id` → FK → `public.profiles(id)`
- `orders.seller_id` → FK → `public.seller_profiles(id)` (a **store id**)

So the order's `seller_id` and the ticket's `seller_id` mean **different things**. A translation step is required for every ticket insert.

**Data integrity (verified):**
- Every `seller_profiles.user_id` does have a matching `profiles.id` (count of orphans = 0).
- Sellers in this DB have `profiles.verification_status = 'pending'` — NOT `'approved'`.

**Why the insert fails (the actual chain):**

The current client code (`OrderHelpSheet` → `useCreateTicket`) translates `seller_profiles.id` → `profiles.id` in the client using two paths:

1. A direct `from('profiles').select('id').eq('id', sellerUserId)` — but the **RLS policy on `profiles`** is:
   `verification_status = 'approved' OR id = auth.uid() OR is_admin(auth.uid())`.
   Because the seller's profile is `pending`, the buyer's RLS-bound SELECT returns **zero rows**, so the client thinks the profile doesn't exist.
2. A fallback `rpc('fn_get_seller_user_id', …)` — this RPC takes a `seller_profiles.id`. By the time the hook calls it the input is already a `profiles.id`, so it returns NULL.

When the hook still constructs an insert (older deployed bundle / partial fix), the value placed into `seller_id` is wrong (e.g. `seller_profiles.id`) → Postgres rejects with constraint **`support_tickets_seller_id_fkey`**, error code `23503`, exactly matching the screenshot.

**Conclusion:** the failure is **not** a missing profile, not a missing seller, not a wrong constraint. It is a **client-side ID translation that depends on RLS-readable data the buyer cannot read**. The translation is unreliable by design.

---

## Fix — move all of it server-side, atomically

### 1. New SECURITY DEFINER RPC — `fn_create_support_ticket`
A single Postgres function that:
1. Validates `auth.uid() = p_buyer_id` (only the logged-in buyer can file their own ticket).
2. Loads the order, asserts `o.buyer_id = auth.uid()`.
3. Resolves `seller_user_id` server-side via `seller_profiles.user_id WHERE id = o.seller_id`. Raises a clean exception `seller_not_resolvable` if NULL.
4. Inserts into `support_tickets` with the **resolved profile id** (so the FK can never be violated again).
5. Inserts the seed `support_ticket_messages` row.
6. Enqueues the seller notification in `notification_queue` with the resolved user id.
7. Returns the new ticket row as JSON.

All in one transaction. RLS is bypassed only for the lookups and inserts that need it; the auth check at the top of the function preserves authorization.

### 2. Defensive hardening
- Add a **trigger `BEFORE INSERT ON support_tickets`** that re-validates `seller_id` exists in `profiles` and raises a meaningful error message instead of letting the FK error bubble up. This protects any future code path that bypasses the RPC.
- Keep the existing FK as-is (data integrity is non-negotiable; we are NOT relaxing the constraint to nullable).

### 3. Client refactor — single source of truth
- `useCreateTicket` (in `src/hooks/useSupportTickets.ts`) is rewritten to call only `supabase.rpc('fn_create_support_ticket', { … })` and pass the **raw `seller_profiles.id` from `orders.seller_id`**. Remove all client-side profile lookups, RPC calls, and try/fallback logic.
- `OrderHelpSheet.handleSubmit` (in `src/components/order/OrderHelpSheet.tsx`) drops its 30-line ID-resolution block and just hands `sellerId` (the order's `seller_id`) to the mutation — exactly matching the source of truth in the orders table.
- Friendly error mapping: `seller_not_resolvable` → "We couldn't reach this seller right now. Please try again or use chat." Idempotency violation → "You already have an active ticket for this issue."

### 4. Observability
- Inside `fn_create_support_ticket`, log a row to `audit_log` (`action='support_ticket_created'`, with order_id + issue_type + resolved_seller_user_id) on success and `action='support_ticket_failed'` with the reason on failure.
- Client logs `[Support] submit start/success/failure` with `{ orderId, issue_type, code }` (no PII) for trajectory tracking.

### 5. Verification
After the migration is applied, manually verify across all categories using the issue list defined in `OrderHelpSheet`:
- `cancel_request` (auto-resolved when status ∈ placed/confirmed/preparing → no ticket, refund row created)
- `late_delivery` / `late_delivery + still_waiting` / `late_delivery + no_update` (auto-resolved if ETA breached, otherwise ticket)
- `missing_item` + each subtype (ticket, requires evidence)
- `wrong_item` + each subtype (ticket, requires evidence)
- `payment_issue` (auto-resolved if payment_status='failed', otherwise ticket)
- `other` (always ticket)

Each path must either auto-resolve OR insert a ticket — never error. We will run a dry-run insert via the RPC for one order from the buyer's session to confirm.

---

## Files

**New migration**
- `supabase/migrations/<ts>_fn_create_support_ticket.sql`
  - `CREATE OR REPLACE FUNCTION public.fn_create_support_ticket(...)` (SECURITY DEFINER)
  - `CREATE TRIGGER trg_validate_support_ticket_seller BEFORE INSERT ON public.support_tickets …`
  - `GRANT EXECUTE … TO authenticated`

**Edited**
- `src/hooks/useSupportTickets.ts` — `useCreateTicket` calls only the new RPC; remove client-side translation; map known error codes to friendly messages.
- `src/components/order/OrderHelpSheet.tsx` — drop the in-component RPC + profiles fallback in `handleSubmit`; pass `sellerId` (the order's `seller_profiles.id`) straight to the mutation; add structured `console.info`/`console.warn` for trajectory.

## Out of scope
- No FK relaxation (constraint stays).
- No changes to `auto_resolution_rules` or `fn_evaluate_support_resolution` (those are working).
- No RLS changes on `profiles`, `seller_profiles`, or `support_tickets` — server-side function eliminates the need to broaden any policy.
- No UI redesign of the help flow.

## Success criteria
- Submitting any of the 6 categories (and each subtype) succeeds: either auto-resolved or ticket created.
- Zero `23503 / support_tickets_seller_id_fkey` errors in Postgres logs.
- New tickets are visible to the seller in `SellerSupportTab` immediately, and the seller receives the notification.
- Friendly client error if a seller is somehow unresolvable; never a raw constraint message.

