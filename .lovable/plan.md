

# Round 2 Audit Report — Workflow Engine Integration

## Status of Round 1 Fixes

The P0 fixes from Round 1 are **confirmed implemented**:
- `OrderStatus` type expanded (C1 — fixed)
- `getNextStatusForActor` uses transitions table (C3 — fixed)
- `OrderCancellation` accepts `canCancel` prop from workflow (C2 — fixed)
- `canChat` uses `isTerminalStatus()` (U3 — fixed)
- `isInTransit` derived from flow actor metadata (U2 — fixed)
- `auto-cancel-orders` sets `auto_cancel_at: null` (D2 — fixed)
- `canSellerReject` derived from transitions (S3 — fixed)
- `SellerOrderCard` no longer overrides labels (S4 — fixed)

## Remaining Issues Found

### R1: `OrdersPage` hardcodes terminal status checks (Medium)
**File:** `src/pages/OrdersPage.tsx:28-29`
```typescript
const canReorder = type === 'buyer' && (order.status === 'completed' || order.status === 'delivered');
const isCompleted = order.status === 'completed' || order.status === 'delivered';
```
`OrdersPage.OrderCard` does not load workflow flow data, so it cannot use `isTerminalStatus()`. For service bookings that end at `no_show`, the completed styling won't apply. **Acceptable tradeoff** — these are cosmetic (green checkmark icon, reorder button). Loading flows per-card in a list would be expensive.

**Recommendation:** No change needed. `completed` and `delivered` are the correct positive-terminal statuses for reorder/review eligibility. `no_show` and `cancelled` should NOT show reorder.

### R2: `OrderDetailPage` hardcodes `showNav` terminal check (Low)
**File:** `src/pages/OrderDetailPage.tsx:66`
```typescript
showNav={(!o.isSellerView || order.status === 'completed' || order.status === 'cancelled') && !o.isChatOpen}
```
This hides bottom nav for sellers on active orders (so the action bar takes its place). Missing `delivered` and `no_show` as terminal — seller action bar won't show for those statuses, but bottom nav also won't show. **Net effect:** seller sees neither action bar nor nav on `delivered`/`no_show` orders.

**Fix:** Replace with `isTerminalStatus(flow, order.status)`:
```typescript
showNav={(!o.isSellerView || isTerminalStatus(o.flow, order.status)) && !o.isChatOpen}
```

### R3: `OrderDetailPage` hardcodes "Awaiting delivery pickup" at `ready` (Low)
**File:** `src/pages/OrderDetailPage.tsx:248`
```typescript
{o.orderFulfillmentType === 'delivery' && order.status === 'ready' ? (
  <div>Awaiting delivery pickup</div>
) : ...}
```
This is actually correct behavior — when status is `ready` and fulfillment is delivery, the seller cannot advance (the delivery partner picks up). The `getNextStatusForActor` will return `null` for seller at `ready` in delivery workflows, so the fallback would also show nothing. This hardcoded check just adds a better UX message. **No fix needed.**

### R4: `LiveDeliveryTracker` hardcodes delivery assignment statuses (Not a workflow issue)
**File:** `src/components/delivery/LiveDeliveryTracker.tsx:51`
```typescript
const isInTransit = ['picked_up', 'on_the_way', 'at_gate'].includes(tracking.status);
```
This checks `delivery_assignments.status`, NOT `orders.status`. These are delivery-specific statuses in a separate table. **Not a workflow issue — no fix needed.**

### R5: `ExtendedOrderStatus` in `categories.ts` is stale (Low)
**File:** `src/types/categories.ts:108-110`
Missing `requested`, `confirmed`, `rescheduled`, `no_show`, `at_gate`, `assigned`, `on_the_way`, `arrived`. However, this type is **not used anywhere** in the codebase (0 imports found). 

**Fix:** Delete the dead type to avoid confusion.

### R6: `OrdersMonitor` hardcodes status filter dropdown (Medium)
**File:** `src/components/admin/analytics/OrdersMonitor.tsx:40-42`
```typescript
{['placed','accepted','preparing','ready','delivered','completed','cancelled'].map(s => (
```
Missing `enquired`, `quoted`, `requested`, `confirmed`, `scheduled`, `in_progress`, etc. Admin cannot filter by these statuses.

**Fix:** Load distinct statuses from `category_status_flows` or use the full `OrderStatus` type.

### R7: `useCartPage` cancels unpaid orders without transition validation error handling (Low)
**File:** `src/hooks/useCartPage.ts:322, 354`
```typescript
await supabase.from('orders').update({ status: 'cancelled' }).in('id', pendingOrderIds)...
```
These cancel freshly created `placed` orders on payment failure. The `placed → cancelled` transition exists for buyer in all workflows. The `.catch()` swallows errors. **Acceptable** — this is a payment failure cleanup path for brand-new orders.

### R8: Tests still use hardcoded cancellation logic (Low)
**File:** `src/test/orders-payments.test.ts:361-385`
Tests check `['placed', 'accepted'].includes(status)` for cancellation eligibility. These tests don't reflect the new workflow-driven logic. **Low priority** — tests are unit tests for business rules, not integration tests.

## Performance Verification

**Indexes confirmed present:**
- `idx_flows_lookup` on `(parent_group, transaction_type, sort_order)` 
- `idx_cst_lookup` on `(parent_group, transaction_type, from_status)` 
- Unique constraint on transitions `(parent_group, transaction_type, from_status, to_status, allowed_actor)`

No performance concerns.

## Summary of Required Fixes

| Priority | Issue | Fix |
|----------|-------|-----|
| **P1** | R2 | Use `isTerminalStatus()` for `showNav` in OrderDetailPage |
| **P2** | R6 | Load status filter options dynamically in OrdersMonitor |
| **P2** | R5 | Delete dead `ExtendedOrderStatus` type |
| **P3** | R8 | Update test assertions to match workflow-driven cancellation |

Only **3 actionable fixes** remain. The system is substantially workflow-aware after Round 1.

