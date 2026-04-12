

# Fix: Seller Orders Not Loading — `listing_type` Column Does Not Exist

## Root Cause

The network requests confirm every seller order list query returns **400** with:
```
{"code":"42703","message":"column orders.listing_type does not exist"}
```

The `orders` table has `transaction_type` but **does not have `listing_type`**. Both hooks include `listing_type` in their select strings.

The previous fix (replacing `total_price`/`image_url` in order_items) was applied correctly, but this second non-existent column on the `orders` table itself was missed.

## Fix

Remove `listing_type` from the select strings in these two files:

**1. `src/hooks/queries/useSellerOrders.ts`** (line 156):
- Remove `listing_type` from the select string in `useSellerOrdersInfinite`

**2. `src/hooks/useOrdersList.ts`** (lines 24 and 43):
- Remove `listing_type` from both the buyer and seller select strings

That is the complete fix. Two files, three select strings, remove one non-existent column from each.

