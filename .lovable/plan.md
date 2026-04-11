

# Performance Optimization — Round 7 (Seller Flow Deep Dive)

## Bottlenecks Found

### 1. `SellerEarningsPage` — Unbounded pagination loop fetching ALL payment records
The earnings page fetches **all** payment records in a `while(true)` loop with 1000-row pages, including `select('*')` with a joined `orders` table. For sellers with many transactions, this is extremely slow and blocks the UI until every page is fetched.

**Fix:** Replace the fetch-all loop with a single aggregate query. Compute stats server-side (today/week/month/allTime earnings) and only fetch recent transactions for display (limit 50). Add a "Load More" button for history.

### 2. `SellerRefundList` — N+1 query pattern (2 sequential queries)
First fetches all order IDs for the seller, then queries `refund_requests` with `.in('order_id', orderIds)`. This is an unnecessary waterfall — refund_requests can be joined directly.

**Fix:** Single query: `refund_requests` joined to `orders` filtered by `seller_id`, with explicit column list instead of `select('*')`.

### 3. `SellerSettings` — `select('*')` on `seller_profiles`
`useSellerSettings.ts` line 81 fetches the entire seller_profiles row with `select('*')`.

**Fix:** Replace with explicit column list matching the form fields needed.

### 4. `useSellerApplication` — `select('*')` on `products` and `seller_profiles`
Lines 107 and 119 fetch full rows unnecessarily.

**Fix:** Prune to required columns.

### 5. Missing indexes causing sequential scans
| Table | Seq Scans | Issue |
|-------|-----------|-------|
| `service_listings` | 275 | No index on `product_id` being used (exists but 0 idx_scan) |
| `payment_records` | 199 | No index on `seller_id` — all earnings queries do seq scan |
| `service_availability_schedules` | 185 | No index on `seller_id` being used |

**Fix:** Create composite indexes on `payment_records(seller_id, created_at DESC)` and ensure `ANALYZE` refreshes stats for these tables.

### 6. `CouponManager`, `ServiceAvailabilityManager`, `DraftProductManager` — `select('*')`
All use `select('*')` when only a subset of columns is needed.

**Fix:** Prune columns in each.

### 7. `AvailabilityPromptBanner` — 3 sequential queries (waterfall)
Fetches products, then service_listings count, then schedules count — all sequentially.

**Fix:** Parallelize with `Promise.all()` or combine into 2 queries.

---

## Implementation Plan

### Migration (single SQL file)

```sql
-- Index for payment_records by seller (earnings page)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_records_seller_created
ON payment_records(seller_id, created_at DESC);

-- Index for service_availability_schedules by seller
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_service_schedules_seller
ON service_availability_schedules(seller_id, is_active) WHERE product_id IS NULL;

-- Refresh stats
ANALYZE payment_records;
ANALYZE service_listings;
ANALYZE service_availability_schedules;
ANALYZE coupons;
```

### Frontend Changes

| File | Change |
|------|--------|
| `src/pages/SellerEarningsPage.tsx` | Replace unbounded pagination loop with limit-50 fetch + compute stats from `useSellerOrderStats` (already cached) |
| `src/components/seller/SellerRefundList.tsx` | Single query with join instead of N+1; prune `select('*')` |
| `src/hooks/useSellerSettings.ts` | Replace `select('*')` with explicit columns |
| `src/hooks/useSellerApplication.ts` | Prune `select('*')` on products and seller_profiles |
| `src/components/seller/CouponManager.tsx` | Prune `select('*')` on coupons |
| `src/components/seller/AvailabilityPromptBanner.tsx` | Parallelize 3 sequential queries with `Promise.all()` |
| `src/components/seller/ServiceAvailabilityManager.tsx` | Prune `select('*')` |

### Risk Assessment
- All `CREATE INDEX CONCURRENTLY` — zero downtime
- Column pruning is read-only — no functional change
- SellerEarnings refactor preserves same stats calculation logic, just removes the unbounded loop
- Each change independently revertible
- TypeScript build verification after all changes

