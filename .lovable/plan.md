

The user wants me to execute the bulletproof plan I previously presented. Since I'm in plan mode, I need to present the concise actionable plan for approval, then it gets implemented.

Let me verify a few critical things via read-only tools before finalizing.
<lov-tool-use id="toolu_vrtx_018Bx5WsAXaZHUo8eZyuAoW6" name="code--exec" integration-id="code" data="{\"command\": \"echo \\\"checking actual data model\\\"\", \"user_facing_description\": \"Checking data model\"}">
</lov-tool-use>
I'm in plan mode (read-only). Let me verify the critical assumption — the actual seller_id domain in support_tickets — before finalizing the plan.
<lov-tool-use id="toolu_vrtx_01F3s7udG76AcqC941yWswpT" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT t.id, t.seller_id, o.seller_id AS order_seller_id, sp.id AS seller_profile_id, sp.user_id AS seller_user_id, (t.seller_id = sp.user_id) AS matches_user_id, (t.seller_id = sp.id) AS matches_profile_id FROM support_tickets t JOIN orders o ON o.id = t.order_id JOIN seller_profiles sp ON sp.id = o.seller_id ORDER BY t.created_at DESC LIMIT 5;\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_016GV2Wzq2126JzakFUCywY5" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_create_support_ticket';\"}">
</lov-tool-use>
Confirmed: `support_tickets.seller_id` = `profiles.id` (seller user_id), not seller_profiles.id. Hooks query with seller_profiles.id → mismatch.
<lov-tool-use id="toolu_vrtx_01HTmE2zK4yPhDhFkNuTH9bE" name="code--search_files" integration-id="code" data="{\"query\": \"useSellerSupportItems|useSellerTickets|sellerProfile\\\\.id|currentSellerId\", \"include_patterns\": \"src/pages/SellerDashboardPage.tsx,src/components/seller/**,src/hooks/useSupportTickets.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_016HCPweDq7H7w7BuQDwaoUG" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/order/OrderHelpSheet.tsx\", \"lines\": \"1,60,400-560\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01VTpYg2B1yBtAqrTTxfKooJ" name="code--search_files" integration-id="code" data="{\"query\": \"useSellerSupportItems\\\\(|useSellerTickets\\\\(\", \"include_patterns\": \"src/**/*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01NyTVjijVGHa6zdXRyt6nkx" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/SellerDashboardPage.tsx\", \"lines\": \"1,90\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01FRQpbjGYYHUoVEHgJwvRTJ" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/SellerDashboardPage.tsx\", \"lines\": \"30-180\"}">
</lov-tool-use>
I have enough. Let me check where SellerSupportTab is rendered to confirm what id is passed.
<lov-tool-use id="toolu_vrtx_01JZ9cev9Ykeje1WQUdTdy7v" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"src/pages/SellerDashboardPage.tsx\", \"query\": \"SellerSupportTab\"}">
</lov-tool-use>
Confirmed mismatch. I have all the info needed.

<lov-plan>

## Bulletproof support pipeline — end-to-end fix

### Verified root causes (from live DB + source)

1. **ID domain mismatch (P0 visibility bug)**
   - `support_tickets.seller_id` stores **profiles.id (seller user_id)** — confirmed via live query: `matches_user_id=true, matches_profile_id=false`.
   - `SellerDashboardPage` passes `sellerProfile.id` (= `seller_profiles.id`) into `useSellerTickets` and `<SellerSupportTab sellerId={sellerProfile.id} />`.
   - Both hooks filter `support_tickets.seller_id = <seller_profiles.id>` → never matches → tab shows zero.

2. **Notification payload not seller-aware**
   - `fn_create_support_ticket` enqueues with `reference_path = '/support/<id>'` (no such route) and payload missing `target_role`, `status`, `action`.
   - `process-notification-queue` and the in-app banner branch on these fields → support tickets are not treated as seller-priority alerts.

3. **Hardcoded "2 hours" in DB seed messages and buyer UI**
   - `fn_create_support_ticket` hardcodes "within 2 hours" in five branches.
   - `OrderHelpSheet.tsx` line 521 hardcodes "has 2 hours to respond".
   - `sla_deadline` exists on the row — should be the only source of truth.

4. **No realtime / invalidation on the seller side**
   - Seller dashboard never re-queries `support-items` when a ticket is inserted.

### Fix plan

**Migration — `supabase/migrations/<ts>_support_pipeline_hardening.sql`**

