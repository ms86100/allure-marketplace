

# Workflow-Driven Architecture: Stability & Clarity Fix

## Problem Summary
The system has workflows in the DB but bypasses them in 5 key areas: status labels, resolution consistency, admin override visibility, self-pickup config validation, and dead workflow clutter. This plan fixes all 5 with minimal risk.

---

## Plan (5 targeted changes, no architecture rewrite)

### 1. Make status labels workflow-driven everywhere

**Problem:** `OrderDetailPage` line 192 uses `o.getOrderStatus()` (hardcoded labels from `system_settings`), not the workflow's `display_label`. Same in `OrdersPage` line 25 and `SellerOrderCard` line 40.

**Fix:**
- **`OrderDetailPage.tsx` (line 192):** Change `statusInfo = o.getOrderStatus(order.status)` to `statusInfo = o.getFlowStepLabel(order.status)` — this already exists and falls back to hardcoded labels when no workflow label is set
- **`OrdersPage.tsx` (line 22-25):** The `OrderCard` component needs flow-aware labels. Add a lightweight batch query hook (`useFlowStepLabels`) that fetches `display_label` + `color` from `category_status_flows` for a set of status keys. This avoids per-card flow loading. Use it in `OrderCard` instead of `getOrderStatus()`
- **`SellerOrderCard.tsx` (line 40):** Same — use the batch flow label hook instead of `getOrderStatus()`

**New hook: `useFlowStepLabels`** — queries `category_status_flows` for distinct `status_key, display_label, color` pairs, builds a lookup map, falls back to `useStatusLabels` when no DB label exists. Cached with React Query (30min stale time).

### 2. Fix workflow resolution consistency

**Problem:** Line 60 of `useOrderDetail.ts` calls `useCategoryStatusFlow(effectiveParentGroup, orderType, orderFulfillmentType, deliveryHandledBy, derivedListingType)` WITHOUT passing `storedTransactionType`. But line 87 passes it to `resolveTransactionType` for transitions. Flow and transitions can resolve differently.

**Fix:**
- **`useCategoryStatusFlow.ts`:** Add `storedTransactionType?: string | null` as 6th parameter. Pass it to `resolveTransactionType()` inside the hook
- **`useOrderDetail.ts` (line 60):** Pass `storedTransactionType` to the flow hook

### 3. Admin override awareness warnings

**Problem:** When editing `default/self_fulfillment`, admin has no idea that `food_beverages/self_fulfillment` overrides it — changes silently have no effect.

**Fix in `AdminWorkflowManager.tsx`:**
- When a workflow is selected for editing, if `parent_group === 'default'`, query `category_status_flows` for any rows with the same `transaction_type` but different `parent_group`. If found, show a persistent warning banner: "Override exists for [food_beverages]. Changes here will NOT apply to orders from those categories."
- Add this check in the `selectWorkflow` handler (around line 103)

### 4. Self-pickup config validation (warn & block)

**Problem:** Admin can enable `is_transit` and `creates_tracking_assignment` on `self_fulfillment` workflows, but DB triggers hard-block these. Silent failure.

**Fix in `AdminWorkflowManager.tsx` save logic (line 160):**
- Before saving, if `transaction_type` includes `self_fulfillment` or `self_pickup`, check if any step has `is_transit = true` or `creates_tracking_assignment = true`
- If so, show a toast warning: "Self-pickup workflows cannot use transit or tracking flags. These are ignored by the system." and auto-clear those flags before saving
- Also show inline warning icons next to the `is_transit` and `creates_tracking_assignment` checkboxes when the transaction type is self-fulfillment

### 5. Dead workflow identification

**Problem:** 13 of 17 workflows have zero orders. Creates confusion about which to edit.

**Fix in `AdminWorkflowManager.tsx` workflow list:**
- After loading workflows, run a lightweight aggregate query: `SELECT transaction_type, COUNT(*) FROM orders WHERE transaction_type IS NOT NULL GROUP BY transaction_type`
- Show a badge on each workflow card: "13 orders" or "0 orders (unused)"
- Unused workflows get a muted/dimmed card style
- No auto-deletion — visibility only, so admin can decide

---

## Files Modified

| File | Change |
|---|---|
| `src/pages/OrderDetailPage.tsx` | Line 192: use `getFlowStepLabel` instead of `getOrderStatus` |
| `src/pages/OrdersPage.tsx` | Use new `useFlowStepLabels` hook in `OrderCard` |
| `src/components/seller/SellerOrderCard.tsx` | Use new `useFlowStepLabels` hook |
| `src/hooks/useFlowStepLabels.ts` | **NEW** — batch flow label lookup with fallback |
| `src/hooks/useCategoryStatusFlow.ts` | Accept `storedTransactionType` param |
| `src/hooks/useOrderDetail.ts` | Pass `storedTransactionType` to flow hook |
| `src/components/admin/AdminWorkflowManager.tsx` | Override warnings, self-pickup validation, usage badges |

## What is NOT changed
- No DB schema changes
- No trigger modifications
- No workflow merging or deletion
- No changes to `resolveTransactionType.ts` logic
- No changes to `useStatusLabels.ts` (kept as fallback only)
- Existing order flows continue working identically

