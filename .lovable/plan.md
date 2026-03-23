
# ✅ COMPLETED: Safe Workflow Fixes (Phase 1)

## What Was Done

### 1. Exposed `seller_delivery` and `self_fulfillment` in Admin Workflow Manager
- Moved from hidden `FULFILLMENT_VARIANTS` array into `TRANSACTION_TYPES`
- Removed filter that excluded them from the workflow list

### 2. Added Workflow Resolution Badge on Order Detail
- Seller view shows `workflow: {parent_group} / {transaction_type}` under the order ID

### 3. Removed Hardcoded Fallbacks (This Session)
- **DeliveryActionCard.tsx**: Removed hardcoded `assigned → picked_up → at_gate → delivered` fallback chain. Now returns `null` when flow is empty (shows loading state). Uses `is_terminal && is_success` flags instead of `status_key === 'delivered'`. Uses step's `requires_otp` flag instead of hardcoded `true`.
- **DeliveryActionCard.tsx**: `isDeliveryInTransit()` now returns `false` when flow is empty instead of hardcoded status exclusion list.
- **DeliveryActionCard.tsx**: Uses `order.transaction_type` (stored at creation) instead of re-resolving from `fulfillment_type`.
- **ActiveOrderStrip.tsx**: Removed hardcoded `IN ('cart_purchase', 'self_fulfillment', 'seller_delivery')` filter — now fetches display data for ALL workflow types.

---

# 🔮 DEFERRED: Single Workflow Architecture (V2)

## Decision
The single-workflow consolidation (merging `seller_delivery` and `self_fulfillment` into `cart_purchase` via `fulfillment_scope` column) is **deferred** as a V2 architecture change.

## Reason
- High blast radius: touches DB schema, RPCs, triggers, hooks, edge functions
- Risk to active orders mid-lifecycle
- Requires staged rollout with backward compatibility
- Current system works correctly when all workflows are visible and editable

## V2 Plan (When Ready)
1. Add `fulfillment_scope` column to `category_status_flows` and `category_status_transitions`
2. Merge `seller_delivery` and `self_fulfillment` steps into `cart_purchase` with scope tags
3. Update RPCs to filter by scope
4. Simplify `resolveTransactionType` to always return `cart_purchase` for purchases
5. Update `useCategoryStatusFlow` hook with scope filtering
6. Migrate existing orders
7. Update Admin UI with scope selector per step

## Remaining Safe Fixes (Follow-up)
- Fix hardcoded fallbacks in `DeliveryMonitoringTab.tsx`
- Scope `transit_statuses` system_settings sync to avoid cross-workflow leakage
