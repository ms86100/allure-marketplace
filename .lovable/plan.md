

# Festival Experience Engine — Implementation Audit

## Verified as IMPLEMENTED

| Feature | Status |
|---|---|
| `featured_items` extended (all 9 columns) | DONE |
| `banner_sections` table + schema | DONE |
| `banner_section_products` table + unique constraint | DONE |
| `banner_theme_presets` table + 8 presets seeded | DONE (diwali, holi, ugadi, christmas, eid, navratri, flash_sale, new_arrivals) |
| `banner_analytics` table + composite index | DONE |
| RLS on all 4 new tables (public read, admin write, auth INSERT on analytics) | DONE |
| `bannerProductResolver.ts` — category/search/manual/fallback | DONE |
| `FestivalBannerModule.tsx` — themed header, chips, thumbnails, +N more, navigation, impression/click tracking | DONE |
| `FestivalCollectionPage.tsx` — themed header, product grid, out-of-stock section, "Only X left" badge, discount badge, product_click analytics | DONE |
| Route `/festival-collection/:bannerId/:sectionId` in App.tsx | DONE |
| `AdminBannerManager.tsx` — type selector, preset grid, section builder, animation config, scheduling, fallback mode, live preview (festival + classic), reorder/add/remove sections, save validation | DONE |
| `FeaturedBanners.tsx` — schedule filtering, classic/festival split, section fetch, realtime subscription | DONE |
| CSS animations: sparkle, glow, shimmer, pulse + intensity modifiers (subtle/medium/rich) + `prefers-reduced-motion` | DONE |
| Backward compat: `banner_type` defaults to `classic`, all new columns nullable/defaulted | DONE |

---

## GAPS FOUND (6 items)

### Gap 1: Confetti animation MISSING

The plan specifies 5 CSS animations: sparkle, glow, shimmer, pulse, **confetti**. Only 4 were implemented. No `.banner-anim-confetti` class exists in `index.css`.

**Fix:** Add confetti keyframe animation to `src/index.css` (falling dot overlay pattern). Add `confetti` option to `ANIMATION_TYPES` in `AdminBannerManager.tsx`.

---

### Gap 2: `cta_config` not used anywhere in frontend

The `cta_config` column exists in DB and types, but NO component reads or writes it. The plan requires:
- Admin: CTA type selector (link / collection / category) for classic banners
- Buyer: `FeaturedBanners.tsx` should check `cta_config.action` to decide navigation (link vs collection vs category)

Currently classic banners only use `link_url` directly. The `cta_config` field is saved as default `{"action":"link"}` but never consumed.

**Fix:** 
1. Add CTA config selector to admin for classic banners (action type + target)
2. Update `FeaturedBanners.tsx` click handler to read `cta_config.action` and route accordingly

---

### Gap 3: No "product count hint" on section chips

Plan says chips should show "product count hint (e.g. 12 items)". The `FestivalBannerModule.tsx` chips show thumbnail images and "+N more" but NOT a total product count. The "+N more" only shows `previews.length - 3` (max 1 since limit=4), not the actual total count from DB.

**Fix:** Either fetch total count separately, or increase the limit query to get a proper count, or show `previews.length` as the count indicator.

---

### Gap 4: Geo/society filtering NOT implemented in `bannerProductResolver.ts`

Plan says: "Geo filter: always filter by seller availability in buyer's area". The resolver queries `products` directly with NO geo/seller-proximity filtering. It does not join with `seller_profiles` or apply Haversine distance checks.

**Fix:** Add seller proximity filtering to the resolver. This requires passing buyer coordinates and joining with `seller_profiles` to filter by delivery radius. Alternatively, this can be deferred since the collection page is a discovery feature and stock/availability is already filtered.

---

### Gap 5: Admin save validation does NOT async-check product count

Plan says: "Before save: each festival section must resolve >=1 product (async check). Warn if a section returns 0 products. Block save if banner has 0 valid sections."

Current validation only checks:
- At least 1 section exists
- All sections have titles

It does NOT call `resolveProducts` to verify sections actually return products.

**Fix:** In `handleSave`, before calling `saveMutation.mutate`, run `resolveProducts` for each section. Show warning toasts for empty sections. Block save if ALL sections are empty.

---

### Gap 6: `banner_analytics` INSERT will fail for unauthenticated users

RLS policy for `banner_analytics` INSERT requires `authenticated` role (`with_check: true`). But `FestivalBannerModule.tsx` and `FestivalCollectionPage.tsx` set `user_id: null` in analytics inserts. If the user is not logged in, the INSERT will silently fail (fire-and-forget). The route IS behind `ProtectedRoute`, so this is likely fine for collection page, but `FestivalBannerModule` renders on the home page which may or may not require auth.

**Fix:** Verify home page requires auth (it likely does based on the app structure). If not, either make analytics INSERT policy allow `anon` role, or wrap analytics calls in an auth check.

---

## Implementation Plan for Gaps

### Step 1: Add confetti animation to `src/index.css`
Add `.banner-anim-confetti` with falling-dot CSS animation. Add to `prefers-reduced-motion` block. Add `{ value: 'confetti', label: '🎊 Confetti' }` to `ANIMATION_TYPES` in AdminBannerManager.

### Step 2: Wire `cta_config` in admin and buyer
- AdminBannerManager: Add CTA action selector (link/collection/category) for classic banners, save to `cta_config`
- FeaturedBanners: Read `cta_config.action` on click — `'link'` uses `link_url`, `'category'` navigates to category page, `'collection'` navigates to `/banner-collection/:id`

### Step 3: Fix product count on chips
Change `FestivalBannerModule` chip to show total count from `previews.length` (increase limit from 4 to 20 to get accurate count, only render first 3 thumbnails).

### Step 4: Add admin async product validation
In `handleSave`, before save, resolve products for each festival section. Show per-section warnings. Block if all empty.

### Step 5: Geo filtering (deferred or lightweight)
Add optional buyer coordinate params to `resolveProducts`. If not provided, skip geo filter (current behavior). When available, join with seller_profiles for proximity check.

