

# Fix Categories Page Loading and Cart Price Display

## Problems identified

1. **Categories page stuck in skeleton state** — `CategoriesPage.tsx` line 136 includes `!effectiveSocietyId` in its `isLoading` check. Users without a `society_id` (e.g. new users who just onboarded) will never pass this check, so the page shows skeletons forever. Discovery is now coordinate-based via `browsingLocation`, so requiring `effectiveSocietyId` is outdated.

2. **Cart showing ₹0 and missing product details** — The cart query joins `cart_items` with `products`, but when the product data fails to load or the join returns null, the cart shows `price || 0` = ₹0 and a generic shopping bag icon. The cart should handle missing product data more gracefully (show a fallback or filter out broken items).

## Changes

### 1. `src/pages/CategoriesPage.tsx` (line 136)
Remove `!effectiveSocietyId` from the `isLoading` condition. The page already uses `useProductsByCategory()` which is coordinate-based (browsingLocation). Replace with a check that the browsing location exists if needed, or just rely on the individual query loading states.

```ts
// Before
const isLoading = authLoading || !effectiveSocietyId || configsLoading || groupsLoading || productsLoading || (browseBeyond && nearbyLoading);

// After
const isLoading = authLoading || configsLoading || groupsLoading || productsLoading || (browseBeyond && nearbyLoading);
```

### 2. `src/pages/CartPage.tsx` (line 130-131)
Add a safety check — if a cart item's product is null (failed join), show "Item unavailable" instead of ₹0. This prevents confusing displays when product data is temporarily unavailable.

### 3. `src/hooks/useCart.tsx` (cart query)
The cart query already filters `item.product?.is_available !== false`, but it doesn't filter out items where `product` is null. Add a filter: `.filter(item => item.product != null && item.product.is_available !== false)` to prevent null-product items from reaching the UI.

## Files to modify

1. **`src/pages/CategoriesPage.tsx`** — Remove `!effectiveSocietyId` from isLoading
2. **`src/pages/CartPage.tsx`** — Handle null product data gracefully
3. **`src/hooks/useCart.tsx`** — Filter out cart items with null product joins

