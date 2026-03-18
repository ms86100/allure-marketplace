

# Deep Gap Analysis: Production Readiness (Round 4)

## SHOWSTOPPER: `isInTransit` is always false for seller-delivery orders

### GAP 1: `isInTransit` checks `actor === 'delivery'` but seller_delivery flow uses `actor = 'seller'`
**Severity: CRITICAL — blocks ALL tracking UI for seller-delivery orders**

**Issue:** `useOrderDetail.ts` line 215:
```typescript
return step?.actor === 'delivery' && !step?.is_terminal;
```
In the `seller_delivery` flow (migration `20260318112122`), `picked_up`, `on_the_way`, and `delivered` all have `actor = 'seller'`, NOT `'delivery'`. This means `isInTransit` is **always false** for seller-delivery orders.

**Cascade:**
1. `OrderDetailPage.tsx` line 214: `isInTransit && deliveryAssignmentId` → false → **buyer never sees the map or LiveDeliveryTracker**
2. `OrderDetailPage.tsx` line 235: `!isInTransit` → always true → static `DeliveryStatusCard` renders instead of live tracking, even during active delivery
3. The `SellerGPSTracker` (line 232) is NOT affected — it uses a hardcoded status check `['picked_up', 'on_the_way']`. So GPS broadcasting works, but the buyer can't see it.

**Root cause:** The `isInTransit` derivation was designed for `cart_purchase` flow where delivery steps have `actor = 'delivery'`. It was never updated when `seller_delivery` was introduced.

**Fix:** Change `isInTransit` to check status-key membership instead of actor:
```typescript
const isInTransit = useMemo(() => {
  if (!order) return false;
  return ['picked_up', 'on_the_way', 'at_gate'].includes(order.status);
}, [order?.status]);
```
Or better — add a `is_transit` boolean column to `category_status_flows` and check that. But for now, status-key check is sufficient and matches every other in-transit check in the codebase (`LiveDeliveryTracker` line 51, `DeliveryArrivalOverlay` line 27, `update-delivery-location` line 357).

---

### GAP 2: `useBuyerOrderAlerts` missing `on_the_way` status toast
**Severity: HIGH**

**Issue:** `useBuyerOrderAlerts.ts` line 14-24 — the `STATUS_MESSAGES` map has no entry for `on_the_way`. When the seller marks the order as "on the way", the buyer gets NO in-app toast notification. They do get a push notification (from the trigger), but if the app is in the foreground, the toast is the primary feedback channel.

**Fix:** Add `on_the_way` to STATUS_MESSAGES:
```typescript
on_the_way: { icon: '🛵', title: 'On The Way!', description: 'Your order is on the way to you.', haptic: 'success' },
```

---

### GAP 3: `delivery_assignments.status` never updated during seller delivery flow
**Severity: HIGH**

**Issue:** The `trg_create_seller_delivery_assignment` trigger creates the assignment with `status = 'picked_up'`. But as the order progresses through `on_the_way` → `delivered`, the `delivery_assignments.status` is never synced. The `LiveDeliveryTracker` component reads `tracking.status` from `delivery_assignments` and shows status-specific messages based on it. If the assignment stays at `picked_up` forever, the buyer sees "Your order has been picked up!" even when the seller is delivering.

**Root cause:** For `cart_purchase`, there's a `sync_delivery_to_order_status` trigger that syncs order status to assignment status. But it may not fire for `seller_delivery` orders, or it may only handle specific transitions.

**Fix:** Ensure a trigger (or extend the existing one) syncs `delivery_assignments.status` when the order transitions to `on_the_way` and `delivered`.

---

### GAP 4: Seller action bar shows "Mark Picked Up" when at `ready` but no delivery address context
**Severity: MEDIUM**

**Issue:** When a seller taps "Mark Picked Up" at `ready` status, they're committing to personally deliver. But the UI doesn't show them the buyer's delivery address before they confirm. On Blinkit/Swiggy, the seller sees the destination before accepting the delivery leg.

**Fix:** Show a confirmation sheet when transitioning from `ready` → `picked_up` for seller self-delivery orders. Include buyer's address (block, flat), estimated distance, and estimated delivery time.

---

### GAP 5: No seller notification when buyer confirms delivery
**Severity: MEDIUM**

**Issue:** When the buyer taps "Yes, I received my order" (`BuyerDeliveryConfirmation`), it updates the order to `completed`. The `fn_enqueue_order_status_notification` trigger sends a notification to the buyer (line 250: `INSERT INTO notification_queue (user_id...` uses `NEW.buyer_id`). But no notification goes to the seller about the completion.

