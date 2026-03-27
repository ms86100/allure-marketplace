

# Zero-Risk Performance Optimization Plan

## Current State — Identified Bottlenecks

### 1. Duplicate system_settings queries (HIGH IMPACT)
`useSystemSettings()` fires its own query (`system-settings-core`) across **24 components** — FloatingCartBar, BuyAgainRow, AutoHighlightStrip, ProductDetailSheet, SearchPage, CartPage, ProfilePage, etc. Meanwhile, `useMarketplaceConfig()` already fetches the **entire** `system_settings` table into cache key `system-settings-all`. This means every page load makes **2 separate queries** to the same table. Console logs confirm repeated "Using hardcoded defaults" warnings because the `system-settings-core` query races and sometimes fails.

### 2. Homepage data waterfall
MarketplaceSection depends on `useMarketplaceData()` which depends on `browsingLocation`. The location context resolves after auth, creating a sequential chain: Auth → Profile → Location → Marketplace RPC. No prefetching occurs.

### 3. Re-render cascade from useSystemSettings
24 components import `useSystemSettings()`, each receiving the **full settings object**. When any setting changes (or the query refetches), all 24 components re-render — even if they only read `currencySymbol`.

### 4. Missing `placeholderData` on list views
When navigating back to Orders, Cart, or Search, the query refetches from scratch. Without `placeholderData: keepPreviousData`, users see a loading skeleton on every back-navigation instead of instant content.

---

## Step-by-Step Optimization Strategy

### Step 1: Consolidate system_settings queries (Highest impact, lowest risk)

**What**: Make `useSystemSettings()` read from the `system-settings-all` cache that `useMarketplaceConfig` already populates, instead of running its own query.

**How**: Rewrite `useSystemSettings()` to use `queryClient.getQueryData(['system-settings-all'])` with a fallback query that shares the same key. This eliminates 1 API call per page load.

**Validation**: Console warning "[SystemSettings] Using hardcoded defaults" disappears. Network tab shows only 1 `system_settings` query instead of 2.

**Rollback**: Revert single file `useSystemSettings.ts`. Hardcoded DEFAULTS ensure zero breakage even if cache is empty.

**Expected improvement**: -1 API call per page load (~200-400ms saved on initial load).

---

### Step 2: Add selector pattern to useSystemSettings (Medium impact, zero risk)

**What**: Components that only need `currencySymbol` shouldn't re-render when `headerTagline` changes.

**How**: Add a `select` option to the underlying `useQuery` call, or expose individual hooks like `useCurrencySymbol()` that select a single field. React Query's structural sharing prevents re-renders when the selected value hasn't changed.

**Validation**: React DevTools Profiler shows fewer re-renders on FloatingCartBar, BuyAgainRow, AutoHighlightStrip after a settings refetch.

**Rollback**: Revert `useSystemSettings.ts` — all consumers still work with the full object.

**Expected improvement**: ~40% fewer component re-renders on homepage.

---

### Step 3: Add `placeholderData: keepPreviousData` to list queries (High impact, zero risk)

**What**: Orders list, cart items, notifications, and search results should show stale data instantly while refetching in the background.

**How**: Add `placeholderData: keepPreviousData` to `useOrdersList`, `useCart`, `useCartCount`, `useUnreadNotificationCount`. This makes back-navigation feel instant.

**Validation**: Navigate Home → Orders → Back → Orders. Second visit shows content immediately (no skeleton flash).

**Rollback**: Remove `placeholderData` prop — queries revert to default behavior.

**Expected improvement**: Navigation feels <200ms (content appears from cache while refetch runs silently).

---

### Step 4: Remove redundant refetchOnWindowFocus on static configs (Low risk)

**What**: `useCartCount`, `useUnreadNotificationCount`, and `FeaturedBanners` have `refetchOnWindowFocus: true`, overriding the global `false` default. Cart count already has realtime invalidation. Notification count already polls every 30s.

**How**: Remove explicit `refetchOnWindowFocus: true` from these queries. The polling interval and mutation-driven invalidation already ensure freshness.

**Validation**: Tab-switch no longer triggers 3-4 redundant API calls visible in Network tab.

**Rollback**: Re-add the prop — zero functional impact either way.

**Expected improvement**: -3 API calls per tab-switch event.

---

### Step 5: Increase staleTime on near-static config queries (Low risk)

**What**: Several config queries (badge-config, parent-groups, category-configs, tracking-config, workflow-map) use 10-15min staleTime but change extremely rarely (admin updates only).

**How**: Increase to 30min staleTime for: `badge-config`, `parent-groups`, `category-configs`, `tracking-config`, `listing-type-workflow-map`. These are already prefetched in AuthProvider.

**Validation**: After 15 minutes idle, these queries don't refetch on navigation.

**Rollback**: Reduce staleTime back. No functional impact.

**Expected improvement**: Fewer background refetches during extended sessions.

---

### Step 6: Database indexes for critical queries (Medium impact, zero risk)

**What**: Add composite indexes on frequently queried columns:
- `cart_items(user_id, product_id)` — cart lookups
- `orders(user_id, created_at DESC)` — order history
- `notifications(user_id, is_read, created_at DESC)` — notification inbox

**How**: Database migration with `CREATE INDEX IF NOT EXISTS` — additive only, no table modifications.

**Validation**: Query explain plans show index scans instead of sequential scans.

**Rollback**: `DROP INDEX` — indexes are purely additive.

**Expected improvement**: 30-50% faster query response times on cart/orders/notifications pages.

---

## Safeguards

| Safeguard | Implementation |
|-----------|----------------|
| No functional changes | Every step only changes caching/query behavior, not business logic |
| Hardcoded defaults | `useSystemSettings` always returns DEFAULTS if cache is empty |
| Independent deployability | Each step is a separate commit; any can be reverted without affecting others |
| Regression detection | Console warnings serve as canaries — if "Using hardcoded defaults" reappears, the consolidation step needs review |
| Rollback strategy | Each step touches 1-2 files max; Git revert is instant |

## Target Performance Goals

| Metric | Current (est.) | Target |
|--------|---------------|--------|
| Homepage load | ~2-3s | <1.5s |
| Back-navigation | ~800ms (skeleton flash) | <200ms (instant from cache) |
| API calls per page load | 4-6 | 2-3 |
| Tab-switch API calls | 5-6 | 1-2 |
| Component re-renders per settings change | 24+ | 2-3 (only affected consumers) |

