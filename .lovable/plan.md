

# Home & Category Pages — Premium Visual Redesign Plan

## Current State Assessment

The pages are functionally complete but visually flat. The entire experience is a monotone vertical stack of white cards with thin gray borders. There is no color depth, no visual rhythm, and no focal points that draw the eye. Compared to Swiggy, Blinkit, or Zepto, the pages lack:

1. **Color and gradient use** — Every section looks identical (white card, gray border). No section has visual weight or distinction.
2. **Hero/banner presence on home** — The `FeaturedBanners` carousel exists and is fully functional with 5 templates (image_only, text_overlay, split_left, gradient_cta, minimal_text), but it sits buried below category grids. If no banners are configured, there is zero visual anchor at the top.
3. **Section differentiation** — All sections (categories, products, stores, community) use the same visual language. Nothing stands out.
4. **Category grid visual density** — Cards with no product images show a tiny icon on a near-white background. Even cards with images lack visual pop due to minimal overlay contrast.
5. **Product card spacing** — Discovery rows and category product rows use identical 155px-wide cards in a single horizontal scroll with no variation.
6. **No visual breaks** — The page scrolls from section to section with no dividers, color blocks, or rhythm changes.

## What Exists but Is Underutilized

| Asset | Status | Gap |
|-------|--------|-----|
| `FeaturedBanners` with 5 templates | Renders after category grids | Should be the hero element at the top |
| `SocietyTrustStrip` | Rendered but visually subtle | Could be more prominent with stronger background |
| Category `color` field | Used only as faint 15% opacity tint on empty cards | Could drive section headers, card borders, icon backgrounds |
| `ParentGroupTabs` with icons | Rendered as plain pills | Could be icon-forward circular tabs like Swiggy/Zepto |
| Product `image_url` | Shown in 4:3 aspect with `object-contain p-2` | Whitespace padding makes images float; should be tighter |
| `CategoryImageGrid` collage | Works well with 2-4 images | Gradient overlay is weak; category name text needs more contrast |
| Seller `profile_image_url` | Tiny circle in a gray box | Should be larger with colored background fallback |

## Implementation Plan

### Step 1: Elevate ParentGroupTabs to Icon-Forward Circular Grid
**File:** `src/components/home/ParentGroupTabs.tsx`

Transform the horizontal pill tabs into a 2-row icon grid (like Swiggy's category circles at the top). Each tab becomes a circular icon with the category group's `color` as background tint, with the label below. This creates a strong visual anchor at the top of the home page.

- Use `DynamicIcon` at larger size (24px) inside a 48px circle
- Apply `color` field as background tint (20% opacity)
- Arrange in a scrollable row with `gap-4`, centered alignment
- Active state: filled primary ring around circle

### Step 2: Move FeaturedBanners to Top of Home
**File:** `src/pages/HomePage.tsx`

Reorder the home page layout:
1. ActiveOrderStrip (if active)
2. HomeNotificationBanner (if any)
3. **FeaturedBanners** (moved up — hero position)
4. SocietyTrustStrip
5. ParentGroupTabs (icon grid)
6. HomeSearchSuggestions
7. CategoryImageGrid sections
8. Discovery rows (Popular, New)
9. Product listings
10. ShopByStoreDiscovery
11. SocietyQuickLinks
12. ForYouSection
13. SocietyLeaderboard
14. CommunityTeaser

This ensures a colorful banner is the first visual element (when configured), immediately setting a premium tone.

### Step 3: Add Visual Depth to CategoryImageGrid Cards
**File:** `src/components/home/CategoryImageGrid.tsx`

- Strengthen the gradient overlay from `from-black/70 via-black/20` to `from-black/80 via-black/30 to-black/5` for better text legibility
- For empty-image cards: use the category `color` at 25% opacity as full background, with a large centered `DynamicIcon` (40px) — already partially done but icon is only 28px
- Add a subtle `shadow-md` on hover and a micro border-color transition using the category color
- Add a colored accent bar at the bottom of each card (2px height, category color) to break the monotone

### Step 4: Introduce Section Dividers with Colored Accents
**File:** `src/components/home/MarketplaceSection.tsx`

Between major sections (category grids → discovery rows → product listings → stores), add lightweight visual breaks:
- A thin gradient line (`h-px bg-gradient-to-r from-transparent via-border to-transparent`) with 16px vertical margin
- Section headers for discovery rows get a subtle colored background chip (using the section's contextual color — flame red for Popular, primary for New)

### Step 5: Enhance Product Card Image Area
**File:** `src/components/product/ProductListingCard.tsx`

- Change image display from `object-contain p-2` to `object-cover` — products should fill the frame for visual density
- Add a subtle bottom gradient to the image area (`from-transparent to-background/20`) so the ADD button has better contrast
- For placeholder emoji state: use a softer tinted background from the category config color instead of plain `bg-muted`

### Step 6: Polish Store Discovery Tiles
**File:** `src/components/home/ShopByStoreDiscovery.tsx`

- Increase seller tile width from `w-24` to `w-28` and image area from `h-16` to `h-20`
- For sellers without logos: generate a colored avatar using the first letter of their business name + a color derived from their ID (deterministic hash to color)
- Add an "Active now" green dot indicator for sellers whose `last_active_at` is within the last hour (data already available in the query)

### Step 7: Enhance Categories Page Visual Hierarchy
**File:** `src/pages/CategoriesPage.tsx`

- Add the category `color` as a left border accent (3px) on each category card
- Increase the section header pill from `bg-primary/10` to use the parent group's own color at 15% opacity for differentiation between groups
- Add a subtle background gradient on the sticky header (`bg-gradient-to-b from-background to-background/0`) for depth

### Step 8: Add Gentle Background Sections
**Files:** `src/pages/HomePage.tsx`, `src/components/home/MarketplaceSection.tsx`

Wrap alternating major sections in very subtle tinted backgrounds to create visual rhythm:
- Category grids: white (default)
- Discovery rows: `bg-secondary/30` wrapper
- Store discovery: `bg-primary/3` wrapper
- Leaderboard: `bg-secondary/50` wrapper

These are CSS-only changes using existing Tailwind tokens — no new colors or design tokens needed.

---

## Architecture Notes

- All colors come from existing DB fields (`color` on category configs, `bg_color` on featured_items)
- No hardcoded color values — all derived from data or Tailwind design tokens
- No new tables, RPCs, or features — purely visual enhancements using existing data
- All changes are backward-compatible — empty/null color fields fall back to current behavior
- Seller letter-avatar color is derived deterministically from seller ID (hash → hue rotation)

## Summary

| Step | Files | Impact |
|------|-------|--------|
| 1. Icon-forward ParentGroupTabs | ParentGroupTabs.tsx | High — creates visual anchor |
| 2. Move banners to hero position | HomePage.tsx | High — sets premium tone |
| 3. Category card visual depth | CategoryImageGrid.tsx | High — eliminates flat/empty feel |
| 4. Section dividers | MarketplaceSection.tsx | Medium — creates rhythm |
| 5. Product card image polish | ProductListingCard.tsx | Medium — visual density |
| 6. Store tile polish | ShopByStoreDiscovery.tsx | Medium — trust & activity signals |
| 7. Categories page hierarchy | CategoriesPage.tsx | Medium — differentiation |
| 8. Background sections | HomePage.tsx, MarketplaceSection.tsx | Low — visual rhythm |

