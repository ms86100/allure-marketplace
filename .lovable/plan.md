
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

## Architecture

```
category_status_flows          → ordered status pipeline per (parent_group, transaction_type)
category_status_transitions    → who can move between statuses (actor-based)
validate_order_status_transition → DB trigger enforces transition rules
useCategoryStatusFlow          → frontend loads flow + falls back to 'default'
useStatusTransitions           → frontend loads allowed transitions
AdminWorkflowManager           → admin UI to manage both
```
