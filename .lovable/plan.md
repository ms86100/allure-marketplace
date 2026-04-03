

# Guided Subcategory Selection — Implementation Plan

## What We're Building

Replace the flat category toggle grid in Step 2 ("Specialize") with an interactive guided flow. Tapping a category opens a bottom sheet where sellers search, pick a primary specialty, and select secondaries. Selections are persisted and drive seller identity.

## Database Change

Add `subcategory_preferences jsonb DEFAULT '{}'` to `seller_profiles`.

Structure (versioned):
```json
{
  "v": 1,
  "data": {
    "<category_config_id>": { "primary": "<subcategory_id>", "others": ["id", ...] }
  }
}
```

## New Component: `SubcategoryPickerDialog.tsx`

A Sheet (bottom drawer) that opens when a category card is tapped:

- **Header**: Category icon + name
- **Search**: "What are you looking to sell?" — local filter with scoring:
  - Exact match → score 3, "⭐ Recommended" badge
  - Starts-with → score 2
  - Contains → score 1
  - Default (no search) → ordered by `display_order` from DB
- **Selection**: First tap = primary (star icon, radio-style). Subsequent = secondary (checkbox). Tap primary star to demote → first item in `others[]` promotes
- **Soft limit**: "Pick 1–5 to start". At 6+, amber warning
- **Identity feedback**: Bottom shows "You'll appear as: **Tiffin Provider**" based on primary subcategory via identity map with fallback to `"[Subcategory Name] Seller"`
- **Empty search**: "No matches — try a different term"
- **Zero selections + Done**: Closes dialog, deselects parent category
- **Done button**: Shows "X selected" count

### Identity Map (local constant)
```
daily_tiffin → "Tiffin Provider"
one_time_meals → "Home Meal Provider"
breakfast_items → "Breakfast Specialist"
cakes → "Home Baker"
traditional_sweets → "Sweet Maker"
fresh_juices → "Juice Bar"
pickles → "Homemade Specialty Seller"
party_catering → "Catering Service"
fallback → "[Subcategory Display Name] Seller"
```
(Uses subcategory slug derived from display_name for matching)

## Changes to `BecomeSellerPage.tsx` — Step 2

1. Remove inline `SubCategorySelector` component
2. Category cards (2-col grid) — each shows icon + name + selection count badge
3. Tap → opens `SubcategoryPickerDialog` for that category (fetches subcategories from DB)
4. Categories with zero subcategories → tap toggles directly (no dialog)
5. Below grid: removable chips for all selected subcategories (primary has ⭐ prefix)
6. **"Skip for now"** link below Continue — proceeds without subcategory detail
7. Continue enabled when ≥1 category selected (via subcategories or direct toggle)

## Changes to `useSellerApplication.ts`

1. Add `subcategory_preferences` to `SellerFormData` + `INITIAL_FORM` (default `{}`)
2. Auto-sync `formData.categories` from `subcategory_preferences` keys (category selected if it has any subcategory)
3. Deselecting a category clears its `subcategory_preferences` entry
4. `saveDraft` / `handleSubmit` include `subcategory_preferences` in payload
5. `loadSellerDataIntoForm` loads `subcategory_preferences` from DB
6. `handleGroupSelect` clears `subcategory_preferences` on group change

## New Hook: `useSubcategories.ts`

Simple query hook to fetch subcategories by `category_config_id` from the `subcategories` table, cached via react-query.

## Files Changed

| File | Change |
|------|--------|
| Migration | Add `subcategory_preferences jsonb` to `seller_profiles` |
| `src/components/seller/SubcategoryPickerDialog.tsx` | **NEW** — Sheet with search, scoring, multi-select, primary marker, identity label |
| `src/hooks/useSubcategories.ts` | **NEW** — Query hook for subcategories by category_config_id |
| `src/pages/BecomeSellerPage.tsx` | Replace `SubCategorySelector` with guided cards + chip review + skip |
| `src/hooks/useSellerApplication.ts` | Add `subcategory_preferences` to form state, sync, persist |

## Edge Cases Handled

| Case | Behavior |
|------|----------|
| No subcategories for a category | Direct toggle, no dialog |
| User selects nothing in dialog | Category deselected on close |
| 6+ selections | Amber warning, no hard block |
| Group change with existing selections | Confirm dialog, clear all |
| Skip clicked | Proceeds to step 3 with just parent categories |
| Primary demoted | First `others[]` item auto-promotes |
| Search returns nothing | Clear empty state message |

