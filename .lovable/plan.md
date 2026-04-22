

## Bulletproof performance plan — Sociva

### What I found (root causes, ranked by impact)

I scanned `App.tsx` (587 lines, 79 lazy-loaded pages), the auth pipeline, `HomePage`, all 26 home components, `useCart`, `useAppLifecycle`, query hooks, and `vite.config.ts`. The slowness is not one bug — it's a stack of compounding issues:

1. **Heavy waterfall on first paint of every page**
   - `App.tsx` chains: `ErrorBoundary → ThemeProvider → QueryClientProvider → HashRouter → AuthProvider → SplashGate → BrowsingLocationProvider → CartProvider → NewOrderAlertProvider → PushNotificationProvider → AppRoutes`. Each provider adds its own subscriptions.
   - `SplashGate` blocks the tree until `isSessionRestored` (waits for both `onAuthStateChange` AND `restoreAuthSession()` Promise.race up to 3s).
   - `ProtectedRoute` then waits for `profile` (a second async RPC, `get_user_auth_context`) before rendering anything.
   - Net effect: every cold load = splash + session + profile = **3 sequential async gates** before route code even mounts.

2. **HomePage = data-fetch storm on mount**
   - `MarketplaceSection` mounts immediately and triggers: `search_sellers_paginated` RPC, then `get_products_for_sellers` RPC (Phase 2), `useParentGroups`, `useMarketplaceConfig`, `useBadgeConfig`, `useMarketplaceLabels`, `useCategoryConfigs`, `active_banners_for_society` RPC, `banner-sections`, `auto-highlights` (3 parallel queries), `buy-again` RPC, `ShopByStoreDiscovery`, `NearbySellersSection`.
   - That's **10+ network calls fired in the first 500ms of HomePage**, all uncoordinated, many returning `[]` then re-rendering.
   - `ActiveOrderStrip`, `Header` (`useCartCount` + `useUnreadNotificationCount`), and `EnableNotificationsBanner` add 3 more.

3. **`useCart` is mounted globally and runs a giant deep join on every page**
   - `CartProvider` lives in `App.tsx`, so the JOIN `cart_items → products → seller_profiles(15+ columns)` runs on every navigation, even pages that don't use the cart (Admin, Seller, Disputes, Society, etc.).
   - It also runs a Layer-1 self-heal that does a second COUNT query when result is empty — doubling traffic for empty carts.

4. **Bundle is too monolithic**
   - `vite.config.ts` only splits 3 chunks: `vendor`, `ui` (Radix), `supabase`. **Framer Motion, lucide-react, date-fns, all 79 page chunks, and your ~407 components** end up in default chunks.
   - First paint pulls framer-motion (large) because `motion.div` is used in `App.tsx`'s splash and `Header`.
   - 79 `lazyWithRetry()` page imports in `App.tsx` create 79 separate dynamic-import boundaries; switching pages triggers a network round-trip per first visit.

5. **Re-render cascade from `AuthProvider`**
   - `AuthProvider` exposes 5 contexts (`Identity`, `Role`, `Society`, `Seller`, legacy `AuthContext`). The legacy context is consumed by `Header`, `HomePage`, `MarketplaceSection`, `BottomNav`, every `*Route` guard, and ~40 hooks. Any change to `roles`/`profile`/`sellerProfiles` re-renders the entire tree.

6. **Realtime + intervals piling up**
   - `useAuthState`: 5-minute session health interval + realtime channel on 5 tables.
   - `useBuyerRealtimeShell` (Home/Orders): adds `useBuyerOrderAlerts` + `useLiveActivityOrchestrator`.
   - `useAppLifecycle`: invokes `auto-cancel-orders` edge function on **every cold start** (you can see it in your network logs returning `Failed to fetch`), plus a stale-notification cleanup that fetches 100 notifications.
   - `Header`'s `useUnreadNotificationCount` polls every 60s.

7. **No route-level prefetch / no bundle warmth**
   - First click to `/orders`, `/seller`, `/admin` → cold dynamic import → 1–2s extra blank screen.

8. **`scripts run on every navigation`**
   - `useCart` deep join → fires on every route mount through `CartProvider`.
   - `Header` re-renders `getGreeting` / `Date` work on every render.
   - `LazySection` creates an IntersectionObserver per section (8 on HomePage) — fine, but each child fires its own queries when revealed.

---

### The fix — 5 phases, each shippable independently

#### Phase 1 — Kill the boot waterfall (biggest single win)

- Render the route shell **immediately** instead of waiting for both session AND profile. Show skeleton inside the page while profile loads in the background; only block the actual content area, not the whole app.
- Remove `SplashGate` blocking. Splash already has `ready={isSessionRestored}` but it overlays the children — switch to an opacity overlay so the tree under it can hydrate behind it.
- In `useAuthState`: collapse the dual `restoreAuthSession()` + `getSession()` paths. `onAuthStateChange` already fires on init with `INITIAL_SESSION` — that's the only path needed. Remove the 3s timeout race entirely.
- Move `auto-cancel-orders` invocation out of `useAppLifecycle` cold-start path. Run it server-side via a cron (already exists), or defer it 10s after first paint.

