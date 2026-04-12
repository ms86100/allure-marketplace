

# Fix: Seller Orders Not Loading — Wrong Column Names

## Root Cause

The `useOrdersList.ts` hook queries `order_items` with two columns that **do not exist** in the database:
- `total_price` — actual column is `subtotal`
- `image_url` — actual column is `product_image`

This causes every seller (and buyer) order list query to return a **400 error**, making it appear as if there are no orders.

The network requests confirm this: every order query selecting from `order_items` returns:
```
{"code":"42703","message":"column order_items_1.total_price does not exist"}
```

## Fix

**File: `src/hooks/useOrdersList.ts`** — Two select strings (buyer query at line 24, seller query at line 43):
- Replace `total_price` with `subtotal`
- Replace `image_url` with `product_image`

That is the entire fix. No other files reference these wrong column names in order_items queries. The `useSellerOrdersInfinite` hook already uses the correct columns.

## Secondary Issue (also visible in network logs)

**`service_recurring_configs` → `products` join fails** with:
```
"Could not find a relationship between 'service_recurring_configs' and 'products'"
```
This is in `useServiceBookings.ts` line ~147: `.select('*, product:products(name)')`. The table likely has a `product_id` FK but PostgREST can't auto-detect it. Will fix by adding the explicit FK hint.

## Changes Summary
1. **`src/hooks/useOrdersList.ts`**: Fix `total_price` → `subtotal`, `image_url` → `product_image` in both select strings
2. **`src/hooks/useServiceBookings.ts`**: Fix `product:products(name)` → `product:products!service_recurring_configs_product_id_fkey(name)` in `useBuyerRecurringConfigs`

