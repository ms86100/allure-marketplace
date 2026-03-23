

## Plan: Enforce Fully Workflow-Driven Architecture

### Problem Summary
The system has a well-defined workflow engine in the database (`category_status_flows` + `category_status_transitions`), but multiple layers bypass it with hardcoded logic:

1. **Transaction type resolution** — duplicated hardcoded mapping in both `resolveTransactionType.ts` and `validate_order_status_transition` SQL trigger
2. **Transit/tracking logic** — `isInTransit` reads from `system_settings.transit_statuses` instead of the workflow
3. **Delivery status validation** — `manage-delivery` edge function hardcodes `['picked_up', 'at_gate', 'failed', 'cancelled']`
4. **OTP requirement** — hardcoded `o.nextStatus === 'delivered' && isDeliveryOrder` in the action bar instead of using DB's `requires_otp` flag
5. **Buyer cancel fallback** — hardcoded `order.status === 'placed'` bypass in buyer action bar
6. **Seller platform-delivery check** — hardcoded `actor === 'system'` check instead of using transitions
7. **OTP verification RPC** — hardcodes `NOT IN ('picked_up', 'on_the_way', 'arrived', 'at_gate')` instead of querying flow

### Architecture Change: Store `transaction_type` on the Order

The root cause of duplicated resolution logic is that orders don't store their resolved workflow key. Every consumer re-derives it from `order_type` + `fulfillment_type` + `delivery_handled_by` using hardcoded rules.

**Fix**: Add a `transaction_type` column to the `orders` table. Set it at order creation time (in `create_multi_vendor_orders` and `book_service_slot`). Then all downstream consumers just read `order.transaction_type` — no resolution logic needed anywhere.

### Implementation Steps

**Step 1: DB Migration — Add `transaction_type` to orders + `is_transit` to flows**

```sql
-- A. Add transaction_type column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS transaction_type text;

-- B. Add is_transit flag to category_status_flows (drives tracking/map visibility)
ALTER TABLE public.category_status_flows ADD COLUMN IF NOT EXISTS is_transit boolean NOT NULL DEFAULT false;

-- C. Seed is_transit for existing delivery/transit steps
UPDATE category_status_flows SET is_transit = true 
WHERE status_key IN ('picked_up', 'on_the_way', 'at_gate') 
  AND transaction_type IN ('cart_purchase', 'seller_delivery');

-- D. Backfill transaction_type on existing orders using the same resolution logic (one-time)
-- (SQL UPDATE with CASE logic matching current resolveTransactionType)
```

**Step 2: DB Migration — Update `create_multi_vendor_orders` to set `transaction_type`**

The RPC will resolve and store the workflow key at order creation time, reading from `category_config.transaction_type` + fulfillment variant logic. This becomes the single place where resolution happens.

**Step 3: DB Migration — Update `book_service_slot` to set `transaction_type`**

Set `transaction_type = 'service_booking'` on the order at creation.

**Step 4: DB Migration — Simplify `validate_order_status_transition` trigger**

Replace the hardcoded resolution block (lines 39-47) with a direct read of `NEW.transaction_type`. The trigger becomes:
```sql
_txn_type := COALESCE(NEW.transaction_type, 'self_fulfillment');
```
No more duplicated mapping logic.

**Step 5: DB Migration — Update `verify_delivery_otp_and_complete` RPC**

Replace hardcoded status check `NOT IN ('picked_up', 'on_the_way', 'arrived', 'at_gate')` with a DB query against `category_status_flows` checking `is_transit = true` for the order's `transaction_type`.

**Step 6: Simplify `resolveTransactionType.ts`**

When `order.transaction_type` is available (new orders), use it directly. Keep fulfillment-variant resolution only as a legacy fallback for orders created before the migration.

**Step 7: Refactor `useOrderDetail.ts` — `isInTransit`**

Replace:
```ts
// OLD: hardcoded transit_statuses from system_settings
const transitStatuses = getTrackingConfigSync().transit_statuses;
if (transitStatuses.includes(order.status)) return true;
const transitStep = flow.find(...)?.actor === 'delivery';
```
With:
```ts
// NEW: DB-driven via is_transit flag on flow step
const step = flow.find(s => s.status_key === order.status);
return step?.is_transit === true;
```

**Step 8: Refactor `OrderDetailPage.tsx` — Remove hardcoded overrides**

| Line | Current Hardcode | Fix |
|---|---|---|
| 597 | `actor === 'system' && delivery_handled_by === 'platform'` | Use `getNextStatusForActor` — if no seller transition exists, show "Awaiting" message naturally |
| 602 | `o.nextStatus === 'delivered' && isDeliveryOrder` | Already uses `stepRequiresOtp()` — remove the `||` hardcode, rely solely on DB `requires_otp` flag |
| 630 | `order.status === 'placed'` cancel fallback | Remove — `canBuyerCancel` from transitions is the source of truth |

**Step 9: Update `manage-delivery` edge function**

Replace hardcoded `validStatuses` array with a DB query:
```ts
const { data: validTransitions } = await db
  .from('category_status_transitions')
  .select('to_status')
  .eq('transaction_type', order.transaction_type)
  .eq('allowed_actor', 'delivery');
```

**Step 10: Update `useCategoryStatusFlow` hook**

Add `is_transit` to the select query so the flow steps include the transit flag for frontend consumption.

### Files Modified

| File | Change |
|---|---|
| DB migration | Add `transaction_type` to orders, `is_transit` to flows, backfill data |
| DB migration | Update `create_multi_vendor_orders` to set `transaction_type` |
| DB migration | Update `book_service_slot` to set `transaction_type` |
| DB migration | Simplify `validate_order_status_transition` trigger |
| DB migration | Update `verify_delivery_otp_and_complete` RPC |
| `src/lib/resolveTransactionType.ts` | Simplify — prefer `order.transaction_type` when available |
| `src/hooks/useOrderDetail.ts` | `isInTransit` uses `is_transit` from flow; read `transaction_type` from order |
| `src/hooks/useCategoryStatusFlow.ts` | Add `is_transit` to select + interface |
| `src/pages/OrderDetailPage.tsx` | Remove 3 hardcoded overrides (OTP, cancel fallback, platform delivery) |
| `supabase/functions/manage-delivery/index.ts` | Validate statuses against DB transitions |

### What This Achieves

- **Single source of truth**: `transaction_type` stored on the order at creation, flows/transitions in DB
- **Zero hardcoded resolution**: No duplicated mapping logic in frontend or triggers
- **Transit behavior**: Driven by `is_transit` flag on workflow steps, not system_settings
- **OTP requirement**: Driven by `requires_otp` flag on workflow steps, not hardcoded status checks
- **Actor enforcement**: Driven by `category_status_transitions.allowed_actor`, not hardcoded checks
- **Edge function validation**: Queries DB transitions, not hardcoded arrays

