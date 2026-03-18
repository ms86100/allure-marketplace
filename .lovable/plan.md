

# Deep Gap Analysis: Production Readiness (Round 3)

## SHOWSTOPPER: Status Flow Architecture Mismatch

### GAP A: Seller self-delivery orders use `self_fulfillment` flow — which has NO delivery statuses
**Severity: CRITICAL — blocks ALL delivery tracking features**

**Issue:** In `useOrderDetail.ts` (lines 25-27), any order with `delivery_handled_by = 'seller'` is mapped to transaction type `self_fulfillment`. The database confirms this flow has only 5 statuses:

```text
placed → accepted → preparing → ready → completed
```

There is NO `picked_up`, `on_the_way`, or `delivered` status. Meanwhile, the `cart_purchase` flow has:

```text
placed → accepted → preparing → ready → picked_up → on_the_way → delivered → completed
```

**Cascade of failures caused by this single gap:**

1. **Seller can never reach `picked_up`** — the `validate_order_status_transition` trigger will raise `Invalid status transition from "ready" to "picked_up"` because that transition doesn't exist for `self_fulfillment`
2. **`trg_create_seller_delivery_assignment` never fires** — it triggers on `picked_up`, which is unreachable
3. **`deliveryAssignmentId` is always null** — so `SellerGPSTracker`, `LiveDeliveryTracker`, `DeliveryMapView` never render
4. **`BuyerDeliveryConfirmation` never shows** — it checks `status === 'delivered'`, which doesn't exist in the flow
5. **`isInTransit` is always false** — derived from flow step where `actor === 'delivery'`, but no delivery actor steps exist
6. **Live Activity shows no delivery enrichment** — orchestrator fetches `delivery_assignments` which never exists

**Root cause:** The `resolveTransactionType` function treats seller-handled delivery the same as self-pickup. It should use a flow that includes delivery steps.

**Fix:** Create a new transaction type `seller_delivery` (or extend `self_fulfillment`) with the status flow:
```text
placed → accepted → preparing → ready → picked_up → on_the_way → delivered → completed
```
Where `picked_up`, `on_the_way`, `delivered` have `allowed_actor = 'seller'` (not `delivery`). Update `useOrderDetail.ts` and the DB trigger to use this new type.

---

### GAP B: `BuyerDeliveryConfirmation` bypasses status transition validation
**Severity: HIGH**

**Issue:** `BuyerDeliveryConfirmation.tsx` (line 21-25) updates the order status directly via:
```typescript
supabase.from('orders').update({ status: 'completed' }).eq('id', orderId).eq('status', 'delivered')
```

This runs as the authenticated user (anon key), hitting RLS + the `validate_order_status_transition` trigger. The transition `delivered → completed` in `cart_purchase` allows `buyer` and `system` actors — so it should work for `cart_purchase`. But for `self_fulfillment`, `delivered` doesn't exist, so this will always fail.

Even if the flow is fixed (Gap A), the transition validation checks `allowed_actor`. The buyer's update runs as the buyer's auth context, and the trigger checks if `buyer` is in the allowed actors — which it is for `delivered → completed`. So this should work once Gap A is fixed.

**However**, there's no error feedback if the update silently fails (e.g., if the order was already completed by another process). The component shows a success toast even if 0 rows were updated.

**Fix:** Check `data` from the update response to verify a row was actually modified.

---

### GAP C: GPS tracking never stops on delivery completion
**Severity: HIGH**

**Issue:** `SellerGPSTracker` auto-starts and only stops when:
1. The seller manually taps "Stop Sharing"
2. The component unmounts (cleanup in `useBackgroundLocationTracking`)

When the seller marks the order as `delivered` (or `completed`), `SellerGPSTracker` is conditionally rendered only for `['picked_up', 'on_the_way']` statuses. So it unmounts, which triggers `stopTracking()`. This works correctly IF the status change causes a re-render.

**But:** If the seller navigates away from the order page before marking it delivered, the component unmounts and stops GPS. Then when they come back and mark delivered, there's no GPS running — this is fine. However, on native platforms with background location, the Capacitor `watchPosition` continues even when the WebView component unmounts IF the app is backgrounded before unmount. The `stopTracking` cleanup runs on unmount, but if the JS context is suspended (app backgrounded), the cleanup may not execute.

**Fix:** Add explicit GPS cleanup in the `update-delivery-location` edge function when assignment status changes to `delivered`/`completed`. Or add a check in `useBackgroundLocationTracking` to verify the assignment is still active before sending.

---

### GAP D: No timeout on `BuyerDeliveryConfirmation` — order stays in `delivered` forever
**Severity: HIGH**

**Issue:** When the seller marks the order `delivered`, the buyer must manually tap "Yes, I received my order" to move it to `completed`. If the buyer never opens the app, never taps the button, or dismisses the notification, the order stays in `delivered` indefinitely. There is no auto-completion timer.

