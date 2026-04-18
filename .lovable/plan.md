

## Final Bulletproof Fix — Support Ticket Creation

### Root cause (confirmed)
Trigger `fn_validate_support_ticket_seller` runs in **buyer's RLS context**. It cannot read `profiles` rows for `pending` sellers nor `seller_profiles` rows it doesn't own → falsely raises `seller_not_resolvable` even when data is valid.

Plus: `OrderHelpSheet` shows all categories regardless of order lifecycle, surfacing flows that don't apply pre-delivery.

---

### Fix 1 — Make trigger RLS-immune (the actual fix)
Migration:
```sql
ALTER FUNCTION public.fn_validate_support_ticket_seller() SECURITY DEFINER;
```
Trigger's existing logic already auto-translates `seller_profiles.id → profiles.id`. Once it runs as DEFINER, lookups on `profiles` and `seller_profiles` always succeed → no false `seller_not_resolvable`.

### Fix 2 — Harden RPC `fn_create_support_ticket`
Inside the existing RPC, before insert, add explicit guard:
```sql
IF v_seller_user_id IS NULL THEN
  RAISE EXCEPTION 'seller_resolution_failed: order % has no resolvable seller', p_order_id
    USING ERRCODE = 'P0001';
END IF;
```
Already mostly present; this confirms the message is uniform.

### Fix 3 — Single-path enforcement
Migration:
```sql
REVOKE INSERT ON public.support_tickets FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_support_ticket(uuid, text, text, text, text[]) TO authenticated;
```
Buyers can no longer insert directly; they must go through the validated RPC. Sellers/admins keep their UPDATE rights via existing RLS (no change to UPDATE/SELECT).

> Note: `support_ticket_messages` insert path used by chat replies is unaffected — only `support_tickets` INSERT is locked.

### Fix 4 — Status-aware category filtering (`OrderHelpSheet.tsx`)
Add lifecycle constants and a `availableCategories` memo:
```text
PRE_DELIVERY  = placed, confirmed, preparing, ready, out_for_delivery
POST_DELIVERY = delivered, completed
CANCELLABLE   = placed, confirmed, preparing
```

| Category | Visible when |
|---|---|
| late_delivery | PRE_DELIVERY |
| missing_item | POST_DELIVERY |
| wrong_item | POST_DELIVERY |
| cancel_request | CANCELLABLE |
| payment_issue | always (except refunded) |
| other | always |

If only `other` survives, show hint: "For status questions, chat is faster."

### Fix 5 — Audit logging (already in RPC)
Confirmed present: `audit_log` rows on success and failure with `order_id`, `issue_type`, resolved seller id, and reason. No change needed.

### Fix 6 — Stale client backward compat
Already covered by trigger's auto-translate branch. Once Fix 1 lands, stale bundles inserting `seller_profiles.id` directly will fail with a clear "insert not permitted" message (Fix 3) instead of silently writing bad data — and they'll be forced through the RPC on next refresh.

---

### Files

**New migration** — `supabase/migrations/<ts>_harden_support_ticket_pipeline.sql`
- `ALTER FUNCTION fn_validate_support_ticket_seller() SECURITY DEFINER;`
- Add `seller_resolution_failed` guard inside `fn_create_support_ticket` (CREATE OR REPLACE).
- `REVOKE INSERT ON support_tickets FROM authenticated;`
- `GRANT EXECUTE ON FUNCTION fn_create_support_ticket TO authenticated;`

**Edited** — `src/components/order/OrderHelpSheet.tsx`
- Add lifecycle constants + `availableCategories` memo.
- Render filtered list; empty-state hint when only `other` remains.
- Friendly mapping for `seller_resolution_failed` → "We couldn't reach this seller. Please use chat."

**Unchanged**
- `src/hooks/useSupportTickets.ts` — already RPC-only.
- No FK/RLS relaxation. No changes to `fn_evaluate_support_resolution`.

---

### Verification matrix
| Order status | Category | Expected |
|---|---|---|
| ready | late_delivery → still_waiting | Auto-resolve OR ticket — no error |
| ready | missing_item | Hidden |
| delivered | missing_item + subtype | Ticket created |
| delivered | cancel_request | Hidden |
| placed | cancel_request | Auto-cancel + refund row |
| any | other | Ticket created |

DB-level: zero `23503` errors, zero `seller_not_resolvable` for valid orders, audit_log row per submit.

### Out of scope
- No FK relaxation, no RLS broadening on profiles/seller_profiles.
- No UI redesign beyond category filtering.
- No changes to chat / refund flows.

