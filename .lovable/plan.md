

# Fix Product Card Inconsistency, Edge Spacing, and Banner Contrast

## Problems Identified

1. **Card size inconsistency in "Popular near you"**: Cards with images and cards without images render at different effective heights. The `aspect-square` on compact mode works for the image area, but the content section below varies in height based on product name length, seller name, discount badges, etc. This makes cards in the same row look jagged.

2. **Cards touching browser window edges on desktop**: The discovery rows use `px-4` (16px) padding which is fine for mobile but too thin on wide desktop screens. The entire marketplace has no `max-width` container, so on 1300px+ screens everything stretches edge-to-edge.

3. **Diwali banner: yellow gradient with invisible text**: The banner uses white text (`text-white`) on a bright yellow/amber gradient. The subtitle uses `text-white/85`. On bright yellow backgrounds, white text has extremely poor contrast, making it unreadable.

## Changes

### 1. Enforce uniform card height in discovery rows

**File: `src/components/product/ProductListingCard.tsx`**
- Add `h-full` to the root `motion.div` so flex stretch works properly
- Ensure the content section uses `flex-1` + `justify-between` to push the price/name to top and action area to bottom, creating uniform visual alignment across cards in a row

### 2. Cap marketplace width on desktop

**File: `src/components/home/MarketplaceSection.tsx`**
- Wrap the entire marketplace content in a `max-w-2xl mx-auto` (or `max-w-xl`) container so on desktop the content stays centered and doesn't stretch to browser edges
- This is a mobile-first app — on desktop it should look like a phone-width centered column, not a sprawling full-width layout

### 3. Fix Diwali banner text contrast

**File: `src/components/home/FestivalBannerModule.tsx`**
- Compute a contrast-aware text color: if the gradient's dominant color is light (high luminance), use dark text instead of white
- Add a helper that checks perceived brightness of the accent/gradient colors
- For the title: use `text-black/90` on light gradients, `text-white` on dark ones
- For the subtitle: same logic with slightly lower opacity
- For the badge: ensure it's readable against its background

### 4. Tighten card gap consistency in discovery rows

**File: `src/components/home/MarketplaceSection.tsx` (DiscoveryRow)**
- Ensure all cards in the flex row use `items-stretch` (already present) and each card wrapper uses `flex` so the card fills the full height of the tallest sibling

## Scope
- 3 files modified
- No database changes
- No new dependencies
- Pure visual/layout fixes

