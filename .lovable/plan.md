

# Multi-Tenant Feature Monetization & Per-Society Feature Control

## Current State Assessment

### What Already Exists
- **`society_features` table**: Simple key-value toggle per society (feature_key + is_enabled)
- **`useSocietyFeatures` hook**: Queries society_features, defaults to enabled if no record exists
- **`FeatureGate` component**: UI-level gate wrapping pages (used on 5 pages: Disputes, Progress, Bulletin, Finances, Snags)
- **`BottomNav` filtering**: Hides nav items based on feature state
- **`SocietyAdminPage` Features tab**: Flat list of 15 toggles with no packaging or restrictions
- **Builder infrastructure**: `builders`, `builder_members`, `builder_societies` tables with RLS
- **Audit logging**: `audit_log` table + `logAudit()` helper
- **15 hardcoded FeatureKey types** in TypeScript

### What Must Change
The current system is a flat toggle list with no hierarchy, no packaging, no builder-level assignment, and no restriction on what society admins can configure. It must evolve into a 4-tier resolution system: Platform -> Package -> Builder -> Society.

---

## Architecture Overview

```text
+---------------------+
|  platform_features   |  Master catalog (200+ features)
+---------------------+
          |
+---------------------+
|  feature_packages    |  Bundles (Basic, Pro, Enterprise)
|  feature_pkg_items   |
+---------------------+
          |
+---------------------+
|  builder_feature_pkgs|  Builder buys a package
+---------------------+
          |
+---------------------+
| society_feature_     |  Society-level overrides
|   overrides          |  (only within package scope)
+---------------------+
          |
+---------------------+
| get_effective_       |  Runtime resolution function
|   society_features() |  (cached via React Query)
+---------------------+
```

---

## Implementation Plan

### Phase 1: Database Schema (Migration)

**Table 1: `platform_features`** -- Master feature catalog

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| feature_key | text UNIQUE | e.g. 'marketplace', 'disputes' |
| feature_name | text | Human-readable name |
| description | text | |
| category | text | governance, marketplace, finance, operations, construction |
| is_core | boolean DEFAULT false | Cannot be disabled (e.g. profile, auth) |
| is_experimental | boolean DEFAULT false | Beta features |
| society_configurable | boolean DEFAULT true | Can society admins toggle this? |
| created_at | timestamptz | |
| updated_at | timestamptz | |

- Index on `feature_key`
- RLS: Platform admins manage; authenticated users can SELECT

**Table 2: `feature_packages`** -- Package definitions

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| package_name | text | Basic, Pro, Enterprise |
| description | text | |
| price_tier | text | free, basic, pro, enterprise |
| created_at | timestamptz | |

- RLS: Platform admins manage; builder members can SELECT

**Table 3: `feature_package_items`** -- Features in each package

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| package_id | uuid FK | |
| feature_id | uuid FK | |
| enabled | boolean DEFAULT true | |
| UNIQUE(package_id, feature_id) | | |

- RLS: Same as feature_packages

**Table 4: `builder_feature_packages`** -- Package assigned to builder

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| builder_id | uuid FK | |
| package_id | uuid FK | |
| assigned_at | timestamptz | |
| expires_at | timestamptz nullable | |
| assigned_by | uuid FK profiles | |
| UNIQUE(builder_id, package_id) | | |

- RLS: Platform admins manage; builder members can view own
- Index on `builder_id`

**Table 5: `society_feature_overrides`** -- Per-society overrides

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| society_id | uuid FK | |
| feature_id | uuid FK | |
| is_enabled | boolean | |
| overridden_by | uuid FK profiles | |
| overridden_at | timestamptz | |
| UNIQUE(society_id, feature_id) | | |

- RLS: Platform admins full access; society admins can manage (only configurable features within their package scope)
- Index on `(society_id, feature_id)`

**Seed Data**: Insert all 15 existing feature keys into `platform_features` with appropriate categories.

### Phase 2: Runtime Resolution Function

**`get_effective_society_features(society_id uuid)`** -- SECURITY DEFINER, STABLE

Logic:
1. Find builder for society via `builder_societies`
2. Get all features from builder's assigned packages via `builder_feature_packages` -> `feature_package_items`
3. Apply `society_feature_overrides` on top
4. Force `is_core = true` features to always be enabled
5. Return table of `(feature_key text, is_enabled boolean, source text, society_configurable boolean)`

This uses indexed joins across 5 tables but the dataset is small (200 features max, single builder, single society) so it completes in under 1ms.

### Phase 3: Backward Compatibility Migration

The existing `society_features` table has live data. The migration strategy:

1. Keep `society_features` table temporarily
2. The new `useEffectiveFeatures` hook calls `get_effective_society_features()` RPC
3. Fallback: if no builder package exists for a society, default all features to enabled (preserves current behavior where missing = enabled)
4. Existing `FeatureGate` component signature stays identical -- only the hook internals change

