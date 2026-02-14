

# Multi-Tenant SaaS Product Readiness -- Implementation Plan

## Overview

This plan addresses the three critical gaps preventing the platform from being a true SaaS product: (1) society context switching for platform admins and builders, (2) builder operational power, and (3) society-level feature autonomy. These are UX and product-layer changes -- not database changes.

---

## Priority 1: Society Context Switching System

### Problem
Platform admins and builders are locked to their own `profile.society_id`. They cannot "view as" or operate within another society. At 100 societies, this makes admin operations impossible.

### Solution
Add `viewAsSocietyId` state to `AuthContext` that overrides the default `profile.society_id` for UI rendering only. RLS remains untouched -- admins already have cross-society SELECT access via `is_admin()` policies.

### Changes

**AuthContext.tsx**
- Add `viewAsSocietyId: string | null` state
- Add `setViewAsSociety(id: string | null)` function
- Add computed `effectiveSocietyId` that returns `viewAsSocietyId || profile?.society_id`
- Add `effectiveSociety: Society | null` that fetches the viewed society's data when switching
- Expose all three in the context value

**New component: `src/components/admin/SocietySwitcher.tsx`**
- Dropdown component that lists all societies (fetched via admin-accessible query)
- Shows current society name with a badge indicating "viewing as"
- "Reset to my society" option to clear override
- Only renders for platform admins and builder members

**Header.tsx**
- When `viewAsSocietyId` is set and user is admin/builder, show a colored banner below header: "Viewing: [Society Name]" with a dismiss button
- Replace `society?.name` with `effectiveSociety?.name` in location display

**AdminPage.tsx**
- Add `SocietySwitcher` at the top of the page
- Filter pending users, pending sellers, and all data by `effectiveSocietyId` when set (currently shows all globally -- add optional filter)

**SocietyAdminPage.tsx**
- Replace hardcoded `profile?.society_id` with `effectiveSocietyId`
- Platform admins can now enter any society's admin panel via context switch
- All queries already use `societyId` variable -- just change the source

**SocietyDashboardPage.tsx, SocietyFinancesPage.tsx, SnagListPage.tsx, DisputesPage.tsx**
- Replace `profile?.society_id` references with `effectiveSocietyId` from auth context
- No query changes needed -- RLS allows admin access already

### Security Note
No RLS changes required. Platform admins already have `is_admin(auth.uid())` access across all societies. This change only affects which society's data the UI displays -- the database still enforces access rules independently.

---

## Priority 2: Builder Operational Dashboard

### Problem
Builder dashboard (`BuilderDashboardPage.tsx`) is view-only. Clicking a society links to `/society` which shows the builder's own society, not the clicked one.

### Solution
Make society cards actionable by integrating with the context switcher, and add inline operational capabilities.

### Changes

**BuilderDashboardPage.tsx**
- On society card click: call `setViewAsSociety(society.id)` then navigate to `/society`
- This makes the entire society ecosystem (dashboard, admin, finances, snags, disputes) work in the context of the clicked society
- Add quick-action buttons per society card:
  - "Pending Users" count as clickable badge -> navigates to `/society/admin` in that society context
  - "Open Disputes" count as clickable badge -> navigates to `/disputes` in that society context
- Add "View All" button per society that navigates to `/society` with context set

**New: Builder-level aggregate metrics section**
- Total revenue across all managed societies (query `orders` table filtered by society_ids in `builder_societies`)
- Combined pending approval count
- Combined dispute SLA status (breached vs on-track)
- Uses a new React Query hook: `src/hooks/queries/useBuilderStats.ts`

---

## Priority 3: Society Feature Autonomy

### Problem
There is no per-society feature configuration. All societies share the same global `category_config` and `parent_groups`. `featured_items` now has `society_id` but there is no UI to manage society-scoped featured items.

### Solution

**Database migration: `society_features` table**

| Column | Type | Default |
|---|---|---|
| id | uuid | gen_random_uuid() |
| society_id | uuid (FK societies) | NOT NULL |
| feature_key | text | NOT NULL |
| is_enabled | boolean | true |
| config | jsonb | '{}' |
| created_at | timestamptz | now() |

Unique constraint on `(society_id, feature_key)`. RLS: society admins can manage their own society's features, platform admins can manage all.

**Feature keys (initial set):**
- `marketplace` -- enable/disable marketplace for society
- `bulletin` -- enable/disable community bulletin
- `disputes` -- enable/disable dispute system
- `finances` -- enable/disable society finances
- `construction_progress` -- enable/disable builder progress tracking
- `snag_management` -- enable/disable snag tickets
- `help_requests` -- enable/disable help request board

