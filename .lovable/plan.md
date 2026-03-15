
# Dynamic Workflow Engine — Implementation Complete

## What Was Built

### Phase 1: Database ✅
- **`category_status_transitions`** table — stores actor-based transition rules (from_status → to_status → allowed_actor) per workflow
- **Display columns** added to `category_status_flows`: `display_label`, `color`, `icon`, `buyer_hint`
- **`validate_order_status_transition`** trigger — validates transitions against `category_status_transitions` table with actor enforcement
- **Seeded workflows**: `default` parent_group for `cart_purchase`, `self_fulfillment`, `service_booking`, `request_service`
- **Seeded transitions** for all 7 parent_groups × service_booking + education_learning × request_service + all default workflows
- **Performance index**: `idx_cst_lookup` on (parent_group, transaction_type, from_status)

### Phase 2: Frontend Cleanup ✅
- **`useCategoryStatusFlow.ts`** — extended with `display_label`, `color`, `icon`, `buyer_hint` fields; added `booking` → `service_booking` type mapping; fallback to `default` parent_group; new `useStatusTransitions` hook
- **`useOrderDetail.ts`** — removed ALL hardcoded status arrays (legacyOrder, fallback displayStatuses); added `getFlowStepLabel()` and `getBuyerHint()` helpers that use DB flow data
- **`OrderDetailPage.tsx`** — timeline labels now come from `getFlowStepLabel()`; buyer hints now come from `getBuyerHint()` (DB-driven)
- **`OrdersMonitor.tsx`** — replaced hardcoded `ORDER_STATUS_LABELS` with `useStatusLabels()` hook

### Phase 3: Admin Workflow Manager ✅
- **`AdminWorkflowManager.tsx`** — full workflow editor with:
  - List view of all (parent_group, transaction_type) workflows
  - Status pipeline editor: add/remove/reorder steps, configure actor/terminal/display_label/color/icon/buyer_hint
  - Transition rules editor: for each status, toggle which actors can move to which next statuses (supports non-linear transitions like cancellations)
  - Save: upserts all flow steps + transitions
- **Admin nav**: "Workflows" item added under Commerce group

### Phase 4: Fixes ✅
- **Calendar**: native Capacitor call wrapped in try/catch, falls back to ICS download on failure

### Phase 5: Deep Audit Fixes ✅
- **C1**: Added `requested`, `confirmed`, `rescheduled`, `no_show`, `at_gate` to `OrderStatus` type and `ORDER_STATUS_MAP`
- **C2**: `OrderCancellation` now accepts `canCancel` prop from workflow transitions instead of hardcoded status check
- **C3**: `getNextStatusForActor` rewritten to use `category_status_transitions` for accurate non-linear transition lookups
- **C5**: Added skeleton loading state while flow is loading in timeline UI
- **S2**: `getNextStatus` and `canChat` now use `isTerminalStatus()` from flow metadata instead of hardcoded status lists
- **S3**: Seller reject button now uses `canSellerReject` derived from transitions table (supports `requested`, `enquired`, etc.)
- **S4**: Removed hardcoded "Awaiting Pickup" override in `SellerOrderCard`
- **S5**: Added missing status entries to `ORDER_STATUS_MAP`
- **U2**: `isInTransit` now derived from flow metadata (delivery actor steps) instead of hardcoded array
- **U3**: `canChat` uses `isTerminalStatus()` — properly disables chat for `no_show` and other terminal statuses
- **D2**: `auto-cancel-orders` edge function now clears `auto_cancel_at` on cancellation
- **New helpers**: `isTerminalStatus()`, `canActorCancel()`, `getNextStatusesForActor()` in `useCategoryStatusFlow.ts`

## Architecture

```
category_status_flows          → ordered status pipeline per (parent_group, transaction_type)
category_status_transitions    → who can move between statuses (actor-based)
validate_order_status_transition → DB trigger enforces transition rules
useCategoryStatusFlow          → frontend loads flow + falls back to 'default'
useStatusTransitions           → frontend loads allowed transitions
AdminWorkflowManager           → admin UI to manage both
```
