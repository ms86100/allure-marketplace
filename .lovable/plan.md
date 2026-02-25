

## Audit: Subcategory ↔ Category Linkage Issues

### Root Cause Identified

**Problem 1: Newly created categories don't appear in the subcategory dropdown**

The `SubcategoryManager` uses `useCategoryConfigs()` (from `useCategoryBehavior.ts`) to populate the parent category dropdown. This hook:
- Filters by `is_active = true` — correct
- Has a **30-minute stale time** (line 106 of `useCategoryBehavior.ts`)
- Shares the `['category-configs']` query key with other consumers

When an admin creates a new category in `CategoryManager`, it writes directly to Supabase via `useCategoryManagerData.ts` but **never invalidates the `['category-configs']` React Query cache**. So the subcategory dropdown keeps showing the stale cached list until the 30-minute window expires or the page is hard-refreshed.

**Problem 2: Add form appears less complete than Edit form**

Both forms render the same fields. However, when the Add dialog opens with no parent category pre-selected (`createConfigId` is empty), the `Select` component shows an empty placeholder. If the user doesn't notice or doesn't have categories to pick from (because of Problem 1), the form feels broken. Additionally, the Edit dialog always has the parent pre-filled and non-editable, which makes it feel "more complete."

### Fix Plan

#### Fix 1 — Invalidate category cache after category CRUD (core fix)

In `useCategoryManagerData.ts`, after every successful category mutation (`saveNewCategory`, `saveEditedCategory`, `confirmDeleteCategory`, `toggleCategory`), call:

```ts
queryClient.invalidateQueries({ queryKey: ['category-configs'] });
```

This requires importing `useQueryClient` from `@tanstack/react-query` into the hook. After invalidation, any component using `useCategoryConfigs()` — including the subcategory dropdown — will immediately refetch and show the latest categories.

**Files changed:** `src/hooks/useCategoryManagerData.ts`

#### Fix 2 — Also invalidate after group mutations

Similarly, after `saveGroup`, `confirmDeleteGroup`, and `toggleGroup`, invalidate `['category-configs']` since group disabling cascades to categories.

**Files changed:** `src/hooks/useCategoryManagerData.ts`

#### Fix 3 — Add a manual refresh button on SubcategoryManager

As a safety net, add a small refresh icon next to the filter dropdown that calls `refetch()` on the configs query, so the admin can force-refresh categories without navigating away.

**Files changed:** `src/components/admin/SubcategoryManager.tsx`

#### Fix 4 — Surface `useCategoryConfigs` `refetch` in SubcategoryManager

Currently `SubcategoryManager` destructures only `configs` from `useCategoryConfigs()`. Update it to also grab `isLoading` and `refresh` so it can show loading state and trigger refresh.

**Files changed:** `src/components/admin/SubcategoryManager.tsx`

### What will NOT change
- No database schema changes
- No RLS policy changes
- No business logic changes
- All existing CRUD functionality remains intact
- Visual design stays as-is

### Summary
| Issue | Cause | Fix |
|-------|-------|-----|
| New categories missing from subcategory dropdown | 30-min React Query cache not invalidated | Invalidate `['category-configs']` after category mutations |
| Add form feels incomplete vs Edit | No parent pre-selected + stale dropdown | Cache fix + refresh button |