#### Phase 2 — Stop running heavy queries on every page

- **Move `CartProvider` out of `App.tsx`**. Mount it only on routes that need cart writes (`HomePage`, `SearchPage`, `SellerDetailPage`, `ProductDeepLinkPage`, `CartPage`, product/seller browse). Pages that only need *count* keep using `useCartCount` (already lightweight).
- Pages like `/admin`, `/seller`, `/society`, `/disputes`, `/profile`, `/orders/*` should NOT mount `CartProvider`.
- Drop the Layer-1 COUNT self-heal in `fetchCartItems` (the multi-layer recovery in mutations is already enough). Saves a query on every empty cart.
- Move `EnableNotificationsBanner` query behind a `LazySection` (it's below the fold).

#### Phase 3 — HomePage data orchestration

- Sequence the marketplace queries so above-fold paints first:
  - **Tier A (parallel, on mount)**: `search_sellers_paginated`, `useParentGroups`, `useMarketplaceLabels` (these drive the visible header/tabs).
  - **Tier B (after Tier A resolves)**: `get_products_for_sellers`, `active_banners_for_society`, `useCategoryConfigs`, `useBadgeConfig`.
  - **Tier C (deferred 1s + LazySection)**: `auto-highlights`, `buy-again`, `social-proof`, `ShopByStoreDiscovery`, `NearbySellersSection`, `banner-sections`.
- Wrap `FeaturedBanners`, `AutoHighlightStrip`, `BuyAgainRow`, `ShopByStoreDiscovery`, `NearbySellersSection` in `LazySection` so they only fetch when scrolled near.
- Cache the marketplace queries with `staleTime: 5min` keyed on society — already partially done; tighten the keys.

#### Phase 4 — Bundle splitting

Update `vite.config.ts` `manualChunks` to split:

```text
react        → react, react-dom, react-router, react/jsx-runtime
ui-radix     → @radix-ui/*
supabase     → @supabase/*
motion       → framer-motion (heavy, currently in default)
icons        → lucide-react
forms        → react-hook-form, @hookform/resolvers, zod
maps         → @vis.gl/react-google-maps, @types/google.maps
charts       → any chart libs
date         → date-fns
capacitor    → @capacitor/*
```

Add **route prefetch on idle**: after `HomePage` paints, prefetch chunks for `/orders`, `/cart`, `/profile`, `/search`, `/seller` using `requestIdleCallback`. Use `import.meta.glob` or just call `import("./pages/X")` inside an idle callback.

#### Phase 5 — Re-render hygiene

- Migrate the remaining consumers off the legacy `AuthContext` to the smaller `IdentityContext` / `RoleContext` / `SocietyContext` / `SellerContext`. Header, BottomNav, route guards only need a subset.
- Memoize `Header` props more strictly; precompute `initials`, `greeting` once per `profile.name` change.
- Reduce realtime: in `useAuthState`, replace 5 separate `postgres_changes` listeners on 5 tables with a single channel that listens to `user_roles` + a single `*_admin/*_member` view (or skip realtime for `seller_profiles`/`builder_members` and rely on push events you already dispatch).
- Drop the 60s `refetchInterval` on `useUnreadNotificationCount` — replace with realtime channel that's already running for notifications.

---

### Diagnostics & guardrails (added during the work)

- Add `trackRouteMount('PageName')` (you already have it in `perf-telemetry.ts`) to top 10 pages so we get baseline numbers in the console.
- Add `guardedQuery` wrapper to the 5 heaviest RPCs (`search_sellers_paginated`, `get_products_for_sellers`, `get_user_auth_context`, `active_banners_for_society`, `cart_items` join).
- Add a one-time bundle analyzer run (`rollup-plugin-visualizer`) so we can verify chunk splits before/after.

### Expected impact

- Cold home load: **~4–5s → ~1.2–1.8s** (kill waterfall + chunk split).
- Subsequent navigations: **~1.5s → ~250–400ms** (route prefetch + drop CartProvider).
- Memory & CPU on long sessions: ~30% lower (fewer realtime channels, no global cart joins).

### Out of scope (won't touch)

- Database schema, RLS, RPCs, edge functions (DB is healthy per your last check).
- Visual design, animations.
- The Spring Boot discussion from earlier.

### Verification after rollout

1. Open `/` cold → confirm console shows `[Perf:Route] HomePage mounted in <1500ms`.
2. Click `/orders` → no full-screen spinner; chunk already prefetched.
3. Open `/admin` → DevTools network shows ZERO `cart_items` query.
4. Open `/seller` → ZERO `marketplace-*` queries.
5. Bundle visualizer: `framer-motion`, `lucide-react`, `@capacitor/*` are in dedicated chunks, not vendor.

