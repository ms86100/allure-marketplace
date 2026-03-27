

# Stock Quantity Enforcement — Bulletproof Fix

## Root Cause

**Zero stock validation exists anywhere in the buying flow.** The system tracks `stock_quantity` on the `products` table and has triggers that decrement stock *after* order placement, but nothing prevents a buyer from adding more items than available stock. The cap is hardcoded to `99` everywhere.

Specifically:
- `useCart.tsx` → `addItem()` caps at `Math.min(..., 99)` — no stock check
- `useCart.tsx` → `updateQuantity()` caps at `Math.min(quantity, 99)` — no stock check
- `ProductCard.tsx` → increment button has no upper bound besides the 99 cap
- `create_multi_vendor_orders` RPC → inserts `order_items` without checking if requested quantity ≤ available stock
- No database constraint on `cart_items` prevents exceeding stock

## Fix Strategy — 4 Layers of Defense

### Layer 1: Client-side enforcement (addItem + updateQuantity)

**File: `src/hooks/useCart.tsx`**

In `addItem()` (line 273): Before the optimistic update, fetch the product's `stock_quantity`. If `stock_quantity` is not null (tracking enabled), cap the total cart quantity at `stock_quantity` instead of 99:

```typescript
// After action_type check, before optimistic update:
let maxQty = 99;
if (product.stock_quantity != null) {
  maxQty = product.stock_quantity;
} else {
  const { data: stockCheck } = await supabase
    .from('products').select('stock_quantity').eq('id', product.id).maybeSingle();
  if (stockCheck?.stock_quantity != null) maxQty = stockCheck.stock_quantity;
}
const existingQty = optimisticItemsRef.current.find(i => i.product_id === product.id)?.quantity || 0;
if (existingQty >= maxQty) {
  toast.error(`Only ${maxQty} available`, { id: 'stock-limit' });
  return;
}
quantity = Math.min(quantity, maxQty - existingQty);
```

In `updateQuantity()` (line 360): Same pattern — fetch stock_quantity and use it as the ceiling instead of 99.

### Layer 2: UI enforcement (ProductCard + ProductDetailSheet)

**File: `src/components/product/ProductCard.tsx`**

The `+` increment button should be disabled when `quantity >= product.stock_quantity` (if stock tracking is enabled). The product object already carries `stock_quantity` from the query.

```typescript
const stockLimit = product.stock_quantity != null ? product.stock_quantity : 99;
const canIncrement = quantity < stockLimit;
// Disable + button when !canIncrement
// Show "Max X" label when at limit
```

Apply the same logic in `ProductListingCard.tsx` and `ProductDetailSheet` (via `useProductDetail.ts`).

### Layer 3: Server-side validation in RPC (last line of defense)

**Database migration: Update `create_multi_vendor_orders`**

Before inserting `order_items`, validate stock for every item:

```sql
-- Inside the item loop, before INSERT INTO order_items:
DECLARE _available_stock integer;

SELECT stock_quantity INTO _available_stock
FROM products WHERE id = (_item->>'product_id')::uuid FOR UPDATE;

IF _available_stock IS NOT NULL AND (_item->>'quantity')::int > _available_stock THEN
  RETURN json_build_object(
    'success', false,
    'error', 'insufficient_stock',
    'product_name', _item->>'product_name',
    'available', _available_stock,
    'requested', (_item->>'quantity')::int
  );
END IF;
```

The `FOR UPDATE` row lock prevents concurrent overselling — two simultaneous checkouts will serialize on the same product row.

### Layer 4: Database trigger on cart_items (safety net)

**Database migration: Create trigger**

```sql
CREATE OR REPLACE FUNCTION enforce_cart_stock_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE _stock integer;
BEGIN
  SELECT stock_quantity INTO _stock FROM products WHERE id = NEW.product_id;
  IF _stock IS NOT NULL AND NEW.quantity > _stock THEN
    NEW.quantity := _stock;
  END IF;
  IF NEW.quantity <= 0 THEN
    RETURN NULL; -- prevent zero/negative qty rows
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_cart_stock
  BEFORE INSERT OR UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION enforce_cart_stock_limit();
```

This silently caps cart quantity at available stock even if the client-side check is bypassed.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useCart.tsx` | Stock ceiling in `addItem()` and `updateQuantity()` using `stock_quantity` |
| `src/components/product/ProductCard.tsx` | Disable `+` button at stock limit; show "Max X" indicator |
| `src/components/product/ProductListingCard.tsx` | Same stock limit on increment |
| `src/hooks/useProductDetail.ts` | Cap quantity at stock limit in `handleAdd` |
| Migration SQL | Update `create_multi_vendor_orders` with `FOR UPDATE` stock check |
| Migration SQL | Add `trg_enforce_cart_stock` trigger on `cart_items` |

## Safeguards

- Products with `stock_quantity = NULL` (tracking disabled) keep the existing 99-unit cap — zero behavioral change for non-tracked products
- `FOR UPDATE` lock in RPC prevents race conditions between concurrent buyers
- Cart trigger is a silent safety net — it caps, never errors
- All changes are additive; rollback = revert files + drop trigger + revert RPC

