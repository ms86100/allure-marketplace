

## Root Cause: `delivery_handled_by` is NULL on Pre-Migration Orders

### What's Happening

The order `8cf102a5` has:
- `fulfillment_type: delivery`
- `delivery_handled_by: NULL`
- Seller `7838` has `fulfillment_mode: pickup_and_seller_delivery`

The `resolveTransactionType` function only routes to `self_fulfillment` when `delivery_handled_by === 'seller'`. Since it's `NULL`, the order gets the `cart_purchase` workflow, where after `ready` only the `delivery` actor (a delivery partner) can transition to `picked_up`. Since platform delivery partners don't exist yet, the order is **deadlocked**.

The migration that sets `delivery_handled_by` based on seller's fulfillment_mode was added on March 17, but this order was created either before that migration or without hitting the updated function.

### DB Evidence

```text
self_fulfillment flow:  ready → completed (seller allowed)  ✅
cart_purchase flow:     ready → picked_up (delivery only)   ❌ deadlock
```

The `category_status_transitions` table confirms:
- `cart_purchase`: `ready → picked_up` only by `delivery` actor
- `self_fulfillment`: `ready → completed` by `seller` or `buyer`

### Fix (2 parts)

#### 1. Backfill Migration — Fix Existing NULL Orders

Run a migration to set `delivery_handled_by` for all existing orders where it's NULL and `fulfillment_type = 'delivery'`:

```sql
UPDATE orders o
SET delivery_handled_by = 'seller'
FROM seller_profiles sp
WHERE o.seller_id = sp.id
  AND o.fulfillment_type = 'delivery'
  AND o.delivery_handled_by IS NULL
  AND sp.fulfillment_mode IN ('seller_delivery', 'pickup_and_seller_delivery');

-- Catch-all: any remaining delivery orders with NULL → default to seller
-- (since platform delivery is not live)
UPDATE orders
SET delivery_handled_by = 'seller'
WHERE fulfillment_type = 'delivery'
  AND delivery_handled_by IS NULL;
```

#### 2. Frontend Defensive Fallback — `resolveTransactionType`

In both `useCategoryStatusFlow.ts` (line 82) and `useOrderDetail.ts` (line 25), update `resolveTransactionType` so that when `fulfillment_type = 'delivery'` and `delivery_handled_by` is null/undefined, it defaults to `self_fulfillment` instead of `cart_purchase`. This prevents future deadlocks if the DB value is ever missing.

```ts
// If delivery but no handler specified → treat as self_fulfillment
// (platform delivery not live yet)
if (fulfillmentType === 'delivery' && !deliveryHandledBy) {
  return 'self_fulfillment';
}
```

### Files Changed

| File | Change |
|------|--------|
| New migration SQL | Backfill `delivery_handled_by` for existing orders |
| `src/hooks/useCategoryStatusFlow.ts` | Default null `deliveryHandledBy` to `self_fulfillment` |
| `src/hooks/useOrderDetail.ts` | Same fallback in its local `resolveTransactionType` |

