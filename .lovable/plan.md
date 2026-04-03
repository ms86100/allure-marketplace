

# Final Bulletproof Fixes — Close Last 2 Gaps + 2 UX Improvements

## Current State (What's Already Done)
- `action_type_workflow_map` with `requires_availability` column ✅
- DB triggers validate action_type on INSERT and UPDATE ✅
- `category_allowed_action_types` table exists with RLS ✅
- `ActionTypeSelector` component exists ✅
- Trigger sets default from `category_config.default_action_type` on INSERT if null ✅

## What's Missing (4 Items)

### 🚨 Fix 1: DB-Level Availability Enforcement (Critical)

**Problem**: A product with `action_type = 'book'` can be saved without any availability schedule. This breaks the booking flow silently.

**Fix**: Add a validation trigger on `products` that checks — on INSERT and UPDATE — if the `action_type` has `requires_availability = true` in `action_type_workflow_map`, then at least one row must exist in `service_availability_schedules` for that product's seller. This runs as a **deferred constraint trigger** (fires at end of transaction) so the product and schedule can be inserted in the same transaction.

### 🚨 Fix 2: Safe Fallback for Empty Category Allowlists

**Problem**: If `category_allowed_action_types` has no rows for a category, the `ActionTypeSelector` hook returns `null`, and the existing `useMemo` in `ActionTypeSelector.tsx` already falls back to showing all options. However, there's no warning logged.

**Fix**: In `useCategoryAllowedActions` hook, when the query returns an empty array for a configured category, log a `console.warn`. No UI change needed — the fallback already works correctly in the component's `useMemo`.

### ⚠️ Fix 3: Persist Step 3 Action Type Choice Across Refresh

**Problem**: If seller picks an interaction mode in Step 3 then refreshes, selection is lost.

**Fix**: Use `sessionStorage` to persist `storeActionType` during onboarding. Read on mount, clear on submission. This uses the existing `useProductFormDraft` utilities pattern.

### ⚠️ Fix 4: Multi-Mode Clarity + Always-Visible Selector

**Problem**: `ActionTypeSelector` returns `null` when `options.length <= 1` (line 39). Seller can't see or override the selection. Also no message about mixing modes.

**Fix**: 
- Remove the `if (options.length <= 1) return null` early return — always render the selector
- Add helper text below: "You can set different interaction types for each product"
- In Step 3 of onboarding, add an "Interaction Mode" chooser that reads from `action_type_workflow_map` and uses `requires_availability` to conditionally show `ServiceAvailabilityManager` (replacing the hardcoded `layoutType === 'service'` check on line 682)

## Implementation Details

### DB Migration
```sql
-- Deferred constraint trigger: ensure availability exists for booking-type products
CREATE OR REPLACE FUNCTION public.validate_product_availability()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _requires boolean;
BEGIN
  SELECT requires_availability INTO _requires
  FROM public.action_type_workflow_map
  WHERE action_type = NEW.action_type;

  IF _requires = true AND NOT EXISTS (
    SELECT 1 FROM public.service_availability_schedules
    WHERE seller_id = NEW.seller_id
  ) THEN
    RAISE EXCEPTION 'action_type "%" requires availability schedules to be configured', NEW.action_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_validate_product_availability
  AFTER INSERT OR UPDATE ON public.products
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_availability();
```

### Frontend Changes

| File | Change |
|---|---|
| `src/pages/BecomeSellerPage.tsx` | Add interaction mode selector in Step 3 using `useActionTypeMap`; replace `layoutType === 'service'` with `requires_availability` lookup; persist choice in `sessionStorage`; pass `defaultActionType` to `DraftProductManager` |
| `src/components/seller/ActionTypeSelector.tsx` | Remove `if (options.length <= 1) return null`; add "You can set different interaction types for each product" helper text |
| `src/components/seller/DraftProductManager.tsx` | Accept `defaultActionType` prop; use it instead of hardcoded `'add_to_cart'` in `resetForm` (line 414) and product payload fallback (line 229) |
| `src/hooks/useActionTypeMap.ts` | Add `console.warn` in `useCategoryAllowedActions` when result is empty array for a valid config ID |

### Seed Data (category_allowed_action_types)
Insert allowlists for key categories so filtering activates:
- Food categories → `add_to_cart`, `buy_now`
- Service categories (yoga, ayurveda, salon) → `book`, `contact_seller`, `request_service`
- Rental categories → `book`, `request_quote`
- Professional services → `request_quote`, `contact_seller`

