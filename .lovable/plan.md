

# Sociva Home Page — 20 Gaps Analysis (Current vs Blinkit-Grade)

Based on deep inspection of the actual codebase against the heuristic evaluation principles.

---

## Gap 1: Header is Too Tall — Pushes Content Below the Fold
**Current**: Header shows branding (22px), tagline, society name, location chip, AND search bar — consuming ~140px+ before any content appears.
**Fix**: Collapse tagline and society name into a single compact row. Move location chip inline with branding row. Reduce header vertical footprint by ~30%.
**File**: `src/components/layout/Header.tsx`

## Gap 2: No Greeting or Time-Context — Feels Impersonal
**Current**: Header shows static "Sociva" branding with no time awareness.
**Fix**: Replace static tagline with time-aware greeting: "Good morning, {firstName}" using `profile.name` and `new Date().getHours()`. DB-driven, not hardcoded.
**File**: `src/components/layout/Header.tsx`

## Gap 3: Category Grid Uses Aspect-[3/2] Image Cards — Too Heavy for Quick Entry
**Current**: `CategoryImageGrid` renders rich cards with image collages, gradient overlays, metadata rows (seller count, min price), bestseller stars. Each card is visually heavy.
**Fix**: Add a compact "pill grid" mode for the home page — smaller tiles (icon + label only) in a 3-4 column grid, reserving the rich cards for the dedicated `/categories` page. Use existing `ParentGroupTabs` data but render as a tighter grid when on home.
**File**: `src/components/home/CategoryImageGrid.tsx`

## Gap 4: ParentGroupTabs Scroll Horizontally — Not a Grid
**Current**: Category tabs are a horizontal scroll strip. Users must swipe to discover categories beyond the viewport.
**Fix**: When there are ≤8 parent groups, render as a wrap grid (2 rows × 4 cols) instead of horizontal scroll, so all categories are visible without swiping. Only fall back to scroll when >8.
**File**: `src/components/home/ParentGroupTabs.tsx`

## Gap 5: No "Order Again" Quick Action on Home
**Current**: `ReorderLastOrder` exists in `ForYouSection` but is buried after marketplace. Blinkit puts reorder at the top.
**Fix**: Move `ReorderLastOrder` above `MarketplaceSection` when the user has past orders. It's a 1-tap checkout accelerator — highest conversion surface.
**File**: `src/pages/HomePage.tsx`

## Gap 6: FeaturedBanners Take Full Width at 85vw — Competing with Categories
**Current**: Hero banners are 85vw wide, 144px tall. On mobile they dominate the first viewport.
**Fix**: Reduce banner height from `h-36` (144px) to `h-28` (112px). This recovers ~32px of vertical space, pushing categories into first viewport.
**File**: `src/components/home/FeaturedBanners.tsx`

## Gap 7: SocietyLeaderboard Has Podium Layout — Dashboard Feel
**Current**: Top 3 sellers shown in a "podium" arrangement with ranks, medals, ratings. Feels like an admin dashboard, not a shopping surface.
**Fix**: Simplify to a compact horizontal scroll of seller avatars with name + rating only. Remove podium elevation, rank numbers, and medal circles. Make each card tappable to the seller page.
**File**: `src/components/home/SocietyLeaderboard.tsx`

## Gap 8: CommunityTeaser Shows Bulletin Posts — Not Shopping-Related
**Current**: Community section shows recent bulletin posts with comment/vote counts. This is a social feature competing with shopping flow.
**Fix**: Wrap `CommunityTeaser` in a collapsible or reduce its visual weight significantly — smaller text, no card borders, single-line items. It should feel like a footer, not a section.
**File**: `src/components/home/CommunityTeaser.tsx`

## Gap 9: RecentlyViewedRow Uses aspect-square Images — Too Large
**Current**: Recently viewed cards have `aspect-square` images at 105px width — each card takes significant vertical space.
**Fix**: Reduce image to `aspect-[4/3]` and card width from 105px to 90px. This makes the row denser and more scannable.
**File**: `src/components/home/RecentlyViewedRow.tsx`

## Gap 10: No Search Results Preview on Home
**Current**: Search bar on home is just a link to `/search`. User must navigate away to see any results.
**Fix**: Add recent search terms (from `sessionStorage` or existing `useRecentSearches`) as small chips below the search bar — 1-tap to repeat a past search. No new backend needed.
**File**: `src/components/layout/Header.tsx`

## Gap 11: ActiveOrderStrip Uses Generic Package Icon — No Order Identity
**Current**: All active orders show the same `<Package>` icon regardless of order content.
**Fix**: Show the first product's thumbnail image in the strip instead of the generic icon. Data is already available via `order_items` join — just need to include `product:products(image_url)` in the query.
**File**: `src/components/home/ActiveOrderStrip.tsx`

## Gap 12: Discovery Rows (Popular/New) Lack "See All" Action
**Current**: `DiscoveryRow` shows products in a horizontal scroll but has no "See all" link to browse the full list.
**Fix**: Add a "See all →" link in the discovery row header that navigates to the relevant category page or a filtered view.
**File**: `src/components/home/MarketplaceSection.tsx`

