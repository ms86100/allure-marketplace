

# Admin Monitoring & Analytics Module — Audit & Plan

## What Exists Today

The Admin Panel (`/admin`) currently provides:

**Summary Stats (top cards):** Total users, sellers, orders, revenue, societies, reviews, pending reports — aggregate counts only, no breakdowns.

**Tabs available:**
- **Sellers** — Approval/rejection of pending seller applications
- **Products** — Product approval moderation
- **Users** — Approve/reject pending user registrations
- **Societies** — Verify/activate societies, manage invite codes
- **Payments** — List of `payment_records` with seller name, buyer name, amount, status, filterable by paid/pending/failed/upi/cod — but no aggregation, no per-seller breakdown, no per-buyer history
- **Reports** — Abuse reports moderation
- **Reviews** — Review moderation (hide/show)
- **Disputes** — Dispute resolution
- **Services** — Service booking management
- **Featured/Catalog/Campaigns/Settings** — Configuration tools

## What's Missing (Gaps)

| Capability | Status |
|---|---|
| Orders tab with full order list + lifecycle tracking | **Missing** |
| Per-seller order volume / revenue breakdown | **Missing** |
| Per-buyer order history + transaction trail | **Missing** |
| Society-level analytics (sellers, orders, categories) | **Missing** |
| Category/product-level order analytics | **Missing** |
| Date range filtering (today, 7d, 30d, custom) | **Missing** |
| Order detail drill-down (items, status timeline, payment) | **Partially exists** on buyer/seller side, not in admin |
| Tabular data view with summary metrics | **Missing** |
| Growth tracking over time | **Missing** |

The current admin panel is **moderation-focused** (approve/reject/manage). It lacks an **operational analytics and monitoring** layer entirely.

---

## Proposed Implementation

### New Admin Tab: "Analytics"

Add an "Analytics" tab to the admin sidebar under a new "Intelligence" group. This tab contains sub-views:

#### 1. Platform Overview Dashboard
- Summary cards: Active sellers, total products sold, total orders (with period filter), total revenue
- Period selector: Today / 7 Days / 30 Days / All Time
- Growth indicators (vs previous period)

#### 2. Orders Monitor (Tabular)
- Full paginated table of ALL orders across the platform
- Columns: Order ID, Buyer, Seller, Items, Amount, Status, Payment Status, Date
- Filters: Status, Payment status, Society, Seller, Date range
- Click to expand → full order lifecycle timeline + item details
- Export-ready format

#### 3. Seller Performance Table
- Per-seller row: Business name, Society, Total orders, Today orders, Revenue (7d), Avg rating, Status
- Sortable by any column
- Click to drill into seller's order history

#### 4. Buyer Activity Table
- Per-buyer row: Name, Society, Total orders, Sellers purchased from, Total spent, Last order date
- Click to drill into buyer's full order + payment history

#### 5. Society Breakdown
- Per-society: Seller count, Order volume, Top categories, Revenue
- Expandable to see individual seller stats within that society

#### 6. Category Analytics
- Orders by category (all categories, not just food)
- Top-selling products across platform
- Revenue by category

### Technical Approach

**Database:** No schema changes needed. All data exists in `orders`, `order_items`, `profiles`, `seller_profiles`, `payment_records`, `societies` tables. We'll use client-side queries with filters.

**New files:**
- `src/components/admin/AdminAnalyticsTab.tsx` — Main analytics container with sub-tabs
- `src/components/admin/analytics/PlatformOverview.tsx` — Summary cards + growth
- `src/components/admin/analytics/OrdersMonitor.tsx` — Full orders table with filters and drill-down
- `src/components/admin/analytics/SellerPerformanceTable.tsx` — Per-seller metrics table
- `src/components/admin/analytics/BuyerActivityTable.tsx` — Per-buyer metrics table
- `src/components/admin/analytics/SocietyBreakdown.tsx` — Society-level stats
- `src/components/admin/analytics/CategoryAnalytics.tsx` — Category breakdown
- `src/hooks/queries/useAdminAnalytics.ts` — Data fetching hooks

**Modified files:**
- `src/components/admin/AdminSidebarNav.tsx` — Add "Analytics" nav item
- `src/pages/AdminPage.tsx` — Render `AdminAnalyticsTab` when tab is active

**Key UI patterns:**
- Tabular format with sortable columns using existing Card/Table components
- Summary metric cards at top of each view
- Date range picker (Today / 7d / 30d / All)
- Expandable rows for drill-down (order items, lifecycle timeline)
- Pagination for large datasets

This gives the admin complete end-to-end visibility: platform-wide stats → society drill-down → seller drill-down → individual order lifecycle → item-level details, across all categories.

