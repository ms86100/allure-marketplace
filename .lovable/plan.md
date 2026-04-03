

# Festival Experience Engine — Production-Grade v2 (100% Bulletproof)

## Summary

Transform the static banner carousel into a multi-section, festival-aware commerce engine with full data safety, ranking, inventory awareness, geo-filtering, analytics, and graceful fallbacks. Builds on the approved architecture while closing all 10 production gaps.

---

## Database Changes

### Migration 1: Extend `featured_items` + Create New Tables

**Add columns to `featured_items`:**
- `banner_type` text NOT NULL DEFAULT `'classic'` — `'classic'` or `'festival'`
- `theme_preset` text — e.g. `'diwali'`, `'holi'`, `'ugadi'`, `'custom'`
- `theme_config` jsonb DEFAULT `'{}'` — `{bg, accent, gradient[], bg_image_url}`
- `animation_config` jsonb DEFAULT `'{"type":"none","intensity":"subtle"}'` — type: none/sparkle/glow/pulse/shimmer; intensity: subtle/medium/rich
- `cta_config` jsonb DEFAULT `'{"action":"link"}'` — `{action: 'link'|'collection'|'category', target: string}`
- `schedule_start` timestamptz — auto-activate
- `schedule_end` timestamptz — auto-deactivate
- `badge_text` text — overlay pill ("Festival Special", "Limited Time")
- `fallback_mode` text DEFAULT `'hide'` — what to do when sections have no products: `'hide'` (hide empty sections) | `'popular'` (show popular items instead)

**New table: `banner_sections`**
```
id uuid PK
banner_id uuid FK → featured_items ON DELETE CASCADE
title text NOT NULL
subtitle text
icon_emoji text
display_order int DEFAULT 0
product_source_type text NOT NULL DEFAULT 'category'  -- 'category' | 'search' | 'manual'
product_source_value text  -- category slug or search keyword
```

**New table: `banner_section_products`** (manual linking)
```
id uuid PK
section_id uuid FK → banner_sections ON DELETE CASCADE
product_id uuid FK → products ON DELETE CASCADE
display_order int DEFAULT 0
UNIQUE(section_id, product_id)
```

**New table: `banner_theme_presets`** (reference data, seeded)
```
id uuid PK
preset_key text UNIQUE NOT NULL
label text NOT NULL
icon_emoji text
colors jsonb NOT NULL
animation_defaults jsonb NOT NULL
suggested_sections jsonb NOT NULL  -- array of {title, emoji, source_type, source_value}
is_active boolean DEFAULT true
```

Seed ~8 presets: diwali, holi, ugadi, christmas, eid, navratri, flash_sale, new_arrivals — each with default colors, animation, and 3-5 suggested sections with category mappings.

**New table: `banner_analytics`** (lightweight event log)
```
id uuid PK DEFAULT gen_random_uuid()
banner_id uuid FK → featured_items
section_id uuid FK → banner_sections (nullable)
event_type text NOT NULL  -- 'impression' | 'section_click' | 'product_click'
product_id uuid (nullable)
user_id uuid (nullable)
created_at timestamptz DEFAULT now()
```
Index on `(banner_id, event_type, created_at)`. RLS: authenticated INSERT only, admin SELECT.

**RLS:** Public read on `featured_items`, `banner_sections`, `banner_section_products` (with `is_active` filter). Admin-only write on all. Realtime on `banner_sections`.

---

### Migration 2: Seed Theme Presets

Insert 8 preset rows with culturally accurate colors, animation defaults, and suggested sections. Example:
- **Diwali** 🪔: warm orange/gold gradient, sparkle animation, sections: Pooja Needs, Sweets, Festive Decor, Gift Hampers
- **Holi** 🎨: pink/purple/teal gradient, splash shimmer, sections: Colors & Gulal, Sweets, Party Essentials
- **Ugadi** 🌿: green/gold gradient, glow animation, sections: Pooja Items, Prasadam, Festive Specials

---

## New Files

### `src/lib/bannerProductResolver.ts`
Central function to resolve products for a section based on `product_source_type`:
- `category` → query products WHERE `category = value` AND `is_available = true` AND `stock_quantity > 0` AND `approval_status = 'approved'`, ORDER BY `is_bestseller DESC, is_recommended DESC, price ASC`, LIMIT 20
- `search` → query products using `search_vector @@ to_tsquery(value)` with same filters
- `manual` → fetch from `banner_section_products` joined with products, same availability/stock filters
- **Fallback logic**: if result is empty AND banner's `fallback_mode = 'popular'`, fetch top 10 bestseller products nearby
- **Geo filter**: always filter by seller availability in buyer's area (reuse existing marketplace seller proximity logic)

