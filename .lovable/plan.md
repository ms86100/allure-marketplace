

# Fix: Workflow-Driven Transit Map & Tracking

## Root Cause (3 hardcoded gates)

| Gate | Location | Hardcoded Value | Should Be |
|------|----------|-----------------|-----------|
| Assignment creation trigger | `trg_create_seller_delivery_assignment` | Fires only on `status = 'picked_up'` | First `is_transit = true` step in workflow |
| Map rendering | `OrderDetailPage.tsx:438` | `isInTransit && deliveryAssignmentId` | `isInTransit` (with fallback to seller coords) |
| SellerGPSTracker rendering | `OrderDetailPage.tsx:483` | `isInTransit && deliveryAssignmentId` | `isInTransit && isSellerView && actor includes seller` |

The trigger `trg_create_seller_delivery_assignment` only fires when `NEW.status = 'picked_up'`. If the workflow marks `preparing` as `is_transit = true`, no delivery assignment gets created, so the entire tracking pipeline is dead.

## Implementation

### 1. Database Migration — Workflow-Driven Assignment Creation

Update `trg_create_seller_delivery_assignment` to replace `IF NEW.status != 'picked_up'` with a dynamic lookup:

```sql
-- Check if the new status is an is_transit step in the workflow
SELECT EXISTS (
  SELECT 1 FROM category_status_flows
  WHERE status_key = NEW.status
    AND is_transit = true
    AND transaction_type = COALESCE(NEW.transaction_type, 'seller_delivery')
    AND parent_group IN (v_parent_group, 'default')
) INTO is_transit_step;

IF NOT is_transit_step THEN RETURN NEW; END IF;
```

This means: whenever the order enters ANY transit step (whether `preparing`, `picked_up`, or a custom status), the assignment is auto-created — if it doesn't exist yet. The existing `IF EXISTS (SELECT 1 FROM delivery_assignments WHERE order_id = NEW.id)` guard prevents duplicates.

**OTP safety**: The `ensure_delivery_code_on_insert` trigger will still generate a code, but the already-fixed `enforce_delivery_otp_gate` now checks the workflow's `requires_otp` flag, so this won't block delivery if OTP isn't required.

### 2. Frontend — Remove `deliveryAssignmentId` Gate on Map

**File: `src/pages/OrderDetailPage.tsx`**

Line 438: Change from:
```tsx
{isDeliveryOrder && isInTransit && deliveryAssignmentId && (
```
To:
```tsx
{isDeliveryOrder && isInTransit && (
```

Inside, add a fallback for when `deliveryAssignmentId` exists but rider location isn't available yet — show seller coordinates as static origin on the map (from `seller.latitude/longitude`). When the assignment gets created (by the updated trigger) and GPS starts flowing, the map seamlessly transitions to live tracking.

### 3. Frontend — Derive Current Actor from Workflow

**File: `src/pages/OrderDetailPage.tsx`**

Derive the current step's actor from the flow:
```tsx
const currentStep = o.flow.find(s => s.status_key === order.status);
const currentActors = (currentStep?.actor || '').split(',').map(a => a.trim());
const isSellerActing = currentActors.includes('seller');
```

Use this to control:
- **SellerGPSTracker** (line 483): Show when `isInTransit && o.isSellerView && isSellerActing` — no `deliveryAssignmentId` dependency
- **Rider identity card** (line 419): Show when assignment exists (unchanged)

### 4. SellerGPSTracker — Support Order-Based Assignment Lookup

**File: `src/components/delivery/SellerGPSTracker.tsx`**

Add an `orderId` prop as alternative to `assignmentId`. When `assignmentId` is not available, look up the assignment by `orderId`:

```tsx
// If no direct assignmentId, find it from the order
useEffect(() => {
  if (assignmentId || !orderId) return;
  supabase.from('delivery_assignments').select('id').eq('order_id', orderId).maybeSingle()
    .then(({ data }) => { if (data) setResolvedAssignmentId(data.id); });
  // Also subscribe for when trigger creates it
}, [orderId, assignmentId]);
```

### 5. useOrderDetail — Expose Current Step Actor

**File: `src/hooks/useOrderDetail.ts`**

Add `currentStepActor` to the return value:
```tsx
const currentStepActor = useMemo(() => {
  if (!order) return '';
  const step = flow.find(s => s.status_key === order.status);
  return step?.actor || '';
}, [order?.status, flow]);
```

## Files to Modify

| File | Change |
|------|--------|
| New migration SQL | Update `trg_create_seller_delivery_assignment` to use `is_transit` lookup instead of hardcoded `picked_up` |
| `src/pages/OrderDetailPage.tsx` | Remove `deliveryAssignmentId` gate on map; derive actor; pass `orderId` to SellerGPSTracker |
| `src/components/delivery/SellerGPSTracker.tsx` | Add `orderId` prop, auto-resolve assignment |
| `src/hooks/useOrderDetail.ts` | Expose `currentStepActor` |

## Risk Assessment

- **Assignment trigger**: Low — the `IF EXISTS` guard prevents duplicates. Adding a workflow lookup is a safe read operation.
- **OTP**: Safe — already fixed in previous migration to check `requires_otp` flag.
- **Map rendering**: Low — showing seller coords as static fallback is purely visual; no data mutation.
- **Existing flows**: Zero regression — `picked_up` already has `is_transit = true` in all workflows, so the trigger fires at the same time as before for existing flows. Only newly-configured transit steps (like `preparing`) gain the behavior.

## Validation Matrix

| Scenario | Expected Behavior |
|----------|-------------------|
| `preparing` with `is_transit=true, actor=seller` | Assignment created, map shows seller coords, GPS tracker starts |
| `picked_up` with `is_transit=true, actor=seller` | Same as today — no regression |
| `preparing` with `is_transit=false` | No assignment, no map — unchanged |
| `requires_otp=false` on delivered | Direct delivery without OTP — already fixed |
| `requires_otp=true` on delivered | OTP enforced — unchanged |
| Platform delivery (3PL) | Trigger skips (guard: `delivery_handled_by != 'platform'`) — unchanged |

