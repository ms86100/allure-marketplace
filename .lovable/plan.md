

# Fix: `product_name` NOT NULL violation in `order_items`

## Root Cause

The `create_multi_vendor_orders` function inserts into `order_items` using `(_item->>'product_name')` from the client JSON payload. The frontend cart does not include `product_name` in the items array, so it resolves to `NULL`, violating the `NOT NULL` constraint.

## Fix (single migration)

**Replace the `order_items` INSERT block** inside `create_multi_vendor_orders` to look up the product name from the `products` table instead of relying on the client JSON. The function already queries `products` in the validation loop but discards the result. In the insert loop (line ~277), we'll fetch it directly:

```sql
-- Inside the second items loop, replace:
--   (_item->>'product_name')
-- with:
--   COALESCE((_item->>'product_name'), (SELECT name FROM public.products WHERE id = (_item->>'product_id')::uuid), 'Unknown Product')
```

The full `CREATE OR REPLACE FUNCTION` will be re-deployed with this single change to the insert statement. Also needs to handle `subtotal` and `product_image` columns — if they don't exist on the table, those columns will be removed from the INSERT to match the actual schema.

**Additionally**: check and add missing columns (`subtotal`, `product_image`) to `order_items` if the reference dump includes them, so the function doesn't fail on those next.

Single SQL migration. Zero frontend changes.

