

# Fix: Remove All Remaining `layoutType === 'service'` Category Coupling

## Problem
Despite the approved plan, category-driven availability coupling remains in 4 files. Sellers choosing "Add to Cart" for a service category (e.g., Panchakarma) are still blocked by availability checks because the system checks `layoutType === 'service'` instead of the seller's chosen `action_type`.

## Exact Locations to Fix

### 1. `src/hooks/useSellerApplication.ts` (line 301) — THE BLOCKING BUG
**Current**: `if (groupInfo?.layoutType === 'service')` → blocks all service-category sellers from proceeding without slots.
**Fix**: Read `storeActionType` from the component prop (already passed from `BecomeSellerPage`). Look up `requires_availability` from `action_type_workflow_map` via the `allActions` data. Only block if `requires_availability === true`. If `storeActionType` is empty/missing, do NOT block (safe default — the DB trigger will catch invalid submissions).

### 2. `src/components/seller/DraftProductManager.tsx` (lines 55-59, 144, 361)
**Current**: `isServiceCategory()` checks `layoutType === 'service'` to control service field visibility and service_listings loading.
**Fix**: Replace with action_type-driven check. Use the product's `action_type` field: look up `requires_availability` from the `allActions` array (from `useActionTypeMap`, already imported). Show service fields when the product's action_type requires availability, not when the category says "service".

### 3. `src/hooks/useSellerProducts.ts` (lines 277, 316, 333-337)
**Current**: Same `isServiceCategory()` pattern controlling service listing upserts and `isCurrentCategoryService` flag.
**Fix**: Replace `isServiceCategory()` with a check on `formData.action_type` (the product's chosen action type). Look up `requires_availability` from `action_type_workflow_map`. Upsert service_listings only when the product's action_type requires it.

### 4. `src/pages/SellerSettingsPage.tsx` (line 377)
**Current**: `getGroupBySlug(primaryGroup)?.layoutType === 'service'` controls ServiceAvailabilityManager visibility.
**Fix**: Query seller's products to check if ANY has an action_type with `requires_availability = true`. Show availability manager with a label: "Manage availability for your bookable services". This correctly supports multi-mode stores.

## Key Design Rules
- **sessionStorage is UI convenience only** — never used in validation logic. If `storeActionType` is missing, the safe default is to NOT block (let DB trigger enforce at save time).
- **`action_type_workflow_map.requires_availability`** is the single source of truth for whether service fields/availability are needed.
- **No fallback to category** — if action_type is null/empty, show no service fields (don't guess from category).

## Files Changed
| File | Change |
|---|---|
| `src/hooks/useSellerApplication.ts` | Replace `layoutType === 'service'` with `requires_availability` lookup using passed `storeActionType` prop |
| `src/components/seller/DraftProductManager.tsx` | Replace `isServiceCategory()` with product action_type-driven `requires_availability` check |
| `src/hooks/useSellerProducts.ts` | Replace `isServiceCategory()` with action_type-driven check for service listing upsert |
| `src/pages/SellerSettingsPage.tsx` | Replace `layoutType === 'service'` with product-based availability check |

No database changes needed — DB trigger already uses `action_type_workflow_map` correctly.

