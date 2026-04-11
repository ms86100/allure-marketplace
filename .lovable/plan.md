

## Bulletproof Fix: All 5 Remaining Issues

### Issue 1: Duplicate `return filtered` in FeaturedBanners.tsx (BUG)
**File:** `src/components/home/FeaturedBanners.tsx` line 69
**Fix:** Delete the duplicate `return filtered;` on line 69. Only line 68 should remain.

### Issue 2: Preset Search Doesn't Match `suggested_sections` Titles
**File:** `src/components/admin/AdminBannerManager.tsx` lines 528-531
**Fix:** Extend the filter function to also search inside `suggested_sections` array titles. When admin types "diya", it should match Diwali because its `suggested_sections` contains "Diyas & Candles".

```
Current:  p.label?.toLowerCase().includes(q) || p.preset_key?.toLowerCase().includes(q)
New:      also check if any entry in p.suggested_sections[].title matches q
```

### Issue 3: Auto-Suggest Presets When Typing Festival Title
**File:** `src/components/admin/AdminBannerManager.tsx` around line 596
**Fix:** Add a dropdown suggestion list below the Title input field for festival banners. When admin types in the title (e.g., "Diw"), fuzzy-match against all 199 presets by label. Show top 5 matches as clickable buttons. Clicking a suggestion calls `applyPreset()` and fills everything automatically. Uses a debounced match with `useMemo` — no extra state needed beyond what exists.

### Issue 4: Theme Tags Input Field
**File:** `src/components/admin/AdminBannerManager.tsx` after the preset picker section (~line 547)
**Fix:** Add a tag input component that reads/writes `form.theme_config.theme_tags[]`. When a preset is applied, pre-populate tags from `suggested_sections[].title` values. Admin can add/remove tags freely. Tags are stored as part of `theme_config` JSON — no schema change needed. Implementation: simple input + Enter to add, X buttons to remove, rendered as Badge chips.

### Issue 5: RPC `resolve_banner_products` Must Check Seller Participation
**Migration:** Update the `resolve_banner_products` function to add a participation check.

**Logic (backward-compatible):**
1. Accept new optional parameter `p_banner_id uuid DEFAULT NULL`
2. If `p_banner_id` is provided, check if `festival_seller_participation` has ANY rows for that banner
3. If rows exist → only include sellers who have `opted_in = true`
4. If no rows exist → include all eligible sellers (current behavior preserved)

```sql
-- Add to WHERE clause:
AND (
  p_banner_id IS NULL
  OR NOT EXISTS (SELECT 1 FROM festival_seller_participation WHERE banner_id = p_banner_id)
  OR EXISTS (SELECT 1 FROM festival_seller_participation WHERE banner_id = p_banner_id AND seller_id = sp.id AND opted_in = true)
)
```

Also update `bannerProductResolver.ts` to pass `bannerId` through to the RPC when available.

### Files Changed
| File | Change |
|------|--------|
| `src/components/home/FeaturedBanners.tsx` | Remove duplicate return (line 69) |
| `src/components/admin/AdminBannerManager.tsx` | Enhanced preset search, title auto-suggest, theme tags input |
| `src/lib/bannerProductResolver.ts` | Pass `bannerId` to RPC |
| Migration SQL | Update `resolve_banner_products` with `p_banner_id` param + participation filter |

### No New Dependencies
All changes use existing libraries (Framer Motion, React, Supabase client).

