

# World-Class Home UX — Production-Grade Implementation Plan

## Current State Assessment

The previous performance optimization already achieved:
- Shell renders instantly (no profile gate)
- `LazySection` defers below-fold content
- Social proof deferred by 2 seconds
- Marketplace data prefetched in AuthProvider

**What's missing for Blinkit/Swiggy-level UX:**

1. **No structured above-fold skeletons** — sections just appear when data arrives, causing layout shift
2. **Section ordering is wrong** — ActiveOrderStrip + WelcomeBackStrip fire queries that block above-fold space before categories appear
3. **MarketplaceSection renders all-or-nothing** — categories, banners, discovery rows all wait together
4. **No progressive reveal animations** — content just pops in
5. **FeaturedBanners shows skeleton while loading** — but it's sized wrong, causing CLS

## Plan

### 1. Reorder above-fold for instant value
**File:** `src/pages/HomePage.tsx`

Current order: ActiveOrderStrip → WelcomeBackStrip → NotificationBanner → MarketplaceSection

New order:
```
P0 (instant):    Header + Search (already done)
P1 (< 500ms):   ParentGroupTabs + FeaturedBanners (move OUT of MarketplaceSection into HomePage directly)
P2 (< 1.5s):    CategoryImageGrid + Discovery rows
P3 (deferred):  ActiveOrderStrip, WelcomeBackStrip, BuyAgain, ForYou, etc.
```

Move `ActiveOrderStrip` and `WelcomeBackStrip` below the marketplace content — they're important but not the first thing users need to see. Categories and products are.

### 2. Add structured skeleton placeholders for P1/P2 zones
**File:** `src/pages/HomePage.tsx`

Add inline skeleton components that match the exact layout of:
- Category tabs: 4-column icon grid (already exists in `ParentGroupTabs`)
- Banner: single full-width rounded rectangle
- Category grid: 3x2 grid of rounded cards

These render immediately with zero data dependency, then get replaced progressively.

### 3. Break MarketplaceSection into independently-loading pieces
**File:** `src/components/home/MarketplaceSection.tsx`

Currently one monolithic component. Split into:
- `FeaturedBanners` + `AutoHighlightStrip` → render independently (already separate, just need to not block each other)
- `ParentGroupTabs` → render independently with its own skeleton
- `CategoryImageGrid` blocks → render each group independently
- `DiscoveryRows` (Popular + New) → render as a deferred block

Each section shows its own skeleton → replaces with content. No section blocks another.

### 4. Add smooth fade-in transitions for progressive content
**Files:** `src/components/home/MarketplaceSection.tsx`, `src/pages/HomePage.tsx`

Wrap data-dependent sections in a simple fade-in animation (opacity 0→1, translateY 4px→0, 200ms) when they load. This makes progressive rendering feel intentional rather than janky.

### 5. Move ActiveOrderStrip to a sticky notification bar pattern
**File:** `src/pages/HomePage.tsx`

Instead of taking up above-fold space and blocking categories, show active orders as a compact sticky bar at the top (below header) that slides in after a 500ms delay. This follows Swiggy's pattern where the order tracker doesn't displace the browse experience.

### 6. Ensure FeaturedBanners has fixed aspect-ratio skeleton
**File:** `src/components/home/FeaturedBanners.tsx`

The banner skeleton must match the actual banner's aspect ratio to prevent Cumulative Layout Shift. Use `aspect-[2.5/1]` on the skeleton container.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/HomePage.tsx` | Reorder sections: P1 content first, defer ActiveOrderStrip/WelcomeBack; add structured skeletons |
| `src/components/home/MarketplaceSection.tsx` | Progressive rendering — each sub-section independent with fade-in |
| `src/components/home/FeaturedBanners.tsx` | Fixed-ratio skeleton to prevent CLS |
| `src/components/home/ActiveOrderStrip.tsx` | Compact sticky variant with delayed appearance |

## Expected Timeline

```text
0ms     → Header + Search + Bottom Nav visible
100ms   → Category tab skeletons visible
300ms   → Category tabs populate (cached/prefetched)
500ms   → Banner loads, category grids start appearing
1000ms  → Product grids fully populated
1200ms  → Discovery rows fade in
1500ms  → Active orders slide in, deferred sections load
```

## Risk Controls
- No data flow changes — same queries, same hooks, same RPC
- Skeletons match exact layout dimensions — zero CLS
- ActiveOrderStrip still renders, just delayed — no missed orders
- Progressive fade-in is CSS-only, no re-render overhead