Replace `fn_create_support_ticket` with a version that:
- Keeps existing seller resolution (already correct: stores `profiles.id`).
- Drops every "within 2 hours" string. Seed message becomes neutral, e.g. `'Buyer reports a delay. Please review and respond.'` Buyer note appended as today.
- Notification enqueue:
  ```
  reference_path := '/orders/' || p_order_id || '?ticket=' || v_ticket.id
  payload := jsonb_build_object(
    'target_role','seller',
    'status','seller_pending',
    'action','View Ticket',
    'ticket_id', v_ticket.id,
    'order_id', p_order_id,
    'issue_type', p_issue_type,
    'sla_deadline', v_sla_deadline,
    'priority','high'
  )
  ```
- Hardens orphan prevention: re-raises `seller_resolution_failed` (already present) and additionally inserts the `audit_log` failure row before raising (already present).

**`src/hooks/useSupportTickets.ts`**
- Rename param semantics: `useSellerTickets(sellerUserId: string)` and `useSellerSupportItems({ sellerUserId, sellerProfileId })`.
- Tickets query: `.eq('seller_id', sellerUserId)` (unchanged column, correct id domain now).
- Refunds query: keep `orders.seller_id = sellerProfileId`.
- In `useCreateTicket.onSuccess`: invalidate `['support-tickets']` and `['support-items']` (already partial; ensure both keys).
- Add a module-level realtime subscription helper `useSellerSupportRealtime(sellerUserId)` that listens to `INSERT` on `support_tickets` filtered by `seller_id=eq.<sellerUserId>` and invalidates seller support queries + bumps unread.

**`src/pages/SellerDashboardPage.tsx`**
- Compute `activeSellerUserId = sellerProfile?.user_id ?? user?.id` once `sellerProfile` is loaded.
- `useSellerTickets(activeSellerUserId)` for the badge.
- `<SellerSupportTab sellerUserId={activeSellerUserId} sellerProfileId={sellerProfile.id} />`.
- Mount `useSellerSupportRealtime(activeSellerUserId)`.

**`src/components/seller/SellerSupportTab.tsx`**
- Accept `{ sellerUserId, sellerProfileId }`.
- Call `useSellerSupportItems({ sellerUserId, sellerProfileId })`.

**`src/components/order/OrderHelpSheet.tsx`** (resolution step ~lines 491-560)
- Drop "has 2 hours to respond". New copy:
  - Headline: "We've alerted the seller"
  - Body: `${sellerName ?? 'The seller'} has been notified. We'll let you know as soon as they respond.`
- "Response expected by" row keeps using `ticket.sla_deadline` (already correct). If `sla_deadline` is null, hide the row instead of inventing a time.
- Keep ticket id row, keep CTAs.

**`src/lib/notification-routes.ts`**
- Add case `'support_ticket'` → if `payload.order_id`: `/orders/<orderId>?ticket=<ticket_id>`, else `/seller?supportTicket=<ticket_id>`.

**`src/components/support/SupportTicketDetail.tsx`** (small)
- Replace any "2 hours" copy with `sla_deadline`-derived text or a neutral "Pending seller response" badge.

### Files touched
- `supabase/migrations/<ts>_support_pipeline_hardening.sql` (new)
- `src/hooks/useSupportTickets.ts`
- `src/pages/SellerDashboardPage.tsx`
- `src/components/seller/SellerSupportTab.tsx`
- `src/components/order/OrderHelpSheet.tsx`
- `src/lib/notification-routes.ts`
- `src/components/support/SupportTicketDetail.tsx` (only if hardcoded SLA copy exists there)

### Verification matrix

| Check | Expected |
|---|---|
| Existing ticket `4ce81ee2…` for seller user `6b7d338f…` | Appears in seller Support tab immediately after deploy |
| Buyer creates new late_delivery ticket | Resolution screen shows ticket id + `sla_deadline` time, no "2 hours" string |
| `notification_queue` row | `payload.target_role='seller'`, `reference_path='/orders/<id>?ticket=<tid>'` |
| Click bell on seller side | Lands on `/orders/<id>?ticket=<tid>` (valid route) |
| Insert into `support_tickets` | Realtime invalidates seller support queries within ~1s |
| Order with no resolvable seller | RPC raises `seller_resolution_failed`, audit row written, no orphan ticket |

### Out of scope
- No FK/RLS changes.
- No refund pipeline changes.
- No edge function code changes (payload upgrade is purely DB-side; existing `process-notification-queue` already reads `payload.target_role`/`status`).

