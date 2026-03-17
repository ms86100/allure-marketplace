

## Problem Summary

Three interrelated issues:

1. **Seller stuck at "Ready"**: The order has `fulfillment_type: 'delivery'` but the seller configured `pickup_and_seller_delivery` (seller delivers, no platform partner). The system incorrectly routes this to the `cart_purchase` workflow which requires a `delivery` actor for `ready → picked_up`. The seller gets blocked at "Awaiting delivery pickup."

2. **Hard-coded delivery wait message**: Line 266 in `OrderDetailPage.tsx` shows "Awaiting delivery pickup" for ALL orders with `fulfillment_type === 'delivery'`, regardless of whether a platform delivery partner is involved.

3. **Live Activity status mismatch**: `LiveActivityManager.START_STATUSES` includes `en_route` but the DB workflow uses `on_the_way`. The activity never starts for that status.

## Root Cause

When the buyer selects delivery at checkout, the order gets `fulfillment_type: 'delivery'` — a generic value that doesn't distinguish between seller-delivery and platform-delivery. The `resolveTransactionType()` function only recognizes `'seller_delivery'` (not `'delivery'`) for the `self_fulfillment` workflow.

**Current logic** in `useOrderDetail.ts` and `useCategoryStatusFlow.ts`:
```
if (fulfillmentType in ['self_pickup', 'seller_delivery']) → self_fulfillment
else → cart_purchase (has delivery partner steps)
```

But the cart page stores `'delivery'` regardless of who delivers. The missing link is the **seller's `fulfillment_mode`** or the order's `delivery_handled_by` field, which should disambiguate.

## Plan

### 1. Store delivery origin on the order (DB + order creation)

The `orders` table already has a `delivery_handled_by` column (currently always null). Populate it during order creation:

- **DB function `create_multi_vendor_orders`**: When `_fulfillment_type = 'delivery'`, look up the seller's `fulfillment_mode`. If it's `seller_delivery` or `pickup_and_seller_delivery`, set `delivery_handled_by = 'seller'`. If `platform_delivery` or `pickup_and_platform_delivery`, set `delivery_handled_by = 'platform'`.

### 2. Fix transaction type resolution

Update `resolveTransactionType()` in both `useOrderDetail.ts` and `useCategoryStatusFlow.ts` to use `delivery_handled_by`:

```
if fulfillment_type is 'self_pickup' → self_fulfillment
if fulfillment_type is 'delivery' AND delivery_handled_by is 'seller' → self_fulfillment  
if fulfillment_type is 'delivery' AND delivery_handled_by is 'platform' (or null for now) → cart_purchase
```

This ensures seller-delivered orders use the `self_fulfillment` workflow (placed → accepted → preparing → ready → completed), skipping the delivery partner steps entirely.

### 3. Remove hard-coded "Awaiting delivery pickup" in OrderDetailPage

Replace line 266-267:
```tsx
{o.orderFulfillmentType === 'delivery' && order.status === 'ready' ? (
  <div>Awaiting delivery pickup</div>
```

With a check that only shows this when the order actually uses a platform delivery partner:
```tsx
{o.orderFulfillmentType === 'delivery' && order.status === 'ready' && (order as any).delivery_handled_by === 'platform' ? (
```

For seller-delivery orders, the normal `nextStatus` button will appear instead.

### 4. Fix the existing test order

Update the current stuck order to unblock testing:
```sql
UPDATE orders SET delivery_handled_by = 'seller' WHERE id = 'bb849a25-...';
```

### 5. Fix Live Activity status key mismatch

In `LiveActivityManager.ts`, add `on_the_way` to `START_STATUSES` to match the DB workflow key:
```ts
const START_STATUSES = new Set([
  'accepted', 'picked_up', 'confirmed', 'preparing', 'en_route', 'ready', 'on_the_way',
]);
```

### Files to change

| File | Change |
|------|--------|
| DB migration on `create_multi_vendor_orders` | Set `delivery_handled_by` based on seller's `fulfillment_mode` |
| `src/hooks/useOrderDetail.ts` | Update `resolveTransactionType` to accept and use `delivery_handled_by` |
| `src/hooks/useCategoryStatusFlow.ts` | Same `resolveTransactionType` update |
| `src/pages/OrderDetailPage.tsx` | Gate "Awaiting delivery pickup" on `delivery_handled_by === 'platform'` |
| `src/services/LiveActivityManager.ts` | Add `on_the_way` to `START_STATUSES` |
| DB data fix | Set `delivery_handled_by = 'seller'` on the stuck order |

