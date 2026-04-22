

## Fix: seller can pick categories they're not allowed to sell in

### Root cause

The DB trigger `validate_product_seller_category` enforces that a product's `category` must be in `seller_profiles.categories` (the categories the seller chose during onboarding/admin approval). That's why "maid" is rejected when the seller was only approved for, say, `cook`.

But the **Add Product UI** doesn't filter by `seller_profiles.categories`. In `src/hooks/useSellerProducts.ts` (line 111–114):

```ts
const allowedCategories = useMemo(() => {
  if (!primaryGroup || !groupedConfigs[primaryGroup]) return [];
  return groupedConfigs[primaryGroup];   // every category in the parent group
}, [primaryGroup, groupedConfigs]);
```

`primary_group` is a wide bucket (e.g. `home_services` contains `cook`, `maid`, `driver`, `electrician`…). So the dropdown shows the entire bucket, the seller picks `maid`, the trigger rejects it.

The same `allowedCategories` value is also passed to `BulkProductUpload` and `useBulkUpload`, so bulk upload has the identical bug.

### The fix — single source of truth: `sellerProfile.categories`

**`src/hooks/useSellerProducts.ts`** — replace the parent-group-based derivation with one that intersects `groupedConfigs[primaryGroup]` with the seller's actual approved categories array:

```ts
const allowedCategories = useMemo(() => {
  if (!primaryGroup || !groupedConfigs[primaryGroup]) return [];
  const sellerCats: string[] = (sellerProfile as any)?.categories || [];
  const groupConfigs = groupedConfigs[primaryGroup];
  // If sellerProfile.categories is empty/null, fall back to full group (legacy behaviour, won't trigger DB rejection)
  if (!sellerCats.length) return groupConfigs;
  return groupConfigs.filter(c => sellerCats.includes(c.category));
}, [primaryGroup, groupedConfigs, sellerProfile]);
```

This guarantees the dropdown only shows categories the DB trigger will accept. The `BulkProductUpload` form fixes itself because it consumes the same `allowedCategories` prop.

### Edge cases covered

- **Empty seller categories**: fall back to the full group so legacy sellers (who somehow have a null array) don't see an empty dropdown — DB trigger already short-circuits when the array is null/empty (migration line 71–73).
- **Editing an existing product whose category is no longer allowed**: keep current behaviour (the value is preserved in `formData.category`); the dropdown just won't list it. This matches the trigger — admins can later re-approve a category to re-enable editing.
- **Default-category effect** (`SellerProductFormPage.tsx` line 65–66) already picks `allowedCategories[0]`, which is now guaranteed valid.
- **Single-allowed-category UI** (line 358–365) automatically activates when the seller has one approved category, hiding the dropdown entirely.

### Verification

1. As a seller approved only for `cook`, open `/seller/products/new` → the Category dropdown shows only `cook`, not `maid`/`driver`/etc.
2. As a seller approved for `cook` + `cleaner`, dropdown shows exactly those two.
3. Bulk upload: category column dropdown shows the same filtered list.
4. Add a product with the only/default category → saves without the trigger error.
5. Existing products in disallowed categories still load and render correctly in the products list (they're not deleted, just no longer addable).

### Out of scope

- DB trigger, RLS, schema — they're correct; the bug is purely client-side.
- Admin tooling to widen a seller's categories — separate flow already exists in admin pages.
- Re-running migrations.

### Files touched

- `src/hooks/useSellerProducts.ts` — 4-line change to the `allowedCategories` memo.

No other files need edits; `BulkProductUpload`, `SellerProductFormPage`, and `useBulkUpload` consume the corrected value automatically.

