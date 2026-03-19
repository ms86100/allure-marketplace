

# UX Improvements Plan — Blinkit-Level Polish (Zero Breakage)

## What Already Exists (No Work Needed)

These were already implemented in previous iterations:
- **Floating Cart Bar** with thumbnails, count, total, bounce animation — done
- **ActiveOrderETA** in header with live countdown, transit pulse — done
- **Feedback Engine** (`feedbackEngine.ts`) centralized for all actions — done
- **ETA Engine** (`etaEngine.ts`) single source of truth — done
- **Visibility Engine** (`visibilityEngine.ts`) centralized route rules — done
- **BuyAgainRow** + **ReorderLastOrder** on home screen — done
- **Haptics** across all cart actions — done
- **Cart is single-scroll checkout** with sticky footer — done

## Remaining Gaps to Implement

### 1. Search Autocomplete with Product Thumbnails

**Current**: `HomeSearchSuggestions` shows text-only trending terms as chips. Search page has no autocomplete dropdown — user must type and wait for full results grid.

**Target**: When user starts typing on SearchPage, show an autocomplete dropdown with product image thumbnails (32x32) + name + price before full grid loads. Recognition over recall.

**Changes**:
- Create `src/components/search/SearchAutocomplete.tsx` — a dropdown that appears while typing (debounced 200ms), queries products with `ilike` match, shows up to 6 results as rows with thumbnail + name + price
- Integrate into `SearchPage.tsx` between the search input and filter bar
- Tapping a suggestion opens ProductDetailSheet directly (skip grid browsing)

**Risk**: Low. Additive component, no existing logic touched.

---

### 2. Undo for Cart Item Removal

**Current**: Removing an item from cart is irreversible. `feedbackRemoveItem` shows a plain toast. User must re-search and re-add.

**Target**: Show an undo toast for 4 seconds after removing an item. Tapping "Undo" re-adds the item instantly.

**Changes**:
- Modify `feedbackRemoveItem` in `feedbackEngine.ts` to accept an optional `undoFn` callback
- Show `toast('Removed', { action: { label: 'Undo', onClick: undoFn } })` when undoFn is provided
- In `useCart.tsx` `removeItem()`, pass an undo callback that calls `addItem(removedProduct, removedQty, { silent: true })`

**Risk**: Low. Uses existing `addItem` with silent flag to prevent double-toast.

---

### 3. Recently Viewed Products Section

**Current**: No recently viewed tracking. Users who browse products and navigate away must re-search.

**Target**: Track last 10 viewed products in `localStorage`, show a "Recently Viewed" horizontal scroll on the home page.

**Changes**:
- Create `src/hooks/useRecentlyViewed.ts` — reads/writes to `localStorage` key `recently_viewed`, exposes `addViewed(productId)` and `recentIds` array
- Call `addViewed` when `ProductDetailSheet` opens
- Create `src/components/home/RecentlyViewedRow.tsx` — fetches product data for stored IDs, renders compact horizontal scroll cards
- Add to `HomePage.tsx` between ForYouSection and Leaderboard

**Risk**: None. Pure client-side, no DB changes.

---

### 4. Home Page Cognitive Load Reduction

**Current**: HomePage renders 9+ sections sequentially: Profile banner, ActiveOrderStrip, NotificationBanner, TrustStrip, SearchSuggestions, MarketplaceSection, QuickLinks, ForYouSection, Leaderboard, CommunityTeaser.

**Target**: Reduce visual noise by:
- Collapsing SocietyTrustStrip into the header location chip (merge member count into existing location stats)
- Moving CommunityTeaser inside SocietyQuickLinks as a card instead of a separate section
- Adding section dividers with more whitespace between remaining sections

**Changes**:
- Modify `HomePage.tsx` to remove `SocietyTrustStrip` as standalone (merge its data into Header location stats)
- Move `CommunityTeaser` content into `SocietyQuickLinks` as the last card
- Add `SectionDivider` components between major sections for visual breathing room

**Risk**: Low. Rearranging existing components, no logic changes.

---

### 5. Category Navigation Depth Reduction

**Current**: Home → Categories page → Category group → Products (3 taps minimum). `CategoriesPage` and `CategoryGroupPage` are separate full-page navigations.

**Target**: On category pages, add horizontal sub-category chips at the top that filter products inline instead of navigating to a new page.

**Changes**:
- Modify the category detail page to show sub-category tabs as horizontal scrollable chips
- Tapping a chip filters products inline (client-side filter on already-fetched data)
- Reduces depth from 3 taps to 2 taps

**Risk**: Medium. Touches category navigation flow, but filtering is client-side only.

---

### 6. Add-to-Cart Button Consistency Audit

**Current**: `BuyAgainRow` calls `impact('medium')` directly + `addItem()`. The centralized `feedbackAddItem` inside `useCart.addItem()` also fires. This means **double haptic** on BuyAgainRow.

**Target**: Remove all component-level `hapticImpact` calls for add-to-cart. The centralized `useCart.addItem()` already calls `feedbackAddItem` which includes haptic. Components should not duplicate.

**Changes**:
- Remove `impact('medium')` from `BuyAgainRow.handleQuickAdd`
- Audit all other components calling `addItem` + manual haptic (search for `impact.*medium.*addItem` pattern)
- Ensure only `useCart.addItem()` triggers feedback via `feedbackEngine`

**Risk**: None. Removing duplicate calls.

---

## Implementation Phases

| Phase | Items | Risk |
|-------|-------|------|
| **1: Quick Wins** | #2 (Undo toast), #6 (Haptic dedup) | None |
| **2: Recognition** | #3 (Recently Viewed), #1 (Search autocomplete) | Low |
| **3: Polish** | #4 (Home cognitive load), #5 (Category depth) | Low-Medium |

## Guarantees

- Zero existing flows break — all changes are additive or deduplication
- No DB migrations required (Recently Viewed uses localStorage)
- No backend changes needed
- All new components follow existing patterns (useQuery, feedbackEngine, visibilityEngine)

