

# Revalidation Report: 5 Seller Bugs (Round 4) — Confidence Assessment

## Bug 1: "Submit All for Approval" Submits Imageless Products
**Confidence: 100% — CONFIRMED**

Line 143 of `SellerProductsPage.tsx`:
```typescript
const draftIds = sp.products.filter(p => (p as any).approval_status === 'draft').map(p => p.id);
const { error } = await supabase.from('products').update({ approval_status: 'pending' }).in('id', draftIds);
```
Zero validation. No image check. Directly updates all drafts to `pending`.

## Bug 2: `daily_order_limit` Saved But Never Enforced
**Confidence: 100% — CONFIRMED**

- `useSellerSettings.ts` saves `daily_order_limit` to DB (line 150)
- `useCart.tsx` line 110 fetches seller profile but does NOT include `daily_order_limit` in the select
- `grep` across entire codebase: `daily_order_limit` appears ONLY in `useSellerSettings.ts` and `types.ts` — zero references in checkout, cart, or order flows
- The field is saved but never read or enforced anywhere

## Bug 3: Bulk Upload Allows Empty Category
**Confidence: 100% — CONFIRMED**

Line 133 of `useBulkUpload.ts`:
```typescript
if (row.category && !categorySlugs.includes(row.category)) errors.push('Invalid category');
```
The condition `row.category &&` means empty string bypasses the check entirely. If `allowedCategories` is empty, all rows get `category: ''` (line 109 default) and pass validation. DB insert then fails on the enum constraint.

## Bug 4: Per-Product "Submit" Button Submits Imageless Product
**Confidence: 100% — CONFIRMED**

Line 182 of `SellerProductsPage.tsx`:
```typescript
onClick={async () => { const { error } = await supabase.from('products').update({ approval_status: 'pending' }).eq('id', product.id); ... }}
```
No `image_url` check. Same issue as Bug 1 but for individual products.

## Bug 5: Empty `operating_days` Saves Without Blocking
**Confidence: 100% — CONFIRMED**

Line 129 of `useSellerSettings.ts`:
```typescript
if (formData.operating_days.length === 0) { toast.warning('No operating days selected — your store may appear closed to buyers', { id: 'settings-days-warn' }); }
```
No `return` statement. Compare lines 126-128 which all have `return`. The save proceeds on line 131 with an empty array, making the store invisible to buyers.

---

## Implementation Plan

All 5 bugs confirmed at 100% confidence. Changes across 4 files:

### File 1: `src/pages/SellerProductsPage.tsx`
**Bug 1 fix** (line 143): Filter `draftIds` to only include products with `image_url`. Show toast with skip count.
**Bug 4 fix** (line 182): Add `if (!product.image_url)` guard before submit.

### File 2: `src/hooks/useCart.tsx`
**Bug 2 fix** (line 110): Add `daily_order_limit` to the seller_profiles select string.

### File 3: `src/hooks/useCartPage.ts`
**Bug 2 fix**: Before the existing `minimum_order_amount` check, loop through seller groups. If `daily_order_limit` is set, query today's order count for that seller (IST timezone). Block checkout if limit reached.

### File 4: `src/hooks/useBulkUpload.ts`
**Bug 3 fix** (line 130): Add `if (!row.category) errors.push('Category required');` after the name check.

### File 5: `src/hooks/useSellerSettings.ts`
**Bug 5 fix** (line 129): Change `toast.warning` to `toast.error` and add `return;`.

### Risks
1. **Bug 2 latency**: The daily order count query adds one DB call per seller at checkout — only when `daily_order_limit` is non-null. Acceptable.
2. **Bug 1/4 seller confusion**: Sellers may not understand why Submit is blocked — mitigated by explicit toast message naming the product.
3. **Bug 5 vacation flow**: Sellers wanting all days off should use "Pause Shop" instead — already available in UI.

| # | Bug | Confidence | Effort |
|---|-----|-----------|--------|
| 1 | Submit All sends imageless products | 100% | ~5 min |
| 2 | daily_order_limit never enforced | 100% | ~15 min |
| 3 | Bulk upload allows empty category | 100% | ~1 min |
| 4 | Per-product Submit allows imageless | 100% | ~2 min |
| 5 | Empty operating_days saves | 100% | ~1 min |

