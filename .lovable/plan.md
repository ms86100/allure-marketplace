

# Fix: Auto-navigate to cart after adding item

## Current behavior
In `useProductDetail.ts`, `handleAdd` adds the item to cart but only navigates to `/cart` for `buy_now` action type. For `add_to_cart`, it stays on the product detail sheet expecting the user to use the stepper or manually close.

## Change
For `add_to_cart` action type, after adding the item, automatically close the product detail sheet and navigate to `/cart` — same as `buy_now` already does.

**File: `src/hooks/useProductDetail.ts`** (lines 88-92)

Remove the `if (actionType === 'buy_now')` condition so that ALL cart actions (both `add_to_cart` and `buy_now`) close the sheet and navigate to cart:

```typescript
// After addItem(...)
onOpenChange?.(false);
navigate('/cart');
```

This is a single-line logic change that removes the conditional gate around the navigation.

