

# Fix: "therapy" Search Not Showing Ayurveda Results

## Root Cause

The search index in `CategorySearchPicker.tsx` has a structural gap: **when a category has subcategories, only the subcategory items are added to the index — the category itself is skipped** (line 176: `if (configSubs.length === 0)`).

This means `ALIAS_MAP['ayurveda']` (which contains `'therapy'`) is **never checked**, because no search index item has `slug: 'ayurveda'`. The ayurveda subcategories like "Nasya Therapy" and "Rejuvenation Therapy" should match on name contains, but their individual alias entries don't include the generic term "therapy".

Additionally, the same problem affects **every category with subcategories** — category-level aliases are invisible to search.

## Fix (1 file)

### `src/components/seller/CategorySearchPicker.tsx`

**Change 1: Always add a category-level item to the search index**, even when subcategories exist. Mark it with `hasSubcategories: true` so tapping it opens the subcategory picker.

Replace the current logic (lines 149-194) that only adds a category item when `configSubs.length === 0`:

```text
// BEFORE: category item only added when NO subcategories
if (configSubs.length === 0) {
  items.push({ type: 'category', ... });
}

// AFTER: always add category item (for alias matching)
items.push({
  type: 'category',
  slug: config.category,        // e.g. 'ayurveda' → matches ALIAS_MAP
  name: config.displayName,     // e.g. 'Ayurveda & Wellness'
  hasSubcategories: configSubs.length > 0,
  ...
});
```

This ensures that typing "therapy" will match `ALIAS_MAP['ayurveda']` → score 2 (exact alias match) → Ayurveda appears in results.

**Change 2: Deduplicate results** — when both a category AND its subcategories match, show the category result (which opens the subcategory picker) and suppress individual subcategory results below a score threshold to avoid clutter. If a subcategory scores higher than its parent category, show the subcategory instead.

**Change 3: Add "therapy" to more subcategory aliases** as a safety net:
- `nasya_therapy`: add `'therapy'`
- `panchakarma_rejuvenation`: add `'therapy'`, `'rejuvenation'`
- `basti_therapy`: add `'therapy'`

## Result

Typing "therapy" will show:
1. **Ayurveda & Wellness** (Personal Care) — score 2 via alias exact match
2. **Nasya Therapy**, **Rejuvenation Therapy**, etc. — score 1 via name contains
3. **Yoga** — score 1 via alias "yoga therapy" contains

