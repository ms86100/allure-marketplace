
# ✅ COMPLETED: Expose Hidden Workflows & Add Debug Badge

## What Was Done

### 1. Exposed `seller_delivery` and `self_fulfillment` in Admin Workflow Manager
- Moved from hidden `FULFILLMENT_VARIANTS` array into `TRANSACTION_TYPES`
- Removed filter that excluded them from the workflow list
- Updated `typeOrder` to use `TRANSACTION_TYPES` dynamically

### 2. Added Workflow Resolution Badge on Order Detail
- Seller view now shows `workflow: {parent_group} / {transaction_type}` under the order ID
- Helps admins immediately see which workflow an order resolved to

## Next Steps (Follow-up)
- Fix hardcoded fallbacks in `DeliveryActionCard.tsx`
- Fix hardcoded status arrays in `DeliveryMonitoringTab.tsx`
- Deprecate `transit_statuses` system_settings global sync