Looking at line 250: the trigger only inserts for `buyer_id`. There's no seller notification path for `completed` status in this trigger.

**Fix:** Add a seller notification insert in the trigger for `completed` status, or handle it client-side in `BuyerDeliveryConfirmation` by invoking `process-notification-queue`.

---

### GAP 6: `DeliveryETABanner` and Live Activity show different ETA sources
**Severity: MEDIUM**

**Issue:** `DeliveryETABanner` uses `estimated_delivery_at` (set once at acceptance, static). `LiveDeliveryTracker` uses `delivery_assignments.eta_minutes` (updated with each GPS ping, dynamic). The buyer sees two different time estimates simultaneously — the banner might say "12 min" while the tracker says "ETA: 5 min".

**Fix:** When `deliveryAssignmentId` exists and `deliveryTracking.eta` is available (GPS-derived), hide the `DeliveryETABanner` or update it to use the dynamic ETA instead.

---

### GAP 7: `SellerGPSTracker` renders for `fulfillmentType === 'delivery'` but `FulfillmentSelector` sets `seller_delivery`
**Severity: MEDIUM**

**Issue:** `OrderDetailPage.tsx` line 232 checks `o.orderFulfillmentType === 'delivery'`. But looking at `useOrderDetail.ts` line 74: `const orderFulfillmentType = (order as any)?.fulfillment_type || 'self_pickup'`. The actual `fulfillment_type` stored on the order depends on the `create_multi_vendor_orders` function. For sellers with `fulfillment_mode = 'seller_delivery'`, the order's `fulfillment_type` might be `'delivery'` or `'seller_delivery'` depending on the code path.

If it's stored as `'seller_delivery'`, the condition `o.orderFulfillmentType === 'delivery'` fails, and SellerGPSTracker never renders. Same for all delivery UI checks throughout OrderDetailPage.

**Fix:** All `fulfillmentType === 'delivery'` checks should also include `'seller_delivery'`:
```typescript
const isDeliveryOrder = ['delivery', 'seller_delivery'].includes(o.orderFulfillmentType);
```

---

## Summary

| # | Gap | Severity | Root Cause |
|---|-----|----------|------------|
| 1 | `isInTransit` always false for seller delivery | **CRITICAL** | Checks `actor === 'delivery'`, but seller_delivery uses `actor = 'seller'` |
| 2 | Missing `on_the_way` buyer toast | HIGH | Omitted from STATUS_MESSAGES map |
| 3 | `delivery_assignments.status` never syncs | HIGH | No trigger syncs order status → assignment status for seller delivery |
| 4 | No delivery address shown before pickup | MEDIUM | Missing confirmation UI |
| 5 | No seller notification on buyer confirm | MEDIUM | Trigger only notifies buyer_id |
| 6 | Dual conflicting ETA sources | MEDIUM | Static vs dynamic ETA shown simultaneously |
| 7 | `fulfillmentType` check may miss `seller_delivery` | MEDIUM | Hardcoded `=== 'delivery'` checks |

## Implementation Plan

### Step 1: Fix `isInTransit` (Gap 1) — CRITICAL
- **File:** `src/hooks/useOrderDetail.ts` line 211-216
- Change to status-key based check: `['picked_up', 'on_the_way', 'at_gate'].includes(order.status)`

### Step 2: Normalize delivery type checks (Gap 7)
- **File:** `src/pages/OrderDetailPage.tsx`
- Extract `const isDeliveryOrder = ['delivery', 'seller_delivery'].includes(o.orderFulfillmentType)`
- Replace all `o.orderFulfillmentType === 'delivery'` with `isDeliveryOrder`

### Step 3: Add missing buyer toast (Gap 2)
- **File:** `src/hooks/useBuyerOrderAlerts.ts`
- Add `on_the_way` to `STATUS_MESSAGES`

### Step 4: Sync assignment status (Gap 3)
- **Database migration:** Create trigger to update `delivery_assignments.status` when order status changes to `on_the_way` or `delivered`

### Step 5: Fix dual ETA (Gap 6)
- **File:** `src/pages/OrderDetailPage.tsx`
- Hide `DeliveryETABanner` when `deliveryTracking.eta` is available (GPS-derived ETA takes precedence)

### Step 6: Seller notification on completion (Gap 5)
- **Database migration:** Extend `fn_enqueue_order_status_notification` to also notify seller on `completed` status

### Step 7: Pickup confirmation sheet (Gap 4) — deferred
- Requires new UI component and product design decision

