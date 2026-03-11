

# Impact Analysis: Subcategory Service Feature Overrides Are Silently Ignored

## The Bug

We added `supports_addons`, `supports_recurring`, and `supports_staff_assignment` columns to the `subcategories` table and built the admin UI to configure them. But **no consumer code reads these subcategory overrides**. The override values are saved to the database and never used — the system always falls back to the parent category's flags.

This is the same pattern that already works correctly for `show_veg_toggle` and `show_duration_field` (subcategory overrides are respected in `useSellerProducts.ts` lines 75-76). The three new flags were not wired up the same way.

## Affected Locations

| Location | What's Wrong |
|----------|-------------|
| `useSellerProducts.ts` lines 243-245 | `currentCategorySupportsAddons/Recurring/StaffAssignment` only check category config, ignoring `activeSubcategory` override |
| `ServiceBookingFlow.tsx` line 77-78 | Reads `config.supports_addons` and `config.supports_recurring` from category only — no subcategory awareness at all |
| `useCategoryFeatureFlags.ts` lines 60-68 | `configToFlags()` only reads category-level flags — no subcategory input |
| `CategoryConfig` type (`types/categories.ts`) | Missing `supportsAddons`, `supportsRecurring`, `supportsStaffAssignment` — every consumer uses `(config as any)` casts |

## Fix Plan

### 1. Add missing fields to `CategoryConfig` interface (`src/types/categories.ts`)
Add `supportsAddons`, `supportsRecurring`, `supportsStaffAssignment` as optional booleans. This eliminates all the `(config as any)` casts.

### 2. Fix `useSellerProducts.ts` — Apply subcategory override pattern
Lines 243-245: Use the same `activeSubcategory?.supports_addons ?? categoryConfig.supportsAddons` fallback pattern already used for `showVegToggle` and `showDurationField`.

### 3. Fix `ServiceBookingFlow.tsx` — Fetch subcategory override
The booking flow receives `productId` but not `subcategory_id`. Two options:
- **Option A**: Pass `subcategory_id` as a prop from the caller and look up the subcategory
- **Option B**: Query the product's `subcategory_id` from the already-fetched product data

Option B is cleaner — the product data is already available in the parent. We'll add an optional `subcategoryId` prop and use `useSubcategories` to resolve overrides.

### 4. Fix `useCategoryFeatureFlags.ts` — Remove `(as any)` casts
Once the type is updated, the casts become unnecessary. Clean them up.

### Files to modify
- `src/types/categories.ts` — Add 3 fields to `CategoryConfig`
- `src/hooks/useCategoryBehavior.ts` — Map DB fields to the new type fields (already done, just remove `as any` need)
- `src/hooks/useSellerProducts.ts` — Apply subcategory fallback for 3 flags
- `src/components/booking/ServiceBookingFlow.tsx` — Accept `subcategoryId` prop, resolve overrides
- `src/hooks/useCategoryFeatureFlags.ts` — Remove `(as any)` casts
- Any callers of `ServiceBookingFlow` — Pass `subcategoryId` prop

