

# Clean Up Workflow Manager to Match Supported Workflows

## Problem
The workflow manager shows 6 transaction types (`cart_purchase`, `seller_delivery`, `self_fulfillment`, `service_booking`, `request_service`, `contact_enquiry`), but the system only supports 4 primary workflows mapped from UI buttons:

| UI Button | Workflow |
|---|---|
| Schedule Visit / Bookable Service | **Service Booking** |
| Contact Only | **Contact Inquiry** |
| Request Call / Request Service | **Request Service** |
| Buy Now / Add to Cart | **Cart Purchase** |

`seller_delivery` and `self_fulfillment` are fulfillment sub-variants of Cart Purchase that `resolveTransactionType()` routes to at runtime. They should not appear as standalone workflows in the admin UI.

## Changes

### 1. `src/components/admin/workflow/types.ts`
Remove `seller_delivery` and `self_fulfillment` from `TRANSACTION_TYPES`. This hides them from Create and Clone dialogs.

### 2. `src/components/admin/AdminWorkflowManager.tsx`
Filter the workflow list to only show the 4 supported transaction types. Add an info note explaining that fulfillment sub-variants (seller_delivery, self_fulfillment) are auto-derived from Cart Purchase at runtime.

### 3. DB cleanup (migration)
Delete orphan `seller_delivery` and `self_fulfillment` flows from `category_status_flows` **if** they are identical to `cart_purchase` flows (just with extra steps). Or keep them in DB but hidden from admin UI — need to verify first.

### Pre-check needed
Before deleting DB rows, verify whether `seller_delivery` and `self_fulfillment` flows have meaningfully different steps from `cart_purchase`. If they do, they must stay in DB (the runtime routing depends on them) — we just hide them from the admin workflow manager list.

## Impact
- Admin workflow manager only shows 4 clean workflow types
- Create/Clone dialogs only offer the 4 supported types
- Runtime routing via `resolveTransactionType()` continues to work unchanged (DB rows stay if needed)

