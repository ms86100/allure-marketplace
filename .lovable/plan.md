
Performance Hardening Plan

1. What I found causing the current 1–2s lag
- The app does too much global work on every screen:
  - `useCart` is mounted app-wide and fetches full cart items with deep joins, even on screens that only need a badge/bar.
  - `Header` runs society stats counts on every page mount.
  - notification polling and some route-level hooks stay active globally.
- Search is doing duplicate work:
  - `useSearchPage` runs `search_products_fts`
  - `SearchAutocomplete` also runs product FTS + seller search while typing
  - search page still pulls marketplace data/popular products in parallel
- Seller and admin screens overfetch:
  - `useSellerOrderStats` loads all seller orders and computes stats on the client
  - `useAdminData` loads many datasets for all tabs at once
- Some pages mix realtime + polling + focus refetch, creating unnecessary repeat fetches
  - especially order detail / notifications
- There is still broad overfetch in several places (`select *`, large joins, repeated config queries).
- Home page has duplicated intersection/reveal work (`HomePage` observer + `LazySection` observer).

2. Database-side permanent fix
I will first harden the data layer so frontend speed is not dependent on table growth.

A. Add/verify critical indexes for hot paths
- `orders (seller_id, created_at desc)`
- `orders (buyer_id, created_at desc)`
- `orders (seller_id, status, created_at desc)` with partial optimization for non-`payment_pending`
- `orders (buyer_id, status, created_at desc)`
- `orders (society_id, status)`
- `order_items (order_id)`
- `cart_items (user_id, product_id)` and `cart_items (user_id)`
- `delivery_addresses (user_id, is_default desc, created_at desc)`
- `user_notifications (user_id, is_read, created_at desc)`
- expression index for `user_notifications ((data->>'target_role'))` if needed
- `service_bookings (seller_id, booking_date, start_time)`
- `service_bookings (buyer_id, booking_date, start_time)`
- `seller_profiles (society_id, verification_status, is_available)`
- `seller_profiles` searchable name index for autocomplete (`lower(business_name)` / trigram)
- `products (seller_id, approval_status, is_available, category)`
- `products` FTS / search vector index verification for `search_products_fts`
- config tables used everywhere:
  - `system_settings (key)`
  - `admin_settings (key, is_active)`
  - `category_config (is_active, display_order)`
  - `badge_config (is_active, priority)`
  - `parent_groups (sort_order)`

B. Move repeated aggregations server-side
- Replace seller dashboard “load all orders then count in JS” with a SQL aggregate/RPC.
- Replace admin dashboard multi-query overview with one aggregate RPC.
- Replace header “seller count + completed order count” with a compact server-side stats source.
- If needed for scale, add summary tables/materialized summaries for:
  - seller order metrics
  - society marketplace metrics
  - unread notification counters

C. Query-plan validation
- Before adding indexes blindly, inspect the actual hot queries and confirm index usage.
- After changes, validate that list/filter/count queries hit indexes and avoid sequential scans.

3. Frontend-side permanent fix: 10 concrete strategies
1. Split cart into lightweight global state and heavy page-level detail
- Keep only count/total/very-light preview globally.
- Move full `cart_items -> products -> seller_profiles` fetch to cart/checkout screens.
- Files: `src/hooks/useCart.tsx`, `src/components/cart/FloatingCartBar.tsx`, `src/components/layout/AppLayout.tsx`

2. Unify search into one debounced pipeline
- Stop running multiple parallel searches for the same keystroke.
- Share one debounced source between page search and autocomplete.
- Avoid loading marketplace “popular products” while active typed search is running.
- Files: `src/hooks/useSearchPage.ts`, `src/components/search/SearchAutocomplete.tsx`, `src/pages/SearchPage.tsx`

3. Replace client-side stats scans with server-returned aggregates
- Seller dashboard should never fetch all orders just to compute counters.
- Files: `src/hooks/queries/useSellerOrders.ts`, `src/pages/SellerDashboardPage.tsx`

4. Make admin data tab-lazy instead of all-at-once
- Load only the active admin tab.
- Defer reviews/payments/reports until opened.
- Files: `src/hooks/useAdminData.ts`, `src/pages/AdminPage.tsx`

5. Reduce global background work
- Gate app-wide hooks by route/role so buyer-only logic does not run on every screen for everyone.
- Files: `src/App.tsx`

6. Remove duplicate scroll/reveal observers
- Keep `LazySection` and remove the extra DOM-wide reveal observer from `HomePage`.
- Files: `src/pages/HomePage.tsx`, `src/components/home/LazySection.tsx`

7. Tune React Query defaults per data type
- Static config: very long stale times
- Lists: moderate stale times, no unnecessary focus refetch
- Realtime-backed entities: prefer subscriptions over polling
- Files: `src/App.tsx`, query hooks across `src/hooks/`

8. Eliminate broad overfetch
- Replace `select('*')` and oversized joins with exact columns on hot screens.
- Files especially: cart, order detail, admin, seller detail, service booking hooks

9. Make header data route-aware
- Stop fetching society stats on every page if the screen does not need them.
- Cache/memoize shared header metadata once.
- Files: `src/components/layout/Header.tsx`

10. Add performance guardrails so the lag does not come back
- Extend existing telemetry (`perf-telemetry.ts`) for:
  - route mount time
  - search latency
  - cart hydration latency
  - seller dashboard latency
- Add slow-query warnings and a small performance checklist for future hooks/components.

4. Concrete implementation order
Phase 1 — Biggest wins first
- Split cart global vs detailed
- Fix search duplication
- Replace seller stats with server aggregate
- Make admin data lazy-by-tab

Phase 2 — System-wide cleanup
- Remove duplicate observers
- Reduce header/global polling work
- tighten query configs and remove overfetch

Phase 3 — Regression-proofing
- add telemetry to hot routes
- document query/index rules
- validate post-change network load and render timings

5. Files I will update
- `src/hooks/useCart.tsx`
- `src/components/cart/FloatingCartBar.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/components/layout/Header.tsx`
- `src/hooks/useSearchPage.ts`
- `src/components/search/SearchAutocomplete.tsx`
- `src/pages/SearchPage.tsx`
- `src/hooks/queries/useSellerOrders.ts`
- `src/pages/SellerDashboardPage.tsx`
- `src/hooks/useAdminData.ts`
- `src/pages/AdminPage.tsx`
- `src/pages/HomePage.tsx`
- `src/components/home/LazySection.tsx`
- `src/hooks/useOrderDetail.ts`
- `src/App.tsx`
- `src/contexts/auth/AuthProvider.tsx`

6. Database work included in the implementation
- create migration(s) for missing indexes
- add server-side aggregate RPCs where the frontend is currently computing from large row sets
- validate index usage against the slowest paths before and after

7. Technical details
- The main root causes are overfetching, duplicate queries, client-side aggregation, and too much always-on global work.
- The most important structural fix is separating “global lightweight state” from “page-level heavyweight data”.
- The most important database fix is to stop growing-table queries from being scanned repeatedly without targeted indexes or server-side aggregation.
- This plan is designed to be durable: fewer duplicate fetches, better query shapes, route-aware loading, and index-backed hot paths instead of one-off tweaks.
