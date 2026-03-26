

# Mobile Performance & Session Reliability

## Problem Summary

Two distinct issues causing poor mobile experience:

1. **Slow page loads** — Every page triggers a waterfall of sequential/parallel DB calls, many of which are redundant or could be cached. The home page alone fires 10+ queries on mount.
2. **Session loss on app update / cold start** — iOS WebView purges localStorage on app updates, killing the auth token. The app then shows a loading screen requiring 2-3 taps to recover.

---

## Part A: Performance — Reduce Page Load Latency

### Fix 1: SocietyLeaderboard uses raw `useEffect` + `setState` instead of React Query
The leaderboard fires 2 DB calls on every mount with no caching. Converting to `useQuery` with a 10-minute staleTime means it loads from cache on subsequent visits.

### Fix 2: Header stats use raw `useEffect` + `setState`
Lines 60-83 of `Header.tsx` fire two `COUNT` queries (sellers + orders) on every mount. Convert to a single `useQuery` with 15-minute staleTime — header renders on every page, so this saves 2 DB calls per navigation.

### Fix 3: Duplicate "last order" queries
`WelcomeBackStrip` and `WhatsNewSection` both query `orders` for the user's last order independently. Share a single query key (`last-order-date`) that both consume.

### Fix 4: `mergeProductFlags` secondary query
After the main RPC (`search_sellers_by_location`), `useProductsByCategory` fires a second query to fetch `is_bestseller/is_recommended/is_urgent` flags from the `products` table. This is a sequential waterfall. Move these flags into the RPC response or inline them in the initial select to eliminate the second round-trip.

### Fix 5: Below-fold sections fetch eagerly
`SocietyLeaderboard`, `CommunityTeaser`, `WhatsNewSection`, `RecentlyViewedRow` all fetch on mount even though they're below the fold. Wrap them in an intersection-observer trigger so queries only fire when the section scrolls into view.

### Fix 6: Seller dashboard prefetching
When a seller taps the seller icon, the dashboard page fires 4-5 queries sequentially. Add route-aware prefetching — when `isSeller` is true, prefetch seller stats and orders in the background during idle time.

---

## Part B: Cold Start — Eliminate Multi-Tap Lag

### Fix 7: Splash screen hides before auth is ready
`SplashScreen.hide()` fires during `initializeCapacitorPlugins()` — before React even mounts. The user sees a white screen while auth hydrates. **Fix:** Move `SplashScreen.hide()` to after `isSessionRestored` becomes true.

### Fix 8: `ProtectedRoute` redirects to `/auth` during loading
When `isLoading` is false but profile hasn't loaded yet, `ProtectedRoute` sees `!user` and redirects to `/auth`. By the time the session restores (milliseconds later), the user is already on the auth page. **Fix:** Gate on `isSessionRestored` — show skeleton until session restoration completes, only then decide to redirect.

### Fix 9: `appStateChange` invalidates `products-by-category` on every resume
This is the heaviest query in the app (RPC + flag merge). Invalidating it on every app resume forces a full re-fetch. **Fix:** Remove it from the invalidation list — it has a 10-minute staleTime and the user can pull-to-refresh if needed.

---

## Part C: Session Persistence Across App Updates

### Fix 10: Auth token lost on iOS app updates
iOS purges WebView localStorage on binary updates. The existing `migrateLocalStorageToPreferences` runs but doesn't specifically handle the auth token. **Fix:**

1. On every `onAuthStateChange` event, persist the session token to Capacitor `Preferences` (native key-value store that survives updates)
2. On cold boot, before calling `getSession()`, check `Preferences` for a stored token and restore it to Supabase's local storage if missing
3. This ensures the app always has a valid session after an update

---

## Impact Analysis

| Fix | Pages Affected | DB Calls Saved | Risk |
|-----|---------------|----------------|------|
| 1 | Home | 2 per mount | Zero — same data, cached |
| 2 | Every page | 2 per navigation | Zero — memo'd Header |
| 3 | Home | 1 duplicate | Zero — shared key |
| 4 | Home | 1 sequential call | Low — need RPC change or flag inlining |
| 5 | Home | 4+ deferred | Zero — lazy load |
| 6 | Seller dashboard | Prefetch only | Zero — background |
| 7 | Cold start | N/A | Zero — timing change |
| 8 | Cold start | N/A | Zero — gate change |
| 9 | Resume | 1 heavy query | Zero — still cacheable |
| 10 | App update | N/A | Low — Preferences API |

## Files to Change

| File | Fixes |
|------|-------|
| `src/components/home/SocietyLeaderboard.tsx` | 1 |
| `src/components/layout/Header.tsx` | 2 |
| `src/components/home/WhatsNewSection.tsx` | 3 |
| `src/hooks/queries/useProductFlags.ts` | 4 |
| `src/hooks/queries/useProductsByCategory.ts` | 4 |
| `src/pages/HomePage.tsx` | 5 |
| `src/contexts/auth/AuthProvider.tsx` | 6 |
| `src/lib/capacitor.ts` | 7 |
| `src/App.tsx` | 7, 8 |
| `src/hooks/useAppLifecycle.ts` | 9 |
| `src/contexts/auth/useAuthState.ts` | 10 |
| `src/lib/capacitor-storage.ts` (or new file) | 10 |

