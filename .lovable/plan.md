

# Deep QA Audit: Bug Fixes & Silent Failures (Round 5)

## BUG 1: SellerGPSTracker won't render when `delivery_handled_by` is NULL
**Severity: CRITICAL — GPS broadcasting broken for majority of seller-delivery orders**

The database shows real orders with `fulfillment_type = 'delivery'` and `delivery_handled_by = NULL`. In `OrderDetailPage.tsx` line 233:
```typescript
(order as any).delivery_handled_by === 'seller'
```
This is a strict equality check. When `delivery_handled_by` is `NULL` (which is the default), the condition is `false`. The SellerGPSTracker never renders. GPS never broadcasts. The buyer never sees live tracking.

The `resolveTransactionType` handles null correctly (`COALESCE(NEW.delivery_handled_by, 'seller')`), but this UI check does not.

**Fix:** Change the condition on line 233 to:
```typescript
(order as any).delivery_handled_by !== 'platform'
```
This matches the COALESCE pattern used in all DB triggers.

---

## BUG 2: Delivery fee row shows "Self Pickup" for `seller_delivery` fulfillment type
**Severity: MEDIUM — misleading billing display**

`OrderDetailPage.tsx` line 301:
```typescript
o.orderFulfillmentType === 'delivery' ? <span>...</span> : <span>Self Pickup</span>
```
When `fulfillmentType` is `'seller_delivery'`, this falls through to the else branch and displays "Self Pickup" even though the order IS a delivery. Should use the `isDeliveryOrder` variable already defined on line 47.

**Fix:** Replace `o.orderFulfillmentType === 'delivery'` with `isDeliveryOrder` on line 301.

---

## BUG 3: `SellerOrderCard` and `OrdersPage` don't show delivery badge for `seller_delivery` type
**Severity: LOW — cosmetic but confusing**

`SellerOrderCard.tsx` line 80: `order.fulfillment_type === 'delivery'` — misses `seller_delivery`.
`OrdersPage.tsx` line 55: `(order as any).fulfillment_type === 'delivery'` — same.

**Fix:** Both should check `['delivery', 'seller_delivery'].includes(...)`.

---

## BUG 4: `update-delivery-location` stale detection checks wrong statuses
**Severity: MEDIUM — missed stale alerts during active delivery**

Edge function line 282: `['picked_up', 'at_gate'].includes(assignment.status)` — misses `on_the_way`. If the delivery is `on_the_way` and the seller's GPS stalls for 3+ minutes, no stalled notification fires.

**Fix:** Add `'on_the_way'` to the stale detection array on line 282.

---

## BUG 5: `sync_order_to_delivery_assignment` trigger only fires for `delivery_handled_by = 'seller'` strict check
**Severity: HIGH — assignment status never syncs when `delivery_handled_by` is NULL**

The trigger code:
```sql
IF COALESCE(NEW.delivery_handled_by, '') != 'seller' THEN RETURN NEW; END IF;
```
When `delivery_handled_by` is NULL, `COALESCE(NULL, '')` = `''`, which `!= 'seller'`, so the trigger returns early. The assignment status stays at `picked_up` forever for all real orders with NULL `delivery_handled_by`.

**Fix:** Change to: `IF COALESCE(NEW.delivery_handled_by, 'seller') = 'platform' THEN RETURN NEW;` — matches the same COALESCE pattern used everywhere else.

---

## BUG 6: `auto-cancel-orders` auto-complete uses service_role but no `.eq('status', 'delivered')` guard on the status transition
**Severity: MEDIUM — validate_order_status_transition could block**

The auto-complete update uses `service_role` key, which correctly has the `'system'` actor permission for `delivered → completed`. However, the trigger checks:
```sql
IF coalesce(current_setting('app.delivery_sync', true), '') != 'true'
   AND current_setting('role', true) != 'service_role' THEN
   RAISE EXCEPTION ...
```
This only blocks when the actors are ONLY `delivery`/`system`. For `delivered → completed`, actors include `buyer` and `system`, so the check passes. No bug here — verified.

---

## BUG 7: `useDeliveryTracking` realtime subscription uses `delivery_assignments` with REPLICA IDENTITY DEFAULT
**Severity: MEDIUM — realtime updates may miss column values**

`delivery_assignments` has `relreplident = d` (DEFAULT, primary key only). This means realtime UPDATE payloads only include `id` and changed columns. The `useDeliveryTracking` realtime handler reads `d.status`, `d.rider_name`, `d.eta_minutes`, etc. from `payload.new`. With DEFAULT replica identity, unchanged fields will be `undefined`, not their current values.

The code handles this with `d.rider_name ?? prev.riderName` (fallback to previous), so it won't crash. But if the trigger updates ONLY `status` (like `sync_order_to_delivery_assignment` does — it sets `status` and `updated_at`), then `d.eta_minutes` will be `undefined`, and `d.eta_minutes ?? prev.eta` correctly keeps the previous ETA. This is actually fine.

However, `d.status` could be `undefined` if only non-status columns are updated (like `last_location_at`). Line 103: `status: d.status` would set status to `undefined`, overwriting the real status. This should use `d.status ?? prev.status`.

**Fix:** Change line 103 in `useDeliveryTracking.ts` to: `status: d.status ?? prev.status`.

---

## BUG 8: `DeliveryStatusCard` shown when `!isInTransit` but ALSO when assignment doesn't exist yet
**Severity: LOW — confusing empty state**

Line 236: `{isDeliveryOrder && !isInTransit && <DeliveryStatusCard orderId={order.id} isBuyerView={o.isBuyerView} />}`

Before `picked_up` (statuses: placed, accepted, preparing, ready), `isInTransit` is false, so `DeliveryStatusCard` renders. It fetches the assignment, finds none (assignment is created only at `picked_up`), and returns `null` — which is fine. But it's a wasted fetch on every pre-delivery status render.

No fix needed — this is cosmetic only.

---

## Summary

| # | Bug | Severity | Type |
|---|-----|----------|------|
| 1 | GPS tracker skipped when `delivery_handled_by` is NULL | **CRITICAL** | Silent failure |
| 2 | Delivery fee shows "Self Pickup" for seller_delivery | MEDIUM | UI bug |
| 3 | Missing delivery badge on order cards | LOW | UI cosmetic |
| 4 | Stale detection misses `on_the_way` status | MEDIUM | Edge function gap |
| 5 | Assignment status sync trigger exits early on NULL | **HIGH** | Silent failure |
| 6 | (Verified OK — no bug) | — | — |
| 7 | Realtime status could be set to undefined | MEDIUM | Race condition |
| 8 | (No fix needed — cosmetic) | — | — |

## Implementation Plan

### DB Migration (Bugs 5)
- Fix `sync_order_to_delivery_assignment` trigger: change NULL check to match COALESCE pattern

### Edge Function (Bug 4)
- Add `'on_the_way'` to stale detection status array in `update-delivery-location`

### Frontend (Bugs 1, 2, 3, 7)

| File | Change |
|------|--------|
| `OrderDetailPage.tsx` line 233 | `delivery_handled_by !== 'platform'` instead of `=== 'seller'` |
| `OrderDetailPage.tsx` line 301 | Use `isDeliveryOrder` instead of `=== 'delivery'` |
| `SellerOrderCard.tsx` line 80 | Include `seller_delivery` in check |
| `OrdersPage.tsx` line 55 | Include `seller_delivery` in check |
| `useDeliveryTracking.ts` line 103 | `status: d.status ?? prev.status` |