### `src/components/home/FestivalBannerModule.tsx`
Buyer-facing festival block:
- Themed gradient header with title, subtitle, badge pill, CSS animation class
- Horizontal scrollable section chips with emoji + title + product count hint (e.g. "12 items")
- Each chip shows 2-3 tiny product image thumbnails as preview (fetched from first 3 resolved products)
- "+N more" indicator on chips with >3 products
- Tapping a chip → navigates to `/festival-collection/{bannerId}/{sectionId}`
- **Empty section handling**: sections with 0 products are hidden (or show fallback based on `fallback_mode`)
- Tracks `impression` event on mount, `section_click` on tap

### `src/pages/FestivalCollectionPage.tsx`
Curated product list when buyer taps a section chip:
- Uses `bannerProductResolver` to fetch products
- Themed header (banner title + gradient from `theme_config`)
- Product grid using existing `ProductCard` component
- Stock awareness: out-of-stock items shown greyed at bottom with "Out of Stock" label
- "Only X left" badge for low-stock items
- Back navigation

### CSS Animations in `src/index.css`
5 lightweight keyframe animations (pure CSS, no libraries):
- `sparkle` — drifting radial gradient dots
- `glow` — pulsing box-shadow
- `shimmer` — sliding linear gradient
- `pulse` — gentle scale oscillation
- `confetti` — falling dot overlay

Each has 3 intensity variants (duration: subtle=4s, medium=2.5s, rich=1.5s). All disabled via `@media (prefers-reduced-motion: reduce)`.

---

## Modified Files

### `src/components/admin/AdminBannerManager.tsx` — Full Rebuild

Structured into sections with Smart Mode + Advanced Mode:

1. **Banner Type** — Classic (existing) vs Festival (new multi-section)
2. **Theme** (festival only) — Preset grid from `banner_theme_presets`. Picking a preset auto-fills colors, animation, and pre-populates section builder
3. **Content** — Title, subtitle, badge text, image URL
4. **Visuals** — Color palette (from preset, editable), animation type/intensity selectors
5. **Sections Builder** (festival only) — Add/remove/reorder sections. Each section: title, emoji, source type (category dropdown / search keyword / manual product picker). Product picker: debounced search against `products`, selected items as chips
6. **CTA** (classic only) — Link URL, button text (existing behavior)
7. **Scheduling** — Start/end date pickers, society scope, display order, auto-rotate, active toggle
8. **Live Preview** — Real-time preview at top of drawer
9. **Save Validation** — Before save: each festival section must resolve ≥1 product (async check). Warn if a section returns 0 products. Block save if banner has 0 valid sections

### `src/components/home/FeaturedBanners.tsx`

- Query adds schedule filter: `.or('schedule_start.is.null,schedule_start.lte.now()')` and same for `schedule_end`
- For `banner_type = 'festival'`: fetch associated `banner_sections` (separate query, cached)
- Render classic banners as today; festival banners via `FestivalBannerModule`
- **Default banner fallback**: if zero banners are active after filtering, show nothing (current behavior) — avoids "empty homepage" since other homepage sections still exist
- Track `impression` events (debounced, fire once per banner per session)

### `src/App.tsx`

Add lazy route: `/festival-collection/:bannerId/:sectionId` → `FestivalCollectionPage`

---

## Hardening Layer (Gaps 1-10 Fixed)

| Gap | Fix |
|---|---|
| 1. Zero-data fallback | `bannerProductResolver` returns fallback popular items when section is empty; UI hides sections with 0 products |
| 2. Ranking logic | Products ordered by: `is_available DESC, is_bestseller DESC, is_recommended DESC, price ASC` |
| 3. Inventory awareness | Filter `stock_quantity > 0` for available; show "Only X left" for low stock; out-of-stock greyed at bottom |
| 4. Geo/society context | Section product queries filter by sellers available in buyer's area (same radius logic as marketplace); banners scoped by `society_id` (existing) |
| 5. Load performance | Section chips show only 3 thumbnail previews (tiny images). Full product list loads only on navigation to collection page. No preloading |
| 6. Admin validation | Save blocked if festival banner has 0 sections returning products. Warning toast per empty section |
| 7. A/B testing | Not in scope for v1 — can be added later via `variant` column. Architecture supports it |
| 8. Analytics | `banner_analytics` table tracks impression, section_click, product_click. Admin can query for effectiveness |
| 9. Auto-expiry | `schedule_start/end` filtering. No active banners = homepage shows other sections normally (no empty state) |
| 10. Micro UX polish | Product thumbnail previews on chips, "+N more" indicators, "Only X left" badges, themed collection page headers |

---

## Backward Compatibility

- `banner_type` defaults to `'classic'` — all existing banners unchanged
- Classic banners render exactly as today with zero code path changes
- All new columns have defaults or are nullable
- Admin can still create classic banners (the first option in type selector)
- No changes to existing RLS policies — new policies are additive

---

## Performance

- Zero JS animation libraries — pure CSS keyframes only
- `prefers-reduced-motion` respected
- Product resolution is lazy (only on collection page navigation)
- Section chip thumbnails use `optimizedImageUrl` with width=80
- Analytics inserts are fire-and-forget (no await)
- Theme presets cached with 24h staleTime (tiny table)

