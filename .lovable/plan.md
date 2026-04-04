

# Hardening: Category Filtering + Backend Enforcement

## Problem
The Add Product flow shows **all categories** from the seller's parent group instead of only the ones they selected during onboarding. Additionally, there is no backend enforcement — a crafted API call can bypass the UI filter.

## Changes

### 1. UI filtering — `SellerAddProductPage.tsx`
Filter `categoryConfigs` to only categories in `sellerProfile.categories`:
```typescript
const sellerCategories: string[] = sellerProfile?.categories || [];
const categoryConfigs = primaryGroup && groupedConfigs[primaryGroup]
  ? groupedConfigs[primaryGroup].filter(c => sellerCategories.includes(c.category))
  : [];
```

### 2. UI filtering — `useSellerProducts.ts`
Same filter on `allowedCategories`:
```typescript
const sellerCats: string[] = (sellerProfile as any)?.categories || [];
const allowedCategories = useMemo(() => {
  if (!primaryGroup || !groupedConfigs[primaryGroup]) return [];
  return groupedConfigs[primaryGroup].filter(c => sellerCats.includes(c.category));
}, [primaryGroup, groupedConfigs, sellerCats]);
```

### 3. DB trigger — validate product category against seller's categories
New migration adding a `BEFORE INSERT OR UPDATE OF category, seller_id` trigger:
```sql
CREATE OR REPLACE FUNCTION public.validate_product_seller_category()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _seller_categories text[];
BEGIN
  SELECT categories INTO _seller_categories
  FROM public.seller_profiles WHERE id = NEW.seller_id;

  -- If seller has no categories array set, allow anything (backward compat)
  IF _seller_categories IS NULL OR array_length(_seller_categories, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.category = ANY(_seller_categories)) THEN
    RAISE EXCEPTION 'Product category "%" is not in seller''s allowed categories', NEW.category;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_product_seller_category
  BEFORE INSERT OR UPDATE OF category, seller_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_seller_category();
```

### 4. Edge cases handled in `DraftProductManager.tsx`

| Case | Fix |
|------|-----|
| **Empty categories** | Show message "No categories configured" with link to store settings instead of empty step |
| **Edit mode: product in removed category** | In edit mode, if `initialProduct.category` is not in filtered list, append it to the list so the product remains editable (flagged with a warning badge) |
| **Single category** | Already auto-selected + locked (existing logic on line 760) |
| **Subcategory label** | Change from "optional" to "recommended" (line 772) |

### 5. Step 2→3 validation gate (from prior audit)
In the Step 2 "Continue" handler, validate `name` is non-empty and `price > 0` before allowing progression. Show inline field errors.

## Execution order
1. DB migration (category validation trigger)
2. `SellerAddProductPage.tsx` — filter categories
3. `useSellerProducts.ts` — filter allowedCategories
4. `DraftProductManager.tsx` — empty state, edit-mode orphan guard, step validation