Blinkit/Swiggy auto-complete orders ~30 minutes after delivery if the buyer doesn't dispute.

**Fix:** Add an `auto_complete_at` timestamp set when the order reaches `delivered`. Create a scheduled function (or extend `auto-cancel-orders`) to auto-complete orders past this timestamp.

---

### GAP E: `DeliveryETABanner` disappears when ETA is passed but order isn't delivered
**Severity: MEDIUM**

**Issue:** `DeliveryETABanner` (line 19) returns `null` when `diffMs < 0` (ETA has passed). If the delivery is delayed beyond the estimated time, the buyer sees NO ETA banner — just a blank space. This is worse than showing "Arriving soon (delayed)".

**Fix:** When `diffMs < 0`, show "Running late — arriving soon" instead of hiding the banner.

---

### GAP F: `DeliveryMapView` doesn't show route line between rider and destination
**Severity: MEDIUM**

**Issue:** The map shows two markers (rider and destination) but no connecting line or route. Blinkit/Swiggy show a route path. Without it, the map looks bare and doesn't convey the remaining journey.

**Fix:** Add a `Polyline` between rider and destination coordinates using react-leaflet's `Polyline` component.

---

### GAP G: Seller status button shows wrong label for delivery steps
**Severity: MEDIUM (but HIGH after Gap A is fixed)**

**Issue:** The seller action bar (line 317) shows `Mark ${o.getOrderStatus(o.nextStatus).label}`. For delivery steps, the `getNextStatusForActor` function in `useCategoryStatusFlow` returns the next valid transition for `seller`. After Gap A is fixed, the seller would see "Mark Picked Up", "Mark On the Way", "Mark Delivered". The labels come from `getFlowStepLabel` which reads `display_label` from `category_status_flows`. These must be seller-friendly (e.g., "I've picked up the order" rather than "Picked Up").

**Fix:** Ensure `display_label` values in the new `seller_delivery` flow steps are seller-action-oriented. Optionally add `seller_hint` per step.

---

## Summary

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| A | **Self_fulfillment flow has no delivery statuses** — entire tracking pipeline is dead | **CRITICAL** | New finding |
| B | BuyerDeliveryConfirmation no-op check | HIGH | Needs fix |
| C | GPS tracking may not stop on background app | HIGH | Edge case |
| D | No auto-complete timeout after delivery | HIGH | Missing feature |
| E | ETA banner disappears when late | MEDIUM | UX bug |
| F | Map has no route line | MEDIUM | Polish |
| G | Seller action labels for delivery steps | MEDIUM | After Gap A |

## Implementation Plan

### Step 1: Fix the status flow (Gap A) — CRITICAL
1. **Database migration**: Create `seller_delivery` transaction type entries in both `category_status_flows` and `category_status_transitions`:
   - Flow: `placed(10) → accepted(20) → preparing(30) → ready(40) → picked_up(50) → on_the_way(60) → delivered(70) → completed(80) → cancelled(90)`
   - Transitions: same as `cart_purchase` but `picked_up`, `on_the_way`, `delivered` have `allowed_actor = 'seller'` instead of `delivery`
   - `delivered → completed` keeps `buyer` and `system` as actors

2. **Update `useOrderDetail.ts`** line 25: Change the mapping so `delivery_handled_by = 'seller'` returns `'seller_delivery'` instead of `'self_fulfillment'`

3. **Update `validate_order_status_transition` trigger** line 36: Map `delivery_handled_by = 'seller'` to `seller_delivery` instead of `self_fulfillment`

4. **Update `fn_enqueue_order_status_notification` trigger** line 119: Same mapping change

### Step 2: Auto-complete timeout (Gap D)
- Add `auto_complete_at` column to orders
- Set it to `now() + 30 minutes` when order transitions to `delivered`
- Extend `auto-cancel-orders` edge function to also auto-complete delivered orders past timeout

### Step 3: UI fixes (Gaps B, E, F)
- `BuyerDeliveryConfirmation`: Check if update actually modified a row
- `DeliveryETABanner`: Show "Running late" text instead of hiding when ETA passed
- `DeliveryMapView`: Add `Polyline` between rider and destination

### Files to modify
| File | Change |
|------|--------|
| New migration | `seller_delivery` flow + transitions + auto_complete_at column |
| `src/hooks/useOrderDetail.ts` | Map seller delivery to `seller_delivery` txn type |
| `src/components/order/BuyerDeliveryConfirmation.tsx` | Row count check |
| `src/components/order/DeliveryETABanner.tsx` | Late ETA fallback |
| `src/components/delivery/DeliveryMapView.tsx` | Route polyline |
| `supabase/functions/auto-cancel-orders/index.ts` | Auto-complete logic |

