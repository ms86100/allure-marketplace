
# ✅ COMPLETED: Safe Workflow Stabilization (Phase 1)

## Decision: Visible-but-Separate Approach
The single-workflow consolidation (V2) is **deferred**. The current system keeps `cart_purchase`, `seller_delivery`, and `self_fulfillment` as separate, visible, editable workflows.

## What Was Done

### 1. Exposed `seller_delivery` and `self_fulfillment` in Admin Workflow Manager
- Moved from hidden `FULFILLMENT_VARIANTS` array into `TRANSACTION_TYPES`
- Removed filter that excluded them from the workflow list

### 2. Added Workflow Resolution Badge on Order Detail
- Seller view shows `workflow: {parent_group} / {transaction_type}` under the order ID

### 3. Removed Hardcoded Fallbacks
- **DeliveryActionCard.tsx**: Removed hardcoded `assigned → picked_up → at_gate → delivered` fallback chain. Now fully workflow-driven using `is_terminal`, `is_success`, `requires_otp` flags and `order.transaction_type`.
- **ActiveOrderStrip.tsx**: Removed hardcoded `IN ('cart_purchase', 'self_fulfillment', 'seller_delivery')` filter — now fetches display data for ALL workflow types.

### 4. Scoped `transit_statuses` System Setting Sync
- AdminWorkflowManager now only collects `is_transit` steps from delivery-related workflows (`cart_purchase`, `seller_delivery`) when syncing to `system_settings`
- Prevents pickup-only workflows from polluting transit status lists used by GPS tracking and Live Activities

### 5. DeliveryMonitoringTab — No Change Needed
- Confirmed: hardcoded status arrays (`pending`, `assigned`, `picked_up`, etc.) refer to `delivery_assignments.status` (fixed delivery lifecycle), NOT `category_status_flows` (workflow statuses). These are correct and appropriate.

## How the System Works Now

### Workflow Resolution at Order Creation
When a purchase order is placed, `resolveTransactionType.ts` determines the workflow:
- `fulfillment_type = 'self_pickup'` → `self_fulfillment`
- `fulfillment_type = 'seller_delivery'` or `delivery` with `delivery_handled_by = 'seller'` → `seller_delivery`
- `fulfillment_type = 'delivery'` with `delivery_handled_by = 'platform'` → `cart_purchase`

The resolved `transaction_type` is stored on the order row at creation and never re-resolved.

### Category Config Linkage
- `category_config.transaction_type` is the **base workflow** linked to a category (e.g., `cart_purchase`)
- At runtime, the fulfillment mode overrides this to the correct sub-variant
- Admins edit ALL three workflows independently in the Workflow Manager

---

# 🔮 DEFERRED: Single Workflow Architecture (V2)

## Decision
The single-workflow consolidation is **deferred** as a V2 architecture change.

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
