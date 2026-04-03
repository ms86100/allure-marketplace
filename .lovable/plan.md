

# Fix: Buyer Interaction Consistency + Preview Integrity

## 3 Targeted Changes

### 1. Preview CTA — Replace hardcoded "Add to cart" with dynamic label
**File**: `src/components/seller/ProductFormPreview.tsx`

- Add imports for `deriveActionType` and `ACTION_CONFIG` from `@/lib/marketplace-constants`
- At line 151, replace the hardcoded `Add to cart · {formatPrice(price)}` with:
  - `deriveActionType(formData.action_type, null)` → look up `ACTION_CONFIG[effectiveAction].label`
  - Render: `{ctaConfig.label} · {formatPrice(price)}`
- Add `console.warn` if `formData.action_type` is missing (dev safety)

### 2. Hide ActionTypeSelector during onboarding + enforce on save
**File**: `src/components/seller/DraftProductManager.tsx`

- **Line 606-612**: Wrap `ActionTypeSelector` in `{!defaultActionType && ( ... )}` — hides it when onboarding already set the value
- **Line 233**: Add enforcement before building `productData`:
  - If `defaultActionType` exists and differs from `newProduct.action_type`, log a warning and use `defaultActionType`
  - `const resolvedActionType = defaultActionType || newProduct.action_type || 'add_to_cart'`
  - Use `resolvedActionType` in the product payload

### 3. Seed `add_to_cart` into allowlists for hybrid service categories
**DB insert** (not migration — data only): Add `add_to_cart` to `category_allowed_action_types` for categories that can sell physical products alongside services (yoga, salon, bakery, wellness). Skip pure-service categories.

## What stays unchanged
- `deriveActionType` / `ACTION_CONFIG` in `marketplace-constants.ts` — already correct
- DB triggers — already action_type-driven
- Onboarding Step 3a interaction selector — already shows all modes
- `action_type` column is already `NOT NULL` in the products table