**SocietyAdminPage.tsx -- new "Features" tab**
- Toggle switches for each feature
- Society admins can enable/disable features for their society
- When a feature is disabled, the corresponding nav items and pages show a "Not available in your society" message

**BottomNav.tsx and page-level guards**
- Check `society_features` for the current society
- If a feature is disabled, either hide the nav item or show a disabled state
- Create a shared hook: `src/hooks/useSocietyFeatures.ts` that queries `society_features` for `effectiveSocietyId` with React Query caching (5 min staleTime)

---

## Priority 4: Notification Society Labeling

### Problem
Notifications do not show which society they originate from. At 100 societies, platform admins cannot triage.

### Changes

**Database: Add `society_id` column to `user_notifications`**
- Nullable UUID column (backward compatible with existing notifications)
- No FK constraint needed (already have society_id pattern)

**NotificationInboxPage.tsx**
- When `society_id` is present on a notification, show a small badge with the society name
- For platform admins: add a filter dropdown to filter notifications by society
- Fetch society names via a lightweight join or separate lookup

**Notification creation points (`src/lib/notifications.ts`)**
- Include `society_id` when creating notifications that are society-scoped
- General platform notifications leave `society_id` null

---

## Priority 5: Featured Items Society Scoping UI

### Problem
`featured_items` table now has `society_id` column but the admin UI does not use it.

### Changes

**AdminPage.tsx -- Featured tab**
- When `viewAsSocietyId` is set, filter featured items by that society
- When creating featured items, auto-set `society_id` to `effectiveSocietyId`
- Add a "Global" vs "This Society" toggle when creating featured items

---

## Implementation Sequence

### Phase 1: Context Switching Foundation (highest impact)
1. Update `AuthContext.tsx` with `viewAsSocietyId` + `effectiveSocietyId` + `effectiveSociety`
2. Create `SocietySwitcher` component
3. Update `Header.tsx` with "Viewing as" banner
4. Update `SocietyAdminPage.tsx` to use `effectiveSocietyId`
5. Update `BuilderDashboardPage.tsx` with context-aware navigation

### Phase 2: Society Features Table
6. Database migration for `society_features` table
7. Create `useSocietyFeatures` hook
8. Add "Features" tab to `SocietyAdminPage.tsx`

### Phase 3: Notification Labeling
9. Database migration to add `society_id` to `user_notifications`
10. Update `NotificationInboxPage.tsx` with society badges and filter
11. Update notification creation to include `society_id`

### Phase 4: Builder Dashboard Enhancement
12. Create `useBuilderStats` hook
13. Update `BuilderDashboardPage.tsx` with actionable cards and aggregate metrics

### Phase 5: Featured Items Scoping
14. Update AdminPage featured tab with society filtering

---

## Files Modified

| File | Change Type |
|---|---|
| `src/contexts/AuthContext.tsx` | Add context switching state |
| `src/components/admin/SocietySwitcher.tsx` | New component |
| `src/components/layout/Header.tsx` | Add "viewing as" banner |
| `src/pages/AdminPage.tsx` | Add society switcher + featured filtering |
| `src/pages/SocietyAdminPage.tsx` | Use effectiveSocietyId + features tab |
| `src/pages/BuilderDashboardPage.tsx` | Actionable cards + context navigation |
| `src/pages/SocietyDashboardPage.tsx` | Use effectiveSocietyId |
| `src/pages/NotificationInboxPage.tsx` | Society badges + filter |
| `src/hooks/useSocietyFeatures.ts` | New hook |
| `src/hooks/queries/useBuilderStats.ts` | New hook |
| `src/lib/notifications.ts` | Add society_id to creation |

## Database Migrations

| Migration | Tables |
|---|---|
| Create society_features | New table with RLS |
| Add society_id to user_notifications | ALTER TABLE add column |

---

## Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Context switching in AuthContext | MEDIUM -- affects all society-scoped views | `effectiveSocietyId` is a simple fallback chain; all existing behavior preserved when null |
| society_features table | LOW -- new table, additive | Default all features to enabled; no feature breaks if table is empty |
| Notification society_id | LOW -- nullable column | Existing notifications unaffected |
| Builder dashboard actions | LOW -- uses existing context switcher | No new permissions needed |

---

## Expected Maturity Score After Implementation

| Dimension | Before | After |
|---|---|---|
| Context switching UX | 3 | 8 |
| Builder support | 6 | 8 |
| Society-level autonomy | 8 | 9 |
| Operational automation | 7 | 8 |
| Overall | 6.9 | 8.2 |

