

# Fix: Product Default Availability & Phone Validation on Edit

## Problems

**Problem 1 — `is_available` defaults to `false` on edit**: When opening a product for editing via `openEditDialog` (line 167), it reads `product.is_available` from DB. New products are created with `is_available: true` in the form (line 38), but the DB column likely defaults to `false`. The `productData` sent on save (line 209) uses `formData.is_available`, which is correct. The real issue is that the `is_available` toggle in the edit dialog may not be visible or prominent, so the user doesn't realize it's off.

**However**, looking at `INITIAL_FORM` (line 38): `is_available: true` — new products ARE created with availability on. If it's showing as unavailable after creation, the DB column `is_available` has a default of `false` overriding the insert value, OR the insert payload isn't including it.

Looking at line 209: `is_available: formData.is_available` — it IS included. So this should work. Let me check if there's a DB trigger resetting it.

**Problem 2 — Phone number error on edit**: Line 196 validates `contact_phone` is required when `action_type === 'contact_seller'`. When editing a product, line 169 loads `action_type: (product as any).action_type || 'add_to_cart'`. If the product in DB has `action_type = 'contact_seller'` (possibly set by a category default) but no `contact_phone`, the validation blocks the save.

## Root Cause Analysis

The phone validation (line 196) fires for ANY save when `action_type === 'contact_seller'`, even if the user is just toggling availability. The `action_type` might be set to `contact_seller` by category config defaults without the user realizing it.

## Plan

### 1. Verify DB default for `is_available` column on `products` table
- Check if the column defaults to `true` or `false`
- If `false`, create a migration to change default to `true`

### 2. Fix phone validation to not block non-contact edits
In `src/hooks/useSellerProducts.ts` line 196:
- Only enforce `contact_phone` requirement when `action_type` is explicitly `contact_seller`
- When editing and only toggling `is_available`, skip the phone check if `action_type` hasn't changed and was already saved without a phone (grandfathered data)

**Simpler fix**: The validation is correct for `contact_seller` action type. The real fix is to ensure `action_type` defaults properly. Check what category configs set `action_type` to and ensure the form UI clearly shows the action type selector so users can change it from `contact_seller` to `add_to_cart` if they don't want to provide a phone.

### 3. Files to change

| File | Change |
|------|--------|
| `src/hooks/useSellerProducts.ts` | Relax phone validation: only require phone when user explicitly chose `contact_seller`, not when it was auto-inherited. Also ensure `is_available: true` is sent for new products. |
| Migration (if needed) | Set `ALTER TABLE products ALTER COLUMN is_available SET DEFAULT true` if currently false |

### Specific code changes in `useSellerProducts.ts`:

**Line 196** — Change validation to only block when action_type is contact_seller AND this is a new product or user changed the action_type:
```typescript
// Only require phone for contact_seller action
if (formData.action_type === 'contact_seller' && !formData.contact_phone.trim()) {
  toast.error('Phone number is required for Contact Seller action', { id: 'product-validation' });
  return;
}
```
This validation is actually correct as-is. The fix should be upstream: ensure the `action_type` loaded on edit reflects what's in DB, and if the category forces `contact_seller`, pre-populate the phone from the seller's profile.

**Better fix — Auto-populate `contact_phone` from seller profile**:
In `openEditDialog` and in `resetForm`, if `action_type` is or will be `contact_seller`, auto-fill `contact_phone` from `sellerProfile.phone` or the user's profile phone. This prevents the dead-end where the field is empty but required.

### Final approach (2 changes):

1. **`useSellerProducts.ts` — `openEditDialog`** (line 170): If `contact_phone` is empty and `action_type` is `contact_seller`, auto-fill from seller profile or user profile phone number.

2. **`useSellerProducts.ts` — `resetForm`** (line 155-159): Same auto-fill logic for new products when category defaults to `contact_seller`.

3. **DB migration** (if needed): `ALTER TABLE products ALTER COLUMN is_available SET DEFAULT true;`

