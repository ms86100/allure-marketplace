

# Fix: BuyAgainRow Allows Bookable Services Into Cart

## Root Cause

The bug has **two layers**:

1. **BuyAgainRow never fetches `action_type`** — The `BuyAgainProduct` interface has no `action_type` field. Neither the RPC (`get_user_frequent_products`) nor the fallback query fetches it from the `products` table. So every product from "Buy Again" is treated as a cart product.

2. **useCart guard is bypassed** — `useCart.tsx` line 279 checks `(product as any).action_type`, but since `BuyAgainRow` never passes `action_type`, this is always `undefined`, which passes the `if (pActionType && ...)` check (falsy skips the guard entirely).

Result: A bookable service (e.g. `action_type = 'book'`) gets added to the cart, proceeds through checkout, and creates a regular cart order instead of a booking — breaking the entire workflow.

## Fix (Two-Part)

### Part 1: Fetch `action_type` in BuyAgainRow

**`src/components/home/BuyAgainRow.tsx`**

- Add `action_type` to the `BuyAgainProduct` interface
- In the **fallback query** (line 62): add `action_type` to the `products` select fields
- In the **RPC mapping** (line 45): map `r.action_type` (if the RPC returns it)
- In the **fallback mapping** (line 80): map `p.action_type`

### Part 2: Filter out non-cart products from Buy Again

In the `useMemo` or right after data fetch, filter out products whose `action_type` is not cart-compatible:

```typescript
const cartableProducts = products.filter(p => 
  !p.action_type || ['add_to_cart', 'buy_now'].includes(p.action_type)
);
```

This is the **primary defense** — bookable services simply won't appear in "Buy Again." They belong in a "Book Again" section (future feature), not in a cart-based reorder flow.

### Part 3: Harden the useCart guard (belt-and-suspenders)

**`src/hooks/useCart.tsx`** line 279-280

If `action_type` is still missing (e.g. from other callers), do a quick DB lookup before allowing the add:

```typescript
let pActionType = (product as any).action_type;
if (!pActionType) {
  const { data } = await supabase
    .from('products')
    .select('action_type')
    .eq('id', product.id)
    .maybeSingle();
  pActionType = data?.action_type;
}
if (pActionType && !['add_to_cart', 'buy_now'].includes(pActionType)) {
  toast.error('This item cannot be added to cart');
  return;
}
```

This ensures that even if any future component forgets to pass `action_type`, the cart itself rejects non-cart products.

## Impact Analysis

| Component | Impact | Risk |
|-----------|--------|------|
| BuyAgainRow | Bookable services no longer appear — **intended** | Zero |
| useCart.tsx | Extra DB call only when `action_type` is missing — rare path | Zero |
| ProductListingCard / MarketplaceSection | Already pass `action_type` — unaffected | Zero |
| Quick Reorder edge function | Uses `create_multi_vendor_orders` directly, not `addItem` — unaffected | Zero |
| Checkout flow | No change — only the entry point (addItem) is hardened | Zero |

## Files Changed

| File | Change |
|------|--------|
| `src/components/home/BuyAgainRow.tsx` | Add `action_type` to interface, fetch it, filter non-cart products |
| `src/hooks/useCart.tsx` | Add DB fallback lookup for missing `action_type` |