### Phase 4: Frontend Changes

**Refactored Hook: `useEffectiveFeatures`**
- Calls `get_effective_society_features(effectiveSocietyId)` via Supabase RPC
- 5-minute React Query cache (matches current `staleTime`)
- Returns `isFeatureEnabled(key)`, `getFeatureState(key)` (enabled/locked/disabled), `isLoading`
- Drop-in replacement for `useSocietyFeatures`

**Updated `FeatureGate`**
- Uses new hook internally
- No API change -- existing 5 page usages work without modification

**Updated `BottomNav`**
- Uses new hook -- no structural change needed

**Updated `SocietyAdminPage` Features Tab**
- Show 3 states per feature:
  - **Locked ON** (core feature or not in package) -- switch disabled, green badge
  - **Configurable** (in package + society_configurable) -- switch enabled
  - **Not Available** (not in builder's package) -- grayed out, not toggleable
- Society admin writes to `society_feature_overrides` instead of `society_features`

**New: Platform Admin Feature Management** (new tab in AdminPage)
- CRUD on `platform_features`
- Package management (create packages, add/remove features)
- Assign packages to builders
- View feature matrix: builder -> societies -> enabled features
- Filter by builder, filter by society
- All changes logged via `logAudit()`

### Phase 5: Write-Path Protection

For critical tables where feature gating at the database level matters:

- Add a reusable helper function: `is_feature_enabled_for_society(society_id, feature_key)` (SECURITY DEFINER)
- This calls the resolution logic and returns boolean
- Apply as RLS condition on high-risk INSERT/UPDATE operations for tables like `dispute_tickets`, `bulletin_posts`, etc.
- This is opt-in per table to avoid performance overhead on every table

### Phase 6: Audit Logging

Every mutation in the new system logs to `audit_log`:
- `feature_created`, `feature_updated`
- `package_created`, `package_modified`
- `package_assigned_to_builder`, `package_removed_from_builder`
- `society_override_changed`

Uses existing `logAudit()` function with `society_id = null` for platform-level actions.

---

## RLS Policy Summary

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| platform_features | authenticated | is_admin(auth.uid()) |
| feature_packages | authenticated | is_admin(auth.uid()) |
| feature_package_items | authenticated | is_admin(auth.uid()) |
| builder_feature_packages | is_admin OR is_builder_member | is_admin(auth.uid()) |
| society_feature_overrides | is_admin OR is_society_admin OR same society | is_admin OR is_society_admin (with configurable check) |

No cross-tenant leakage: builder members only see their builder's packages; society admins only see their society's overrides.

---

## Performance & Scalability Analysis

| Concern | Mitigation |
|---|---|
| 200 features resolved per request | Single RPC call with 3 indexed joins; dataset fits in memory |
| 1M users hitting feature check | React Query 5-min cache; only 1 RPC per session per society |
| N+1 feature checks | Single bulk fetch returns all features; `isFeatureEnabled()` is a local map lookup |
| DB-level feature checks (RLS) | `is_feature_enabled_for_society()` is STABLE + SECURITY DEFINER; Postgres caches within transaction |
| Future: 500+ features | Indexed joins scale linearly; consider materialized view only if > 1000 features |

---

## Migration & Backward Compatibility

1. New tables are additive -- no existing tables dropped
2. `society_features` table retained but deprecated
3. Hook swap: `useSocietyFeatures` -> `useEffectiveFeatures` (same API surface)
4. If a society has no builder (legacy data), all features default to enabled
5. Existing `FeatureGate` component unchanged externally
6. Zero downtime migration

---

## Files to Create/Modify

| File | Action |
|---|---|
| `supabase/migrations/...feature_monetization.sql` | New: 5 tables, RPC function, indexes, seed data, RLS |
| `src/hooks/useEffectiveFeatures.ts` | New: Replaces useSocietyFeatures |
| `src/hooks/useSocietyFeatures.ts` | Modify: Re-export from useEffectiveFeatures for backward compat |
| `src/components/ui/FeatureGate.tsx` | Modify: Point to new hook |
| `src/pages/SocietyAdminPage.tsx` | Modify: Features tab shows 3-state UI |
| `src/pages/AdminPage.tsx` | Modify: Add Feature Management tab |
| `src/components/admin/FeatureManagement.tsx` | New: Platform admin CRUD for features, packages, assignments |
| `.lovable/feature-monetization-architecture.md` | New: Architecture document |

---

## Edge Cases Handled

- Society with no builder: All features enabled (backward compat)
- Builder with expired package: `expires_at` check in resolution function
- Society admin tries to enable feature not in package: Rejected at RPC level
- Core feature toggle attempt: Ignored (always returns enabled)
- Feature key not in platform_features: Defaults to disabled (secure by default)
- Multiple packages per builder: Union of all package features

