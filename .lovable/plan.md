

## Dynamic Festival Merchandising System — Completion Plan

### What Already Exists (No Rebuild Needed)
- **DB schema**: `featured_items` extended with `banner_type='festival'`, `theme_config`, `animation_config`, `schedule_start/end`, `badge_text`, `fallback_mode` + `banner_sections`, `banner_section_products`, `banner_theme_presets`, `banner_analytics` tables with full RLS
- **Eligibility RPC**: `resolve_banner_products` with haversine distance checks, seller verification, society filtering, delivery radius enforcement
- **Admin Banner Manager**: 993-line `AdminBannerManager.tsx` with festival creation, section management, theme config, animation config, scheduling, society targeting, and preview
- **Buyer UI**: `FestivalBannerModule` (animated banner cards with section chips), `FestivalCollectionPage` (product grid with themed header), `FeaturedBanners` (auto-carousel + festival rendering)
- **Product resolver**: `bannerProductResolver.ts` with society-aware RPC calls, manual/category/search modes, fallback logic
- **CSS animations**: Full animation suite (banner entrance, orbs, text reveal, badge pop, chip entrance, emoji float)

### What's Missing (Scope of This Work)

**1. Migrate festival animations from CSS to Framer Motion**
- Replace CSS keyframe classes (`festival-banner-enter`, `festival-text-reveal`, `festival-peek-pop`, `festival-chip-enter`, etc.) with Framer Motion variants from `src/lib/motion-variants.ts`
- Use `AnimatePresence` for section transitions
- Apply `staggerContainer` + `cardEntrance` for product grids
- Add `scalePress` to all tappable elements (section chips, product cards)
- Keep CSS orb floats (GPU-efficient ambient animation) but convert entrance/interaction animations to Framer Motion

**2. Schedule filtering (exists in DB, disabled in code)**
- Uncomment and implement `schedule_start`/`schedule_end` filtering in `FeaturedBanners.tsx` query so expired festivals auto-hide
- Add visual indicator for upcoming (not-yet-active) festivals in admin

**3. Seed theme presets (table exists, 0 rows)**
- Insert preset data: Diwali (golds/oranges, sparkle), Holi (rainbow gradient, confetti), Christmas (red/green, shimmer), Eid (emerald/gold, glow), Ugadi (yellow/green, pulse), Generic Sale (brand colors, none)
- Wire preset selection in admin to auto-populate `theme_config` and `animation_config`

**4. Seller festival opt-in**
- New table: `festival_seller_participation` (banner_id, seller_id, opted_in, created_at)
- Seller Settings page: show active festivals with toggle to opt-in/out
- Modify `resolve_banner_products` RPC to check participation (if festival has participation records, only include opted-in sellers; if none, include all eligible sellers — backward compatible)

**5. Edge case handling**
- Empty state: When no eligible products exist for a festival section, show graceful empty state instead of hiding
- Expired festival: Auto-filter in query + show "Ended" badge in admin
- Overlapping festivals: Already supported (multiple festival banners render independently)

**6. FestivalCollectionPage Framer Motion upgrade**
- Product grid: staggered entrance animations
- Product cards: `whileTap` scale, `whileHover` lift
- Header: slide-down entrance
- Skeleton loaders: shimmer-to-content transition

### Files to Create
- `src/components/seller/SellerFestivalParticipation.tsx` — Seller opt-in UI

### Files to Modify
- `src/components/home/FestivalBannerModule.tsx` — CSS → Framer Motion
- `src/pages/FestivalCollectionPage.tsx` — CSS → Framer Motion + empty states
- `src/components/home/FeaturedBanners.tsx` — Enable schedule filtering
- `src/components/admin/AdminBannerManager.tsx` — Preset auto-populate + participation view
- `src/pages/SellerSettingsPage.tsx` — Add festival participation section
- `src/index.css` — Remove replaced CSS keyframes (keep orb floats)

### Migration
- Create `festival_seller_participation` table with RLS
- Insert theme preset seed data into `banner_theme_presets`

### Technical Details
- Framer Motion is already installed and used throughout the app (AdminPage imports it)
- Motion variants already defined in `src/lib/motion-variants.ts` (staggerContainer, cardEntrance, scalePress, buttonPress, fadeIn, slideUp, etc.)
- No new dependencies needed
- Seller participation is opt-in only when participation records exist for a festival — zero-config backward compatibility

