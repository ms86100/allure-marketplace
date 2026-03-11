

# Fix: Status-wise Revenue Breakdown Across All Analytics

## The Core Problem

Currently, the analytics queries are inconsistent and hide critical information:
- Platform Overview excludes cancelled orders entirely, showing only "non-cancelled" totals
- Category Analytics queries `order_items` independently without joining to `orders`, so it has no knowledge of order status at all
- There is no breakdown showing revenue/orders per status (placed, accepted, delivered, cancelled, etc.)

The admin needs to see: "Out of all orders, how much worth was delivered? How much was cancelled? How much is still pending?" — broken down by status across every view.

## What Changes

### 1. Platform Overview — Add Status Breakdown Cards

Replace the current 4 summary cards with a richer view:
- Keep Total Orders and Total Revenue (but now include ALL orders, including cancelled)
- Add a **Status Breakdown** section below the cards: a compact table showing each order status (placed, accepted, preparing, ready, delivered, completed, cancelled) with its count and total revenue
- This is the single source of truth — admin sees exactly where every rupee sits

**Data source**: Single query to `orders` table, grouped by status. No joins needed. Uses `total_amount` from orders (the actual order value).

### 2. Category Analytics — Join to Orders, Add Status Column

Current bug: queries `order_items` alone, counts each item row as an "order", ignores cancellations.

Fix:
- Join `order_items` → `orders` to get `order.status`
- Count distinct `order_id` (not item rows) as "Orders"
- Add per-status revenue columns to the category table: Delivered ₹, Cancelled ₹, Pending ₹
- Revenue = `unit_price × quantity` from order_items (line-item level), grouped by category AND order status

### 3. Seller Performance — Add Status Breakdown Per Seller

Currently only shows total order count and revenue (excluding cancelled).

Fix:
- Fetch orders INCLUDING cancelled
- Per seller row: show columns for Delivered (count + ₹), Cancelled (count + ₹), Active (count + ₹)
- "Active" = placed + accepted + preparing + ready

### 4. Society Breakdown — Add Status Split

Same pattern: show per-society revenue split by Delivered / Cancelled / Active.

### 5. Buyer Activity — Show Status Split

Per buyer: Total orders, Delivered count, Cancelled count, Total spent (delivered only).

---

## Technical Approach

### File: `src/hooks/queries/useAdminAnalytics.ts`

**`useAdminAnalytics` (overview)**:
- Query ALL orders (remove `.neq('status', 'cancelled')`)
- Group by status client-side to produce: `statusBreakdown: Record<string, { count: number; revenue: number }>`
- Compute totals from the grouped data

**`useCategoryAnalytics`**:
- Change query from `order_items` standalone to: fetch `order_items` with `order_id`, then fetch corresponding `orders` for status
- Actually: fetch orders (with status) first, then fetch order_items for those order IDs, then cross-reference
- Group category stats by status: `{ category, status, orders (distinct order_id), revenue }`

**`useSellerPerformance`**:
- Remove `.neq('status', 'cancelled')` — include all statuses
- Group per seller by status buckets: delivered, cancelled, active

**`useSocietyBreakdown`**:
- Same: remove cancelled exclusion, group by status buckets

**`useBuyerActivity`**:
- Same: include cancelled, add delivered/cancelled counts per buyer

### UI Files

**`PlatformOverview.tsx`**: Add a status breakdown table below the metric cards — rows for each status with count + revenue.

**`CategoryAnalytics.tsx`**: Add columns for Delivered ₹, Cancelled ₹, Pending ₹ alongside the existing Revenue column.

**`SellerPerformanceTable.tsx`**: Add Delivered/Cancelled/Active columns.

**`SocietyBreakdown.tsx`**: Add Delivered/Cancelled revenue columns.

**`BuyerActivityTable.tsx`**: Add Delivered/Cancelled count columns.

This ensures every number the admin sees is traceable and broken down by order lifecycle status — no hidden data, no mismatched totals.

