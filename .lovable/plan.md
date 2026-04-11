

# Performance Optimization Plan — Sub-200ms Page Loads, Sub-1s Operations

## Current State Analysis

### Database Bottlenecks Identified

**1. Massive sequential scan problem** — Several critical tables have near-zero index hit rates:
| Table | Seq Scans | Idx Scans | Idx Hit % |
|-------|-----------|-----------|-----------|
| seller_profiles | 7,701 | 223 | 2.8% |
| profiles | 5,171 | 64 | 1.2% |
| user_roles | 6,485 | 1,247 | 16.1% |
| societies | 948 | 0 | 0.0% |
| chat_messages | 309 | 0 | 0.0% |
| service_listings | 270 | 0 | 0.0% |
| parent_groups | 1,073 | 248 | 18.8% |
| system_settings | 380 | 331 | 46.6% |

**2. Missing foreign key indexes** — ~50+ FK columns have no index (chat_messages.order_id, coupon_redemptions.coupon_id, delivery_assignments.order_id, etc.)

**3. `search_sellers_paginated` RPC** — Computes Haversine distance in pure SQL with no spatial index (no PostGIS). The correlated subquery `(SELECT count(*) FROM products WHERE...)` runs per-row.

**4. `get_products_for_sellers` RPC** — Sorts by `is_bestseller DESC, is_recommended DESC, name` but existing index `idx_products_seller_avail` only covers `(seller_id, is_available, approval_status)`.

**5. Duplicate indexes** — `idx_products_seller_avail` and `idx_products_seller_available_approved` are identical.

### Frontend Bottlenecks

**6. Waterfall data loading** — `useMarketplaceData` loads sellers first, then fires products query only after sellers resolve. Two sequential network round trips.

**7. No query deduplication on config tables** — `category_status_flows` (509 seq scans), `category_config`, `parent_groups`, `system_settings` are fetched repeatedly without long-enough stale times.

**8. Chat messages have zero indexes** — Only a PK index. Every chat query does a full table scan.

---

## Implementation Plan

### Phase 1: Critical Missing Indexes (Migration)

Add indexes for the highest-impact seq-scan tables:

```sql
-- chat_messages: queried by order_id constantly
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_order_id
  ON chat_messages (order_id, created_at DESC);

-- chat_messages: read receipt updates
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_receiver_read
  ON chat_messages (receiver_id, read_at) WHERE read_at IS NULL;

-- service_listings: no indexes at all
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_service_listings_seller
  ON service_listings (seller_id);

-- societies: 0% index usage, joined in search_sellers_paginated
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_societies_id
  ON societies (id); -- PK exists but stats show 0 idx_scan

-- subcategories: high seq scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subcategories_category
  ON subcategories (category_id);

-- system_settings: queried by key constantly
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_settings_key
  ON system_settings (key);

-- reports: no indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reports_society
  ON reports (society_id, created_at DESC);

-- coupon_redemptions FK indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coupon_redemptions_coupon
  ON coupon_redemptions (coupon_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coupon_redemptions_order
  ON coupon_redemptions (order_id);

-- delivery_assignments FK indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_assignments_order
  ON delivery_assignments (order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_assignments_partner
  ON delivery_assignments (partner_id);
```

### Phase 2: Optimize `search_sellers_paginated` RPC

Replace the correlated `count(*)` subquery with a pre-aggregated join:

```sql
-- Replace: (SELECT count(*) FROM products p WHERE p.seller_id = sp.id AND p.is_available = true)
-- With: LEFT JOIN (SELECT seller_id, count(*) as cnt FROM products WHERE is_available = true AND approval_status = 'approved' GROUP BY seller_id) pc ON pc.seller_id = sp.id
```

This eliminates N+1 product count queries inside the RPC.

### Phase 3: Drop Duplicate Index

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_products_seller_avail;
-- idx_products_seller_available_approved covers the same columns
```

### Phase 4: Frontend Query Optimization

**a) Increase stale times for config/reference data tables:**
- `category_status_flows`, `category_config`, `parent_groups`, `subcategories`, `system_settings` — these are admin-edited, rarely change. Bump to 30-minute stale time.
- `action_type_workflow_map` — same treatment.

**b) Add `select()` column pruning** to heavy queries:
- `useOrdersList` selects `*` from orders — prune to only needed columns.
- Marketplace seller/product queries should specify exact columns instead of `*`.

**c) Prefetch config data in App.tsx** on mount so it's cached before any page needs it.

### Phase 5: Database Maintenance

**a) Run ANALYZE** on high-traffic tables to update planner statistics:
```sql
ANALYZE seller_profiles, products, orders, order_items, profiles,
  user_roles, chat_messages, category_status_flows, parent_groups;
```

**b) Verify autovacuum is running** — the query showed `last_autovacuum` data exists, confirming it's active.

### Phase 6: Seller Geo Query — Bounding Box Pre-filter

Add a bounding-box WHERE clause before the expensive Haversine formula in `search_sellers_paginated`:

```sql
-- Fast rectangular pre-filter using the btree index on (latitude, longitude)
AND sp.latitude BETWEEN (_lat - _radius_km / 111.0) AND (_lat + _radius_km / 111.0)
AND sp.longitude BETWEEN (_lng - _radius_km / (111.0 * cos(radians(_lat)))) AND (_lng + _radius_km / (111.0 * cos(radians(_lat))))
```

This lets PostgreSQL use `idx_seller_profiles_geo_verified` to filter before computing Haversine.

---

## Files Affected

| Change | Files |
|--------|-------|
| Migration: indexes + RPC optimization | New migration SQL |
| Frontend stale times | `src/hooks/useCategoryStatusFlow.ts`, `src/hooks/useStatusLabels.ts`, multiple config hooks |
| Prefetch config | `src/App.tsx` |
| Column pruning | `src/hooks/useOrdersList.ts` |
| Drop duplicate index | Migration SQL |

## Risk Assessment

- All indexes use `CREATE INDEX CONCURRENTLY` — zero downtime, no table locks
- RPC changes are `CREATE OR REPLACE` — atomic swap
- Frontend changes are cache-policy only — no functional behavior change
- `DROP INDEX` on confirmed duplicate — safe
- `ANALYZE` is a read-only stats update — zero risk

## Stability Assurance

- No schema modifications to existing columns
- No RLS policy changes
- No trigger modifications
- TypeScript build verification after frontend changes
- All changes are independently revertible

