

# Fix: Seller Products Not Showing ("Add your first product")

## Root Cause

The product fetch query in `useSellerProducts.ts` (line 166) selects two columns that **do not exist** in the `products` table:
- `addon_groups` — does not exist
- `duration_minutes` — does not exist

This causes the Supabase query to return an error instead of data. The error is caught silently (line 176: `productRes.data || []`), resulting in an empty products array — which triggers the "Add your first product" empty state.

## Fix

**File: `src/hooks/useSellerProducts.ts` (line 166)**

Remove `addon_groups` and `duration_minutes` from the `.select()` call. The correct column for duration is `service_duration_minutes` (if needed).

Updated select:
```
id, name, description, price, mrp, image_url, category, is_veg, is_available,
is_bestseller, is_recommended, is_urgent, seller_id, action_type, contact_phone,
stock_quantity, low_stock_threshold, prep_time_minutes, created_at, updated_at,
approval_status, subcategory_id, lead_time_hours, accepts_preorders,
attribute_blocks, discount_percentage
```

This is a one-line fix that will immediately restore product visibility for all sellers.

