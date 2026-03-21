

# Round 18: 5 Critical Bugs — Cross-Society Discovery & Buyer Browsing

## Bug 1: `useOrderSuggestions` queries non-existent column `image_urls` — 400 error on every home page load

**Where:** `src/hooks/useOrderSuggestions.ts` line 51, `src/components/home/SmartSuggestionBanner.tsx` line 96

**What happens:** The query selects `'id, name, image_urls, price'` from `products` table. The actual column is `image_url` (singular). This returns a 400 error (`column products.image_urls does not exist`) on every home page load for any logged-in user. The suggestion banner silently falls back to the ShoppingBag icon, but the network error pollutes logs and wastes a request. The TypeScript interface at line 18 also defines `image_urls: string[] | null` instead of `image_url: string | null`.

**Why critical:** Every single home page load triggers a visible 400 error in network logs. The suggestion banner never shows product images — it always falls back to a generic icon. This is a data fetch failure masquerading as a cosmetic issue.

**Impact:** `useOrderSuggestions.ts` (fix column name + interface), `SmartSuggestionBanner.tsx` (fix property access from `image_urls?.[0]` to `image_url`).

**Risks:** (1) None — pure column name typo fix. (2) Products without images will still show the fallback icon, which is correct.

---

## Bug 2: Home page discovery hooks ignore user's `search_radius_km` preference — sees fewer sellers than search page

**Where:** `useNearbyProducts.ts`, `useTrendingProducts.ts`, `usePopularProducts.ts`, `useProductsByCategory.ts` — all hardcode `MARKETPLACE_RADIUS_KM` (5km)

**What happens:** The search page (`useSearchPage.ts` line 109) respects `profile?.search_radius_km` (default 5, user-configurable up to 10). The categories page and store discovery also use the profile preference. But ALL four home page discovery hooks pass `MARKETPLACE_RADIUS_KM = 5` to the RPC. A buyer who set their radius to 10km sees more sellers when searching but fewer on the home page. A seller with `delivery_radius_km = 8` is invisible on the home screen but appears in search.

**Why critical:** The home page is the primary discovery surface. If a buyer explicitly expanded their radius to 10km, they expect the home feed to reflect that. Seeing different results between home and search breaks the "single truth" principle.

**Impact:** 4 discovery hooks need to read `profile?.search_radius_km` from auth context (or accept it as parameter). The `BrowsingLocationContext.invalidateDiscovery` already covers their query keys.

**Risks:** (1) Hooks are used outside authenticated context — need fallback to `MARKETPLACE_RADIUS_KM`. (2) Increasing radius increases RPC payload — acceptable for small marketplace.

---

## Bug 3: `invalidateDiscovery` misses `location-stats` query — stale seller count after location switch

**Where:** `src/contexts/BrowsingLocationContext.tsx` lines 95-102

**What happens:** When a buyer switches browsing location (GPS, address, society), `invalidateDiscovery` invalidates 6 query key families: `store-discovery`, `trending-products`, `popular-products`, `products-by-category`, `category-products`, `search-popular-products`. But it does NOT invalidate `location-stats`. The `useLocationStats` hook (used in store discovery) caches stats for 5 minutes. After switching from Society A to Society B, the buyer still sees "3 sellers nearby" from the old location until cache expires.

**Why critical:** The location stats banner is a trust signal — "X sellers nearby" tells the buyer the app is aware of their context. Stale stats after an explicit location switch makes the app feel unresponsive.

**Impact:** Add `queryClient.invalidateQueries({ queryKey: ['location-stats'] })` to `invalidateDiscovery`.

**Risks:** (1) Extra RPC call on location switch — negligible. (2) None.

---

## Bug 4: `sell_beyond_community = false` sellers are still visible to cross-society buyers

**Where:** `search_sellers_by_location` RPC (latest migration `20260321083551`) line 101

**What happens:** The RPC filter is:
```sql
AND (_exclude_society_id IS NULL OR sp.society_id IS NULL OR sp.society_id != _exclude_society_id)
```
This only excludes the buyer's OWN society (to avoid duplicates). But there's NO check for `sell_beyond_community`. A society-resident seller who explicitly set `sell_beyond_community = false` (meaning "I only want to sell within my community") is still visible to buyers from other societies who are within radius.

