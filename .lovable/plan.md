
Goal: remove the recurring “fast only if recently visited, slow after idle” behavior by fixing the real structural causes, not just tuning cache timers.

What I found
- There are still app-wide hooks running on every route:
  - `useBuyerOrderAlerts`, `useLiveActivityOrchestrator`, `useReorderInterceptor`, `useAppLifecycle`, global cart, header stats, unread notifications.
- The lag-after-idle pattern is real because several queries re-fire or revalidate after inactivity/resume, and some routes still trigger heavy fetches on first interaction after sitting idle.
- There are multiple runtime query/schema errors happening right now, which directly add delay and noisy retries:
  - `get_effective_society_features` is failing with `column sfo.feature_key does not exist`
  - `service_recurring_configs -> products` FK hint is invalid in client queries
  - `service_bookings -> profiles` FK hint is invalid in client queries
  - `snag_tickets.acknowledged_at` is queried even though the column does not exist
  - a function is throwing `UPDATE is not allowed in a non-volatile function`
- Some earlier “performance fixes” were not durable because expensive work still exists:
  - `Header` still does society stats counts globally
  - `CartProvider` still fetches full joined cart data app-wide
  - `AuthProvider` prefetches multiple large datasets immediately after auth
  - seller stats still scan all seller orders client-side
  - admin core data still loads multiple broad datasets and computes revenue client-side
  - search still has split logic between page search and autocomplete
- There are still policies violating your own performance memory:
  - `useServiceSlots` and `ActiveOrderStrip` use `refetchOnWindowFocus: true`

Permanent fix plan

1. Stop all broken queries first
These are not just bugs; they create repeated failed requests, retries, console noise, and user-visible lag.
- Fix `get_effective_society_features` path so the RPC matches the live schema exactly.
- Fix invalid relationship-hint selects in:
  - `useServiceBookings.ts`
  - any admin/service booking consumers
  - recurring config queries
- Fix `snag_tickets` analytics/report queries to stop selecting missing columns.
- Fix the non-volatile DB function trying to do `UPDATE`.

2. Remove heavyweight global work from the shell
Refactor app shell so only minimal cross-route logic stays mounted globally.
- Keep globally:
  - auth/session state
  - lightweight cart count only
  - unread notification count only
- Move out of global shell or gate by route/role:
  - full cart hydration
  - live activity orchestration
  - buyer order realtime listeners
  - seller new-order alerts
  - header society stats
  - reorder interception unless reorder param exists
- Result: idle resume won’t wake large parts of the app unnecessarily.

3. Split cart into light global + heavy route-level detail
Current issue: `CartProvider` globally fetches full `cart_items -> products -> seller_profiles`.
Permanent structure:
- Global app state: `cart-count`, `cart-total`, maybe tiny preview only.
- Route-level heavy fetch only on `/cart` and checkout-related screens.
- Remove `refetchOnMount: 'always'` for full cart query from the global shell.

4. Make header route-aware and constant-time
- Stop running seller/order count queries in `Header` on every page.
- Show those stats only where they matter, or load them from a compact cached RPC.
- Keep header rendering instant on navigation.

5. Replace client-side aggregation with server-side aggregates
Move these to RPCs:
- seller dashboard stats
- admin dashboard overview
- society header/location stats if still needed
This avoids fetching broad rowsets and counting/summing in JS after idle.

6. Fix the idle-resume invalidation strategy
Current issue: resume/focus behavior still wakes too many queries.
Implementation changes:
- remove all remaining `refetchOnWindowFocus: true`
- narrow `useAppLifecycle` invalidation to only active route data
- invalidate by route/role, not app-wide
- only keep realtime/polling for genuinely active entities
- prefer targeted `setQueryData` or exact invalidation over broad key invalidation

7. Unify search into one pipeline
- Share a single debounced search source between autocomplete and search page
- prevent parallel FTS + marketplace/popular fallback loads while an active typed search is running
- cache recent search results by normalized query + location + radius
- add abort/cancel handling so stale searches never block current UI

8. Tighten database/query layer permanently
I inspected migrations and many indexes already exist, but this still needs a hardening pass tied to real hot paths.
I will:
- verify existing hot indexes are actually aligned to current queries
- add/repair any missing indexes for:
  - `orders (seller_id, created_at desc)`
  - `orders (seller_id, status, created_at desc)`
  - `orders (buyer_id, created_at desc)`
  - `orders (buyer_id, status, created_at desc)`
  - `cart_items (user_id, product_id)` and `cart_items (user_id)`
  - `user_notifications (user_id, is_read, created_at desc)`
  - `service_bookings (seller_id, booking_date, start_time)`
  - `service_bookings (buyer_id, booking_date, start_time)`
  - `service_slots (product_id, slot_date, start_time)`
  - `seller_profiles (society_id, verification_status, is_available)`
  - seller name search index for autocomplete if missing/misaligned
- verify FTS path for `search_products_fts`
- add DB-side aggregate RPCs where the frontend currently scans rows

9. Remove redundant auth/bootstrap prefetching
`AuthProvider` currently prefetches several datasets immediately after auth:
- category configs
- badge config
- parent groups
- effective features
- marketplace sellers
This needs to be prioritized and gated so auth restore does not trigger a burst that slows the first click after idle.

10. Add regression guardrails so this never silently returns
- instrument route mount time on core pages
- instrument cart hydration, seller dashboard, admin dashboard, search latency
- add guarded slow-query wrappers to hot queries
- add a strict project rule:
  - no new global deep joins
  - no `refetchOnWindowFocus: true`
  - no client-side aggregation of large rowsets
  - no broad shell-level prefetch without route demand
- validate with browser performance profiling before and after

Files likely to change
- `src/App.tsx`
- `src/contexts/auth/AuthProvider.tsx`
- `src/contexts/auth/useAuthState.ts`
- `src/components/layout/Header.tsx`
- `src/hooks/useCart.tsx`
- `src/hooks/useCartCount.ts`
- `src/hooks/useUnreadNotificationCount.ts`
- `src/hooks/useAppLifecycle.ts`
- `src/hooks/useSearchPage.ts`
- `src/components/search/SearchAutocomplete.tsx`
- `src/hooks/queries/useSellerOrders.ts`
- `src/hooks/useAdminData.ts`
- `src/hooks/useServiceBookings.ts`
- `src/hooks/useServiceSlots.ts`
- `src/pages/SellerDashboardPage.tsx`
- `src/pages/AdminPage.tsx`
- `src/pages/SocietyReportPage.tsx`
- related Supabase migrations/functions for broken RPCs and index hardening

Validation after implementation
- idle on any page, then navigate: page should feel immediate without full-screen skeleton delay
- seller/admin/buyer routes checked separately
- search typing should not trigger duplicate requests
- no failing schema/RPC requests in console/network
- browser performance profile should show reduced long tasks and lower request bursts after idle
- confirm mobile behavior too, since idle-resume issues are often worse there

Technical details
- Right now the app is not just “slow”; it is doing extra work after idle and also paying a penalty from repeated broken queries.
- The fastest durable win is:
  1. stop the failing queries
  2. strip heavyweight work out of the app shell
  3. move stats to RPCs
  4. narrow invalidation/resume behavior
- This is the path to a robust fix. A purely cache-based fix will regress again; the structure has to change.
