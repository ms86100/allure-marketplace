

# Seller Dashboard — Enterprise-Grade Redesign

## Current State Issues (from code + screenshots)

### Confirmed Problems
1. **SellerRefundList jammed between DashboardStats and Orders** — breaks information hierarchy. It's a full card with earnings impact, wedged between stat counters and order list.
2. **Stats cards (4-col grid)** — `text-[9px]` labels are too small; cards have no visual weight separation.
3. **Store Health + Preview My Store** — Store Health is a collapsible checklist consuming prime real estate. "Preview My Store" is a full-width outline button floating alone between checklist and tabs.
4. **Tools tab structure** — ShareMyStore + 3 action cards + CouponManager all dumped sequentially. Coupons is a marketing tool grouped with operational actions.
5. **Stats tab is overloaded** — contains: "How buyers see your store" card, EarningsSummary, SellerAnalytics (reliability score + low stock + insights + demand stats + commission + top products + peak hours), SellerAnalyticsTab (30d revenue chart + stats + top products by views + peak hours again), SellerCustomerDirectory, DemandInsights. That's ~8 sections with duplicate data (peak hours appears twice, top products appears twice).
6. **Schedule tab** — ServiceBookingStats only renders if bookings > 0, so new sellers see an empty "Today's Schedule" card + empty state. No schedule management capability.
7. **AvailabilityPromptBanner** uses hardcoded amber-50/amber-200 colors (light mode palette) — will look broken in dark theme.
8. **No visual grouping** — everything is `space-y-4` flat stacking with no section headers or logical grouping.

### Missing Capabilities
1. **No real-time order count badge** on Orders tab
2. **No earnings on Orders tab** — seller must switch to Stats to see today's revenue
3. **No "Payouts" link** despite SellerPayoutsPage existing
4. **No auto-accept toggle visible** in dashboard (only in settings)
5. **No communication hub** — chat is buried in individual order detail

---

## Redesign Plan

### Phase 1: Dashboard Structure Cleanup

**File: `src/pages/SellerDashboardPage.tsx`**

**A. Merge Store Health into StoreStatusCard as a compact row**
- Move the health check count (e.g., "4/4 passed") as a small badge inside StoreStatusCard
- Make the full checklist open via a drawer/sheet on tap (keep SellerVisibilityChecklist as drawer content)
- Move "Preview My Store" into StoreStatusCard as a small icon button next to the toggle

**B. Relocate SellerRefundList from Orders tab to its own section**
- Move disputes out of Orders tab → into a dedicated collapsible section at the top of Orders tab, but ONLY show when `pendingCount > 0` (action-needed state)
- When no pending disputes: collapse to a single line "0 disputes" or hide entirely
- This eliminates the visual confusion of refund cards mixed with order stats

**C. Clean up Stats tab duplication**
- Remove `SellerAnalytics` component (which duplicates data from `SellerAnalyticsTab`)
- Keep: SellerReliabilityScore, LowStockAlerts, SellerAnalyticsTab (30d chart + stats), SellerCustomerDirectory, DemandInsights
- Move EarningsSummary from Stats → always visible as a compact bar below StoreStatusCard (sellers check this constantly)
- Remove duplicate "How buyers see your store" card — this data is in SellerReliabilityScore already

**D. Add pending order count badge to Orders tab trigger**
- Show a red dot or count badge on the Orders tab when `pendingOrders > 0`

### Phase 2: Component-Level Fixes

**File: `src/components/seller/DashboardStats.tsx`**
- Increase label font from `text-[9px]` to `text-[11px]`
- Add subtle colored left border per stat type for visual distinction
- Make "Pending" card pulsate when count > 0

**File: `src/components/seller/SellerRefundList.tsx`**
- When 0 disputes: return `null` instead of showing empty card
- When disputes exist but none pending: show collapsed single-line summary
- Only expand full list when `pendingCount > 0`

**File: `src/components/seller/AvailabilityPromptBanner.tsx`**
- Replace hardcoded `amber-50`, `amber-200`, `amber-600` etc. with theme-aware classes: `bg-warning/10`, `border-warning/20`, `text-warning`

**File: `src/components/seller/StoreStatusCard.tsx`**
- Add health badge (passed/total) as a small indicator
- Add Preview button (Eye icon) inline

**File: `src/components/seller/EarningsSummary.tsx`**
- Create a compact "mini" variant for dashboard top area (single row: Today ₹X | Week ₹X | Total ₹X)

### Phase 3: Tools Tab Reorganization

**File: `src/components/seller/QuickActions.tsx`**
- Restructure into two groups:
  - **Operations**: Manage Products, Store Settings, Add Business
  - **Marketing**: Share Store, Coupons (move CouponManager trigger here as a link/card)
- Add "View Payouts" card linking to `/seller/payouts`
- Add "View Earnings" card linking to `/seller/earnings`

**File: `src/pages/SellerDashboardPage.tsx` (Tools tab)**
- Move CouponManager into a sub-page or keep inline but under a "Marketing" section header

### Phase 4: Stats Tab Consolidation

**File: `src/pages/SellerDashboardPage.tsx` (Stats tab)**
- New layout:
  1. SellerReliabilityScore (trust metric)
  2. LowStockAlerts
  3. SellerAnalyticsTab (30d chart + 4 KPI cards + top products + peak hours)
  4. SellerCustomerDirectory
  5. DemandInsights
- Remove SellerAnalytics component import and usage (deduplicated)
- Remove "How buyers see your store" card (data lives in reliability score)

### Phase 5: Schedule Tab Enhancement

**File: `src/pages/SellerDashboardPage.tsx` (Schedule tab)**
- Add a "Manage Services" button at the top (always visible)
- Show week-view mini calendar with dot indicators for days with bookings
- ServiceBookingStats: show even when 0 bookings (with zero state, not hidden)

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/SellerDashboardPage.tsx` | Major restructure: earnings bar, tab badges, stats dedup, refund relocation |
| `src/components/seller/StoreStatusCard.tsx` | Add health badge + preview button inline |
| `src/components/seller/DashboardStats.tsx` | Larger labels, colored borders, pending pulse |
| `src/components/seller/SellerRefundList.tsx` | Hide when empty, collapse when no pending |
| `src/components/seller/EarningsSummary.tsx` | Add compact variant |
| `src/components/seller/QuickActions.tsx` | Reorganize into Operations/Marketing groups, add Payouts link |
| `src/components/seller/AvailabilityPromptBanner.tsx` | Fix dark-mode colors |
| `src/components/seller/ServiceBookingStats.tsx` | Show zero state instead of returning null |

No database changes. No new dependencies. All existing components reused.

