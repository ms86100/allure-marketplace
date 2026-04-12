

# What's Still Missing — Honest Assessment

## Status of Every Plan Item

| Plan Item | Status | Issue |
|-----------|--------|-------|
| Store Health badge in StoreStatusCard | ⚠️ **Broken** | `healthPassed` and `healthTotal` props are never passed from `SellerDashboardPage`. The badge never renders. |
| Preview button in StoreStatusCard | ✅ Done | Eye icon links to `/seller/{id}` |
| Health checklist in Sheet/Drawer | ✅ Done | Bottom sheet with SellerVisibilityChecklist |
| EarningsSummary compact bar | ✅ Done | Renders below StoreStatusCard |
| Pending order badge on Orders tab | ✅ Done | Red badge shows count |
| DashboardStats label size + borders + pulse | ✅ Done | `text-[11px]`, `border-l-2`, pulse on pending |
| SellerRefundList hide/collapse | ✅ Done | Returns null when empty, collapses when no pending |
| AvailabilityPromptBanner dark-mode fix | ✅ Done | Uses `bg-warning/10`, `border-warning/20` |
| QuickActions reorganized | ✅ Done | Operations + Marketing groups |
| Stats tab dedup (remove SellerAnalytics) | ✅ Done | Only SellerAnalyticsTab remains |
| Remove "How buyers see" card | ✅ Done | Not in Stats tab |
| ServiceBookingStats zero state | ⚠️ **Partial** | Component always renders, but still shows 0/0/0/0 cards with no guidance. The `ScheduleEmptyState` below it is redundant — it checks bookings again separately. |
| Schedule tab "Manage Services" button | ✅ Done | Links to `/seller/products` |
| Schedule tab week-view mini calendar | ❌ **Not built** | Plan called for dot indicators on days with bookings — not implemented |
| CouponManager under "Marketing" header in Tools tab | ✅ Done | Has section header |

## What Needs to Be Fixed

### 1. Health Badge Never Renders (Bug)
`StoreStatusCard` accepts `healthPassed` and `healthTotal` props but `SellerDashboardPage` never passes them. Need to call `useSellerHealth(activeSellerId)` in the dashboard and pass the counts.

### 2. Schedule Mini Calendar Missing
The plan specified a week-view mini calendar with dot indicators for days that have bookings. This was never built. Need a simple 7-day row showing Mon-Sun with colored dots on days with bookings.

### 3. ScheduleEmptyState is Redundant
`ServiceBookingStats` now always renders (even at zero), and `ScheduleEmptyState` duplicates the "no bookings" messaging. Should merge: when zero bookings, show a single cohesive empty state within the existing stats component instead of a separate component below.

### 4. Stats Tab: EarningsSummary Shows Twice
`EarningsSummary` compact is rendered at the top of the dashboard (line 278) AND the full variant is rendered again in the Stats tab (line 413). The plan said to move it OUT of Stats. The full variant in Stats should be removed since the compact version is always visible.

---

## Fix Plan

### File: `src/pages/SellerDashboardPage.tsx`

**A. Pass health counts to StoreStatusCard:**
- Import `useSellerHealth` hook
- Call it with `activeSellerId`
- Compute `passed` and `total` from the returned checks array
- Pass `healthPassed={passed}` and `healthTotal={total}` to `<StoreStatusCard>`

**B. Remove duplicate EarningsSummary from Stats tab:**
- Delete lines 413-417 (the full EarningsSummary in Stats tab)

**C. Replace ScheduleEmptyState with mini calendar:**
- Remove the separate `ScheduleEmptyState` component and its usage
- Add a `ScheduleWeekView` inline component that shows 7 days (Mon-Sun) as a compact row with dot indicators for days that have bookings
- Uses existing `useSellerServiceBookings` data already available in scope

### File: `src/components/seller/ServiceBookingStats.tsx`

**D. Add zero-state guidance:**
- When all 4 stat values are 0, show a subtle message below the grid: "Add service products and set store hours to start receiving bookings"

---

### Files Changed

| File | Change |
|------|--------|
| `src/pages/SellerDashboardPage.tsx` | Wire health counts, remove duplicate earnings, add week-view calendar, remove ScheduleEmptyState |
| `src/components/seller/ServiceBookingStats.tsx` | Add zero-state guidance text |

No new dependencies. No DB changes.