The earlier RPC versions (migration `20260312174505`) had:
```sql
AND (sp.sell_beyond_community = true OR sp.society_id = (...buyer's society...))
```
But this guard was removed during the coordinate-first refactor. The `_exclude_society_id` parameter is never even passed by any frontend hook — all hooks call with only `_lat`, `_lng`, `_radius_km`.

**Why critical:** This is a seller trust violation. A home cook who only wants to serve their own apartment complex is now visible to the entire 5km radius. They get orders from strangers they can't deliver to.

**Impact:** Update the RPC WHERE clause to re-add the `sell_beyond_community` gate for society-resident sellers. Commercial sellers (`seller_type = 'commercial'`) should bypass this check per the architecture memory.

**Risks:** (1) Some sellers currently visible will disappear — this is correct behavior. (2) Need to ensure `seller_type` column is checked; commercial sellers must always be visible within radius regardless of `sell_beyond_community`.

---

## Bug 5: Discovery hooks don't pass `_exclude_society_id` — duplicate sellers shown when viewing own-society products alongside nearby

**Where:** All discovery hooks call `search_sellers_by_location` without passing `_exclude_society_id`

**What happens:** The RPC accepts `_exclude_society_id` to prevent showing own-society sellers in the "nearby" results (since they're already shown in local/society sections). But no frontend hook passes this parameter. The `useNearbyProducts` hook, `useTrendingProducts`, etc. all call with only `{ _lat, _lng, _radius_km }`. This means own-society sellers appear in BOTH the "Your Society" section AND the "Nearby" section, creating duplicate product cards on the home page.

With the `mergeProducts` deduplication in `usePopularProducts` (line 59), this is partially mitigated at the product level. But at the seller level (e.g., `ShopByStoreDiscovery`), the same store appears twice.

**Why critical:** Seeing the same store twice — once in "Your Community" and once in "Nearby" — makes the marketplace feel broken. It wastes screen real estate and confuses the buyer about where the store actually belongs.

**Impact:** Pass `effectiveSocietyId` as `_exclude_society_id` in discovery hooks that are meant for "nearby/cross-society" results. The `useNearbyProducts` hook should accept the society ID and forward it.

**Risks:** (1) Non-society users (no `effectiveSocietyId`) must pass `null` — the RPC already handles this correctly with `_exclude_society_id IS NULL`. (2) If society data is stale, a recently-moved user might miss their old society's sellers temporarily.

---

## Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | `image_urls` typo — 400 error on every home load | **HIGH** | `useOrderSuggestions.ts`, `SmartSuggestionBanner.tsx` |
| 2 | Home discovery ignores user radius preference | **HIGH** | 4 discovery hooks |
| 3 | Location stats not invalidated on location switch | **MEDIUM** | `BrowsingLocationContext.tsx` |
| 4 | `sell_beyond_community=false` sellers leak to cross-society buyers | **CRITICAL** | `search_sellers_by_location` RPC (migration) |
| 5 | Own-society sellers duplicated in nearby results | **MEDIUM** | 4 discovery hooks (pass `_exclude_society_id`) |

## Technical Details

### Files to edit:
- `src/hooks/useOrderSuggestions.ts` — Fix `image_urls` → `image_url` in select + interface (Bug 1)
- `src/components/home/SmartSuggestionBanner.tsx` — Fix `image_urls?.[0]` → `image_url` (Bug 1)
- `src/hooks/queries/useNearbyProducts.ts` — Accept radius param, pass `_exclude_society_id` (Bugs 2, 5)
- `src/hooks/queries/useTrendingProducts.ts` — Same (Bugs 2, 5)
- `src/hooks/queries/usePopularProducts.ts` — Same (Bugs 2, 5)
- `src/hooks/queries/useProductsByCategory.ts` — Same (Bugs 2, 5)
- `src/contexts/BrowsingLocationContext.tsx` — Add `location-stats` to invalidation list (Bug 3)
- **DB Migration** — Update `search_sellers_by_location` to re-add `sell_beyond_community` gate (Bug 4)

### RPC fix (Bug 4) — add after the existing WHERE conditions:
```sql
AND (
  sp.seller_type = 'commercial'
  OR sp.sell_beyond_community = true
  OR sp.society_id IS NULL
  OR sp.society_id = (
    SELECT pr.society_id FROM public.profiles pr WHERE pr.id = auth.uid()
  )
)
```
This ensures: commercial sellers always visible, opted-in society sellers visible, no-society sellers visible, and same-society sellers visible. Only society-resident sellers with `sell_beyond_community = false` are hidden from cross-society buyers.

