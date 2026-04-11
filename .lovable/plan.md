

# Performance Optimization — Round 3

## What was found

### 1. `search_nearby_sellers` RPC — correlated jsonb subquery per row
This RPC computes a full `jsonb_agg(...)` of matching products **per seller row** as a correlated subquery. It also calls `haversine_km()` **3 times per row** (distance calc, two WHERE filters) without any bounding-box pre-filter. This is the slowest marketplace query.

**Fix:** Rewrite to use a pre-aggregated `LEFT JOIN` for product matching (same pattern already applied to `search_sellers_paginated`), and add a bounding-box pre-filter using society coordinates.

### 2. 17 duplicate index pairs wasting RAM and write performance
Each duplicate index consumes memory and slows every INSERT/UPDATE. Notable duplicates:
- `idx_user_roles_user_role` duplicates `user_roles_user_id_role_key`
- `idx_seller_coords` duplicates `idx_seller_profiles_geo_verified`
- `idx_societies_slug` duplicates `societies_slug_key`
- `idx_system_settings_key` duplicates `system_settings_key_key`
- `idx_payment_records_order` duplicates `payment_records_order_id_unique`
- 12 more pairs

**Fix:** Drop the redundant non-unique index from each pair (keep the unique/partial one).

### 3. `profiles` table — 5,181 seq scans, 64 idx scans (1.2% hit rate)
Queries like `has_role()` in RLS policies trigger seq scans. The `profiles_pkey` index exists but isn't being used because most queries filter by `society_id` or `verification_status`.

**Fix:** Already has `idx_profiles_society_verification` — the stats show it has 0 idx_scan, meaning the planner is choosing seq scans. Running `ANALYZE profiles` (already done in round 1) should fix this. The real issue is that tables are tiny (8 rows in user_roles, ~5 in profiles) — Postgres rationally chooses seq scan. No action needed beyond the duplicate cleanup.

### 4. `get_products_for_sellers` RPC — redundant indexes
`idx_products_seller_id` (simple), `idx_products_seller_available_approved` (composite), and `idx_products_seller_sort` (covering) all overlap. The covering index from round 2 subsumes the others.

**Fix:** Drop `idx_products_seller_id` (subsumed by the covering index).

### 5. Frontend — 70 files still using `.select('*')`
Many hooks fetch all columns when they need only a few. Key offenders: `OrderChat.tsx` (chat_messages), `AuthProvider.tsx` (badge_config, parent_groups), admin pages.

**Fix:** Prune columns in the highest-traffic queries: `OrderChat.tsx`, `ActiveOrderStrip.tsx`, and `AuthProvider.tsx` prefetches.

### 6. `chat_messages.select('*')` in OrderChat — zero indexes used
Chat messages are fetched with `select('*')` and filtered by `order_id`. The index from round 1 (`idx_chat_messages_order_id`) was created — now prune columns to reduce payload.

---

## Implementation

### Migration (single SQL file)

**a) Optimize `search_nearby_sellers`** — replace correlated jsonb product subquery with pre-aggregated LEFT JOIN, add bounding-box pre-filter on society coordinates.

**b) Drop 13 duplicate indexes:**
- `idx_user_roles_user_role` (dup of `user_roles_user_id_role_key`)
- `idx_seller_coords` (dup of `idx_seller_profiles_geo_verified`)
- `idx_societies_slug` (dup of `societies_slug_key`)
- `idx_system_settings_key` (dup of `system_settings_key_key`)
- `idx_payment_records_order` (dup of `payment_records_order_id_unique`)
- `idx_parent_groups_slug` (dup of `parent_groups_slug_key`)
- `idx_products_seller_id` (subsumed by covering index)
- `idx_bulletin_posts_society` (dup of `idx_bulletin_society`)
- `idx_notifications_user_read_created` (dup of `idx_user_notifications_user_read`)
- `idx_trigger_errors_created` (dup of `idx_trigger_errors_created_at`)
- `idx_service_availability_seller` (dup of unique constraint index)
- `idx_worker_attendance_worker_date` (dup of unique constraint)
- `idx_orders_booking_idempotency` (dup of `idx_orders_buyer_idempotency`)

**c) ANALYZE** on tables that haven't been analyzed recently.

### Frontend changes

**a) `OrderChat.tsx`** — Replace `select('*')` with explicit columns: `id, order_id, sender_id, receiver_id, message, created_at, read_at, read_status, message_type`.

**b) `AuthProvider.tsx`** — Prune `parent_groups` prefetch to `id, name, slug, sort_order, icon_url`. Prune `badge_config` to `id, badge_key, label, icon, color, priority`.

**c) `ActiveOrderStrip.tsx`** — Prune order query columns if using `select('*')`.

### Files affected
| Change | File |
|--------|------|
| Migration: RPC rewrite + drop duplicates | New migration SQL |
| Chat column pruning | `src/components/chat/OrderChat.tsx` |
| Prefetch pruning | `src/contexts/auth/AuthProvider.tsx` |

### Risk
- All `DROP INDEX CONCURRENTLY` — zero downtime
- RPC is `CREATE OR REPLACE` — atomic swap, same return type
- Column pruning is read-only — no functional change
- Each change independently revertible

