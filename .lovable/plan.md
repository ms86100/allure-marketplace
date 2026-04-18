

## Fix — Late delivery must NEVER auto-close

### What's broken (verified)
`auto_resolution_rules` row for `late_delivery` has `action.type = 'apology'`. The RPC `fn_evaluate_support_resolution` returns `resolved=true` with the apology text. `OrderHelpSheet` shows a "Resolved automatically" screen with a "Done" button — **no ticket created, no seller pinged, no follow-up path**. The buyer is essentially told "calm down, it's coming" with zero proof and zero recourse. That's the trust break in your screenshot.

For `cancel_request` and `payment_issue` the auto-resolution is legitimate (real DB action: cancel + refund row). For `late_delivery` it's hollow.

### Fix 1 — Remove the hollow "apology" auto-resolution (DB)
Migration:
```sql
-- Late delivery should never silently auto-close. Always create a ticket
-- so the seller is accountable and the buyer has a tracked, visible thread.
DELETE FROM public.auto_resolution_rules WHERE issue_type = 'late_delivery';
```
Result: every late_delivery submission falls through to `fn_create_support_ticket` → real ticket → seller notified → SLA timer (2h) starts → visible in buyer's Support tab.

### Fix 2 — Trust-rebuilding resolution screen (UI)
Rewrite the resolution step in `OrderHelpSheet.tsx` so it never feels dismissive:

**When a ticket was created** (the new late_delivery path, missing/wrong item, other):
- Headline: "We've alerted the seller"
- Body: "Ticket #ABC12345 created. The seller has 2 hours to respond. We'll notify you the moment they do."
- Show: ticket id, SLA countdown ("Response expected by 4:32 PM"), seller name
- Primary CTA: "Open ticket" → routes to `/support/:ticketId` (chat thread)
- Secondary CTA: "Message seller now" → opens order chat
- Tertiary text link: "Done"

**When genuinely auto-resolved with action** (cancel_and_refund, refund):
- Headline: "Done — refund initiated"
- Body: explicit refund amount + ETA ("₹X will be credited to your original payment method in 3-5 business days")
- CTA: "View refund status" → `/orders/:id` (refund section) + "Done"

**Never show the bare "apology" screen again** — the DB change in Fix 1 makes that impossible, but the UI also drops the apology branch entirely as defense in depth.

### Fix 3 — Honest seed message in tickets
Inside `fn_create_support_ticket`, the system message currently says "Support ticket created: late delivery." Change to subtype-aware copy:
- `still_waiting` → "Buyer reports the order is overdue and they're still waiting. ETA was {time}. Please update them."
- `no_update` → "Buyer hasn't received any status update. Please confirm current status."
- generic → "Buyer reports a delay. Please respond within 2 hours."

This sets a concrete expectation for the seller and shows the buyer their words were heard.

### Fix 4 — Buyer gets a real-time follow-up
Already in place: `notification_queue` row enqueued for the seller; ticket appears in buyer's Support tab with SLA badge. No extra work needed once Fix 1 lands — the existing ticket pipeline takes over.

### Fix 5 — Audit trail
The existing `audit_log` row from the RPC now fires for every late_delivery (since they all become tickets). No change needed.

---

### Files

**New migration** — `supabase/migrations/<ts>_fix_late_delivery_no_hollow_resolution.sql`
- `DELETE FROM auto_resolution_rules WHERE issue_type = 'late_delivery';`
- `CREATE OR REPLACE FUNCTION public.fn_create_support_ticket(...)` — subtype-aware system seed message; everything else identical to current.

**Edited** — `src/components/order/OrderHelpSheet.tsx`
- Replace the resolution step (lines ~491-524).
- New `TicketCreatedScreen` block: ticket id, SLA, "Open ticket" + "Message seller" CTAs.
- New `ActionResolvedScreen` block: only for `cancel_and_refund` / `refund` types; shows refund amount + ETA.
- Remove the bare apology branch.

**Unchanged**
- `fn_evaluate_support_resolution` logic, `useSupportTickets` hook, RLS, FKs, trigger.
- `cancel_request` and `payment_issue` auto-resolution rules (they perform real actions and are fine).

---

### Verification matrix
| Scenario | Old behavior | New behavior |
|---|---|---|
| `ready` order + late_delivery + still_waiting | "Resolved automatically — your order is on its way" + Done | Ticket created, seller notified, SLA shown, buyer can open chat |
| `placed` order + cancel_request | Cancelled + refund row + auto-resolved screen | Same, plus refund amount + ETA shown clearly |
| `delivered` order + missing_item | Ticket created | Ticket created with new screen showing SLA + open-ticket CTA |
| `payment_issue` with `payment_status=failed` | Refund row + auto-resolved | Same, refund amount + ETA shown |

### Out of scope
- No changes to RLS, FKs, trigger, or the `support_tickets` schema.
- No changes to seller dashboard (existing SellerSupportTab already surfaces these tickets).
- No changes to refund pipeline.

