

# Implementation: Add Product Flow Hardening + Store Action Type Consistency

## Overview

Three layers of changes: database schema + trigger, onboarding persistence, and frontend enforcement in the Add Product flow.

---

## 1. Database Migration

### 1a. Add `default_action_type` column to `seller_profiles`

```sql
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS default_action_type text;
```

### 1b. Safe backfill — only for sellers with a single consistent action_type

```sql
UPDATE seller_profiles sp
SET default_action_type = sub.action_type
FROM (
  SELECT seller_id, MIN(action_type) AS action_type
  FROM products
  GROUP BY seller_id
  HAVING COUNT(DISTINCT action_type) = 1
) sub
WHERE sp.id = sub.seller_id
AND sp.default_action_type IS NULL;
```

Mixed-mode sellers get NULL — they must choose manually on next product add.

### 1c. Store-level validation trigger (covers INSERT, UPDATE of action_type OR seller_id)

```sql
CREATE OR REPLACE FUNCTION public.validate_product_store_action_type()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _store_default text;
  _store_checkout_mode text;
  _product_checkout_mode text;
BEGIN
  SELECT default_action_type INTO _store_default
  FROM public.seller_profiles WHERE id = NEW.seller_id;

  IF _store_default IS NULL THEN RETURN NEW; END IF;

  SELECT checkout_mode INTO _store_checkout_mode
  FROM public.action_type_workflow_map WHERE action_type = _store_default;

  SELECT checkout_mode INTO _product_checkout_mode
  FROM public.action_type_workflow_map WHERE action_type = NEW.action_type;

  IF _store_checkout_mode IS DISTINCT FROM _product_checkout_mode THEN
    RAISE EXCEPTION 'Product action_type "%" conflicts with store default "%". Checkout modes must match.',
      NEW.action_type, _store_default;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_product_store_action_type
  BEFORE INSERT OR UPDATE OF action_type, seller_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_store_action_type();
```

Key: trigger fires on `seller_id` change too, closing the reassignment edge case.

---

## 2. Onboarding — Persist `storeActionType` to DB

**File**: `src/pages/BecomeSellerPage.tsx`

Where the seller profile is created/updated (the upsert call during onboarding submission), add `default_action_type: storeActionType` to the payload. This replaces the sessionStorage-only approach as the source of truth.

SessionStorage remains for in-progress onboarding UX — but the DB write makes it permanent.

---

## 3. Frontend — `useSellerProducts.ts` Changes

### 3a. Default `action_type` from store profile

In `resetForm()`, replace the hardcoded `'add_to_cart'` default:

```typescript
const defaultActionType = (sellerProfile as any)?.default_action_type || 'add_to_cart';
setFormData({ ...INITIAL_FORM, category: defaultCategory, action_type: defaultActionType });
```

### 3b. Pre-submission validation guard in `handleSave()`

Before the DB call, add checkout_mode validation:

```typescript
if ((sellerProfile as any)?.default_action_type) {
  const storeAction = allActions.find(a => a.action_type === (sellerProfile as any).default_action_type);
  const productAction = allActions.find(a => a.action_type === formData.action_type);
  if (storeAction && productAction && storeAction.checkout_mode !== productAction.checkout_mode) {
    toast.error("This product type doesn't match your store configuration");
    setIsSaving(false);
    return;
  }
}
```

### 3c. Expose `storeDefaultActionType` in return value

Add to the return object so the UI can use it to lock/constrain the action type selector.

---

## 4. UI — Action Type Selector Constraint

**File**: `src/pages/SellerProductsPage.tsx`

In the action type `<Select>` (lines 85-98), filter options to only show action types sharing the same `checkout_mode` as the store's `default_action_type`. If there's only one valid option, show it as a read-only badge instead of a dropdown.

---

## Execution Order

1. DB migration (column + trigger)
2. Data backfill (safe, single-action-type sellers only)
3. Onboarding persistence (`BecomeSellerPage.tsx`)
4. Hook updates (`useSellerProducts.ts`)
5. UI constraint (`SellerProductsPage.tsx`)

## What stays unchanged
- `DraftProductManager` (onboarding product flow) — already correct
- Existing category↔action_type triggers — already enforced
- `ActionTypeSelector` component — reused as-is
- RLS policies — unaffected
- `action_type_workflow_map` / `category_allowed_action_types` tables — already correct

