

# Home Page Performance Optimization — Bulletproof Plan

## Root Cause Analysis

The home page currently takes 5–7 seconds because of a **4-level waterfall** where each step blocks the next:

```text
Auth session restore (~800ms)
  → fetchProfile RPC (~600ms)
    → BrowsingLocation resolves (needs profile.society_id) (~100ms)
      → useMarketplaceData RPC (needs lat/lng) (~1500ms)
        → All child components render (CategoryImageGrid, DiscoveryRows, etc.)
```

On top of this waterfall, multiple independent queries fire **only after** the marketplace RPC completes:
- `AutoHighlightStrip`: 3 parallel Supabase queries (products, sellers, coupons)
- `BuyAgainRow`: RPC `get_user_frequent_products`
- `ActiveOrderStrip`: orders query + status flow query (sequential — waits for `getTerminalStatuses()`)
- `WelcomeBackStrip`: orders query
- `FeaturedBanners`: featured_items query
- `useSocialProof`: RPC `get_society_order_stats` (waits for ALL product IDs from marketplace data)
- `useMarketplaceConfig` / `useMarketplaceLabels`: system_settings query

**The full-page skeleton gate** (`if (!profile) return skeleton`) means nothing renders until the entire auth chain completes — ~1.4 seconds of blank screen before a single query even starts.

## Plan

### 1. Break the full-page profile gate
**File:** `src/pages/HomePage.tsx`

Instead of returning a full skeleton when `profile` is null, render the AppLayout immediately with above-fold skeleton placeholders **inside** the real layout. This lets the shell (bottom nav, header) paint instantly. The MarketplaceSection and other data-dependent sections show their own loading states.

### 2. Start marketplace data fetch earlier — don't wait for BrowsingLocation context
**File:** `src/hooks/queries/useMarketplaceData.ts`

The BrowsingLocation context chains through: profile → defaultAddress/society → browsingLocation → marketplace RPC. The society coordinates are available from the auth context's `get_user_auth_context` RPC response before `BrowsingLocationContext` even resolves.

Change: Allow `useMarketplaceData` to accept coordinates directly as optional params, and in AuthProvider's prefetch block, fire `search_sellers_by_location` as a prefetch using the society coordinates from the auth context response — before `BrowsingLocationContext` mounts. This eliminates one full round-trip of waiting.

### 3. Consolidate AutoHighlightStrip's 3 parallel queries into the prefetch block
**File:** `src/components/home/AutoHighlightStrip.tsx`, `src/contexts/auth/AuthProvider.tsx`

AutoHighlightStrip fires 3 separate queries (bestsellers, top sellers, coupons) using `Promise.all`. Move this into a single prefetch in AuthProvider alongside the existing config prefetches — so by the time the component mounts, data is already cached.

### 4. Fix ActiveOrderStrip's sequential waterfall
**File:** `src/components/home/ActiveOrderStrip.tsx`

Currently: `getTerminalStatuses()` (async) → `useState` → query enabled. The terminal statuses are fetched, stored in state, and only then does the orders query fire. Fix: fetch terminal statuses and orders in parallel inside the queryFn, or prefetch terminal statuses in AuthProvider.

### 5. Defer social proof — it's not above-fold critical
**File:** `src/components/home/MarketplaceSection.tsx`

`useSocialProof` fires a heavy RPC that depends on ALL product IDs being ready. It's only used for small badge counts on product cards. Defer this query with a 2-second delay or make it lazy (only fire after initial paint completes via `requestIdleCallback`).

### 6. Move BuyAgainRow rendering to LazySection
**File:** `src/pages/HomePage.tsx`, `src/components/home/ForYouSection.tsx`

BuyAgainRow appears in **two places**: inside `MarketplaceSection` (line 126) AND inside `ForYouSection` (line 19). The duplicate inside ForYouSection fires a second identical query. Remove the duplicate. The one inside MarketplaceSection should stay but only render after the category grids (not before them).

### 7. Instant shell with staggered content reveal
**File:** `src/pages/HomePage.tsx`

Instead of waiting for all data before painting, use a priority-based render:
- **P0 (instant):** AppLayout shell + header + bottom nav + skeleton placeholders
- **P1 (< 500ms):** FeaturedBanners + ParentGroupTabs (from prefetched cache)
- **P2 (< 1.5s):** CategoryImageGrid + DiscoveryRows (marketplace data)
- **P3 (deferred):** SocialProof, Leaderboard, Community, WhatsNew

## Files Changed

| File | Change |
|------|--------|
| `src/pages/HomePage.tsx` | Remove full-page profile gate; render shell immediately with inline skeletons |
| `src/contexts/auth/AuthProvider.tsx` | Add marketplace data + highlights prefetch using society coords |
| `src/hooks/queries/useMarketplaceData.ts` | Accept optional coord override for prefetch compatibility |
| `src/components/home/ActiveOrderStrip.tsx` | Parallel fetch terminal statuses + orders |
| `src/components/home/MarketplaceSection.tsx` | Defer `useSocialProof` to post-paint; reorder BuyAgainRow below grids |
| `src/components/home/ForYouSection.tsx` | Remove duplicate BuyAgainRow |
| `src/components/home/AutoHighlightStrip.tsx` | Move query to prefetch in AuthProvider |

## Risk Controls

- **No data accuracy regression:** All queries return the same data — only the timing/ordering changes
- **No auth regression:** Profile gate is replaced with per-section skeletons, not removed
- **No cart regression:** BrowsingLocation context and cart logic are untouched
- **No marketplace data regression:** useMarketplaceData still uses the same RPC, just starts earlier
- **Backward compatible:** If prefetch misses (cache miss), components fall back to their own queries as today

## Expected Result

```text
Before (waterfall):
  Auth (800ms) → Profile (600ms) → Location (100ms) → Marketplace RPC (1500ms) → Render
  Total: ~3000ms minimum before first content, 5-7s total

After (parallel + prefetch):
  Auth (800ms) → Profile + Marketplace RPC in parallel (1500ms) → Render
  Shell visible: instant
  First content: ~1200ms
  Full page: ~1500ms
```

