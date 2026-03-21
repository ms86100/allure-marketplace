

# Round 19: 5 Critical Bugs — Cross-Society Store Discovery (Round 2)

Previous rounds fixed product-level hooks (useNearbyProducts, useTrendingProducts, etc.) but the **Store Discovery hooks** (`useLocalSellers`, `useNearbySocietySellers`) in `useStoreDiscovery.ts` were untouched. These power the "Shop By Store" section on the home page and categories page.

---

## Bug 1: Store Discovery shows duplicate sellers — local and nearby sections overlap completely

**Where:** `useStoreDiscovery.ts` — `useLocalSellers` (line 98) uses `MARKETPLACE_RADIUS_KM` (5km), `useNearbySocietySellers` (line 147) uses user's radius but starts bands at 0km.

**What happens:** `useLocalSellers` returns all sellers within 5km. `useNearbySocietySellers` returns sellers from 0km outward, grouped into "Within 2km", "Within 5km", "Within 10km" bands. Every seller within 5km appears in BOTH the "In Your Society" section AND the "Nearby Societies > Within 2/5km" bands. The buyer sees the same store card twice on the same screen.

**Why critical:** Duplicate store cards waste screen real estate and make the marketplace feel broken. A buyer who sees "Fresh Mart Express" twice thinks the system is glitchy.

**Fix:** In `useNearbySocietySellers`, pass `_exclude_society_id: effectiveSocietyId` to remove own-society sellers from nearby results. Also, deduplicate at the UI level in `ShopByStoreDiscovery.tsx` by collecting local seller IDs and filtering them out of nearby results.

**Impact:** `useStoreDiscovery.ts`, `ShopByStoreDiscovery.tsx`
**Risks:** (1) Non-society users pass null — RPC already handles this. (2) If local and nearby use different radii, some sellers in the gap (5-10km) might only appear in nearby — this is correct behavior.

---

## Bug 2: "In Your Society" label shown for non-society users browsing via GPS

**Where:** `ShopByStoreDiscovery.tsx` line 60-68

**What happens:** The section header always says "In Your Society" with an optional society name appended. For users without a society (browsing via GPS or saved address), it displays "In Your Society" with no context — misleading since these are coordinate-based results, not society-filtered.

**Why critical:** A non-society user (or a user traveling) sees "In Your Society" when they have no society. This creates confusion about what the section means and undermines trust in the discovery system.

**Fix:** When `effectiveSociety` is null, change the label to "Stores Near You". Keep "In Your Society – [name]" only when a society exists.

**Impact:** `ShopByStoreDiscovery.tsx` (3 lines)
**Risks:** (1) None — purely cosmetic label change. (2) None.

---

## Bug 3: Nearby society grouping labels "Near Your Society" for sellers without society even when buyer has no society

**Where:** `useStoreDiscovery.ts` line 185

**What happens:** When grouping sellers in the nearby section, sellers without a `society_name` are labeled: `s.distance_km <= 2 ? 'Near Your Society' : 'Independent Stores'`. This hardcodes "Near Your Society" regardless of whether the buyer actually has a society. A non-society buyer browsing by GPS sees "Near Your Society" as a group header — confusing and incorrect.

**Why critical:** The label implies a society relationship that doesn't exist. For independent/commercial marketplace users, this creates a disconnected experience.

**Fix:** Pass the buyer's society context into the grouping logic. When no society exists, use "Nearby Stores" instead of "Near Your Society".

**Impact:** `useStoreDiscovery.ts` (accept a `hasSociety` parameter or resolve it internally)
**Risks:** (1) Adding a parameter changes the hook signature — callers need updating. Better to resolve internally using `useAuth`. (2) None.

---

## Bug 4: `useLocalSellers` doesn't use user's `search_radius_km` — inconsistent with all other discovery hooks

**Where:** `useStoreDiscovery.ts` line 98

**What happens:** `useLocalSellers` hardcodes `MARKETPLACE_RADIUS_KM` (5km) while every other discovery hook now respects `profile?.search_radius_km`. A buyer who expanded their radius to 10km sees more products in grids and trending sections but the "local stores" section still only shows 5km. Worse, the `useNearbySocietySellers` (nearby section) correctly uses the user's radius, so a seller at 6km appears in "Nearby" but not in "Local" — inconsistent.

**Why critical:** The buyer explicitly configured their discovery radius to 10km. The home page's most prominent store section ignores this preference. The asymmetry between product discovery (respects radius) and store discovery (ignores it) breaks the "single truth" principle.

**Fix:** Import `useAuth` in the hook and use `profile?.search_radius_km ?? MARKETPLACE_RADIUS_KM` for the local radius. Cap it at a reasonable local max (e.g., keep MARKETPLACE_RADIUS_KM as the local cap since "local" is meant to be tight).

Actually, the better fix: keep local at a tight radius but make it dynamic relative to user preference — use `Math.min(profile?.search_radius_km ?? MARKETPLACE_RADIUS_KM, MARKETPLACE_RADIUS_KM)` to ensure local never exceeds 5km but respects lower user preferences.

**Impact:** `useStoreDiscovery.ts` — `useLocalSellers` function
**Risks:** (1) Adding `useAuth` to the hook adds a dependency. (2) Query key needs to include radius to avoid stale cache.

---

## Bug 5: `useNearbySocietySellers` query key doesn't include `effectiveSocietyId` — stale cache after society change

**Where:** `useStoreDiscovery.ts` line 140

**What happens:** The query key is `['store-discovery', 'nearby', lat, lng, radiusKm]`. It doesn't include `effectiveSocietyId`. If a buyer joins a society (or switches), the cached nearby results still include/exclude sellers based on the old society context. The `sell_beyond_community` RPC check uses `auth.uid()` which doesn't change, but the `_exclude_society_id` parameter (once we add it in Bug 1 fix) needs the key to vary by society. Without it, React Query serves stale data.

Similarly, `useLocalSellers` query key (line 91) is `['store-discovery', 'local', lat, lng]` — no society context at all.

**Why critical:** After Round 1 fixes added `_exclude_society_id` to product hooks, the store discovery hooks need matching cache keys. Without this, the store section shows stale/duplicate results after any society context change.

**Fix:** Add `effectiveSocietyId` to both query keys.

**Impact:** `useStoreDiscovery.ts` — both hooks' query keys
**Risks:** (1) Cache invalidation on society change triggers refetch — acceptable. (2) None.

---

## Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | Duplicate stores in local vs nearby sections | **HIGH** | `useStoreDiscovery.ts`, `ShopByStoreDiscovery.tsx` |
| 2 | "In Your Society" label for non-society users | **MEDIUM** | `ShopByStoreDiscovery.tsx` |
| 3 | "Near Your Society" grouping label when buyer has no society | **MEDIUM** | `useStoreDiscovery.ts` |
| 4 | `useLocalSellers` ignores user radius preference | **MEDIUM** | `useStoreDiscovery.ts` |
| 5 | Query keys missing `effectiveSocietyId` — stale cache | **HIGH** | `useStoreDiscovery.ts` |

## Files to Edit

- `src/hooks/queries/useStoreDiscovery.ts` — Bugs 1, 3, 4, 5 (add `useAuth`, pass `_exclude_society_id`, fix query keys, fix grouping label, use user radius)
- `src/components/home/ShopByStoreDiscovery.tsx` — Bugs 1, 2 (deduplicate local vs nearby sellers, fix section label)

