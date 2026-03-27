

# Fix Search Autocomplete Category Click Navigation

## Problem

When you type "bakery" in the search bar, the autocomplete dropdown shows a "Categories → Bakery — Browse all bakery" suggestion. Clicking it navigates to `/search?category=bakery`, but SearchPage never reads the `category` query param — so nothing happens.

Meanwhile, `CategoryBrowseGrid` correctly links to `/category/:parentGroup?sub=:category`, which is the actual route that loads a filtered category page.

## Fix

One change in `SearchAutocomplete.tsx`:

1. Add `parentGroup` to the `CategoryMatch` interface
2. Populate it from `useCategoryConfigs` (which already has `c.parentGroup`)
3. Change the `onClick` from `navigate('/search?category=${cat.slug}')` to `navigate('/category/${cat.parentGroup}?sub=${cat.slug}')` — matching the existing pattern used everywhere else

## Files

| File | Change |
|------|--------|
| `src/components/search/SearchAutocomplete.tsx` | Add `parentGroup` to `CategoryMatch`, populate it, fix navigation URL |