## Gap 13: Product Listing Cards Show Too Much Metadata
**Current**: `ProductListingCard` shows: variant text, seller name, trust badge, activity label, on-time %, social proof, delivery time, lead time, preorder badge, price, MRP, price-per-unit, location — up to 8+ lines of info per card.
**Fix**: On the home page horizontal scroll context, hide secondary metadata (activity label, on-time badge, lead time, preorder badge, price-per-unit). Show only: image, name, price, ADD button. Add a `compact` prop to `ProductListingCard`.
**File**: `src/components/product/ProductListingCard.tsx`

## Gap 14: SocietyQuickLinks Are Horizontal Scroll — Hidden
**Current**: Society links (Visitors, Parking, Finances, etc.) are in a horizontal scroll strip. Users may not discover them.
**Fix**: Render as a 3-column compact grid (icon + label) instead of horizontal scroll when there are ≤6 links. More discoverable and scannable.
**File**: `src/components/home/SocietyQuickLinks.tsx`

## Gap 15: Leaderboard Background `bg-secondary/30` Creates Visual Break
**Current**: Leaderboard wrapped in `bg-secondary/30 py-4` — creates a visual "section break" that makes the page feel segmented like a dashboard.
**Fix**: Remove the background wrapper. Use only spacing (`mt-6`) to separate. Continuous scroll feel.
**File**: `src/pages/HomePage.tsx`

## Gap 16: No "What's Available Now" Indicator
**Current**: No signal on the home page about which stores/categories are currently open.
**Fix**: In `ParentGroupTabs`, show a tiny green dot on category icons that have at least one currently-open seller. Uses existing `seller_availability_start/end` data already fetched by `useProductsByCategory`.
**File**: `src/components/home/ParentGroupTabs.tsx`

## Gap 17: AutoHighlightStrip Cards Are 180px Wide — Too Large
**Current**: Auto-highlight cards (bestsellers, top sellers, deals) are 180px wide with 80px-tall image blocks. They dominate the hero area when no banners exist.
**Fix**: Reduce card width to 140px and image height to 56px. Tighter, more scannable strip that leaves room for categories in the first viewport.
**File**: `src/components/home/AutoHighlightStrip.tsx`

## Gap 18: ForYouSection Uses MutationObserver — Overcomplicated
**Current**: `ForYouSection` uses a `MutationObserver` + `useLayoutEffect` to detect if children rendered content. This is fragile and causes layout shifts.
**Fix**: Refactor to use a simpler pattern: each child component returns `null` when empty (they already do), and wrap in a container that uses CSS `:empty` or a simple children-count check. Removes observer overhead.
**File**: `src/components/home/ForYouSection.tsx`

## Gap 19: ShopByStoreDiscovery Section Has No Visual Cue
**Current**: Store discovery section header uses a tiny `text-[10px]` label. Easy to miss.
**Fix**: Increase header to match other section headers (`font-extrabold text-[15px]`) with a store icon. Consistent visual hierarchy with other sections.
**File**: `src/components/home/MarketplaceSection.tsx`

## Gap 20: Profile Completion Banner Takes Prime Real Estate
**Current**: Profile completion banner (`mx-4 mt-3`) appears at the very top before ActiveOrderStrip, consuming valuable first-viewport space for a non-shopping action.
**Fix**: Move profile completion banner below `MarketplaceSection` — it's important but not urgent enough to block the shopping flow. Or collapse it to a slim inline bar (single line) at the top.
**File**: `src/pages/HomePage.tsx`

---

## Implementation Priority

| Priority | Gaps | Impact |
|----------|------|--------|
| **High** (Speed perception) | #1, #4, #5, #6, #13, #20 | Reduces first-viewport clutter, surfaces shopping actions faster |
| **Medium** (Cognitive load) | #2, #3, #7, #8, #9, #14, #15 | Reduces visual competition, simplifies scanning |
| **Low** (Polish) | #10, #11, #12, #16, #17, #18, #19 | Refinements that improve discoverability and consistency |

## Constraints
- Zero backend changes
- Zero hardcoded/dummy data — all data from existing DB queries
- No flow breakage — all changes are additive layout/styling adjustments
- Existing component APIs preserved — changes are internal

## Files to Modify
| File | Gaps |
|------|------|
| `src/components/layout/Header.tsx` | #1, #2, #10 |
| `src/pages/HomePage.tsx` | #5, #15, #20 |
| `src/components/home/ParentGroupTabs.tsx` | #4, #16 |
| `src/components/home/CategoryImageGrid.tsx` | #3 |
| `src/components/home/FeaturedBanners.tsx` | #6 |
| `src/components/home/MarketplaceSection.tsx` | #12, #19 |
| `src/components/product/ProductListingCard.tsx` | #13 |
| `src/components/home/SocietyLeaderboard.tsx` | #7 |
| `src/components/home/CommunityTeaser.tsx` | #8 |
| `src/components/home/RecentlyViewedRow.tsx` | #9 |
| `src/components/home/SocietyQuickLinks.tsx` | #14 |
| `src/components/home/AutoHighlightStrip.tsx` | #17 |
| `src/components/home/ForYouSection.tsx` | #18 |
| `src/components/home/ActiveOrderStrip.tsx` | #11 |

