

# Implementation Plan: 5 Epics, 15 Tasks — Trust & Differentiation Layer

This plan covers all 15 tasks across 5 epics. Given the scope, I will implement them in a phased approach — starting with the highest-impact P0 items that require the least new infrastructure, then layering on P1/P2 features.

---

## Phase 1 — P0: Immediate Trust Signals (Tasks 1, 2, 3, 10, 15, 8)

### Task 1: Distance-as-Trust on Listings

**Current state**: `ProductListingCard` already shows distance for cross-society products (`distance_km`), but only when `!is_same_society`. Same-society products show nothing.

**Changes**:
- **DB**: No schema change. Distance is computed client-side or via `search_nearby_sellers` RPC.
- **`src/components/product/ProductListingCard.tsx`**: Remove the `!is_same_society` guard. Show distance for ALL products. For same-society, show "In your society" or the actual meters. Format: `<350m` → "350m away", `≥1km` → "1.2 km away".
- **`src/components/listing/ListingCard.tsx`**: Add distance display if available in the listing data.
- **`src/hooks/queries/useProductsByCategory.ts`**: Fetch buyer society lat/lng and compute Haversine distance per product in the query result mapping (seller society coords already joined).

### Task 2: Social Proof — Society-Scoped Order Counts

**Current state**: No society-scoped social proof exists. Only generic `completed_order_count` on seller profiles.

**Changes**:
- **DB Migration**: Create an RPC function `get_society_order_stats(product_ids uuid[], society_id uuid)` that returns per-product: `orders_this_week` (count of orders from buyers in the same society in last 7 days) and `families_ordered` (distinct `buyer_id` count). No personal data exposed.
- **`src/components/product/ProductListingCard.tsx`**: Accept optional `socialProof?: { familiesThisWeek: number }` prop. Display "X families ordered this week" badge when > 0.
- **`src/components/home/MarketplaceSection.tsx`**: Call the RPC once with all visible product IDs, pass results down to cards.

### Task 3: Seller "Last Active" Visibility

**Current state**: `last_active_at` exists on `seller_profiles`. Shown on `SellerDetailPage` as "Active today" badge. NOT shown on product cards or product detail sheet.

**Changes**:
- **`src/hooks/queries/useProductsByCategory.ts`**: Add `last_active_at` to the seller join select.
- **`src/components/product/ProductListingCard.tsx`**: Show relative time ("2h ago", "Active today") below seller name when available.
- **`src/components/product/ProductDetailSheet.tsx`**: Add "Last active: Xh ago" in the seller card section.
- **No DB change** — `trg_seller_activity_timestamp` trigger already updates `last_active_at` on product changes, and `trg_update_seller_stats_on_order` updates it on order status changes.

### Task 8: Delivery Reliability Score

**Current state**: `completed_order_count`, `cancellation_rate`, `avg_response_minutes` exist on `seller_profiles` and are recomputed by `recompute_seller_stats` trigger.

**Changes**:
- **DB Migration**: Add `on_time_delivery_pct numeric DEFAULT null` column to `seller_profiles`. Update `recompute_seller_stats` function to compute on-time % from `delivery_assignments` (where `status = 'delivered'` and delivery was within SLA window).
- **`src/components/product/ProductListingCard.tsx`**: Show "On-time: 94%" badge when value exists and `completed_order_count > 5`.
- **`src/pages/SellerDetailPage.tsx`**: Add on-time delivery badge in Row 4 trust signals.

### Task 10: Refund Predictability Promise

**Current state**: No refund promise messaging exists.

**Changes**:
- **DB**: Add system_setting key `refund_promise_text` (default: "If anything goes wrong, refund within 24 hours") and `refund_sla_hours` (default: 24).
- **`src/pages/CartPage.tsx`**: Display a trust banner above the Place Order button: shield icon + the `refund_promise_text` from system settings.
- **`src/hooks/useSystemSettings.ts`**: Fetch and expose the refund promise text.
- **Admin tracking**: The existing `dispute_tickets` + `seller_settlements` tables handle SLA tracking. A future cron can flag breaches.

### Task 15: Emotional Reinforcement at Checkout

**Changes**:
- **`src/pages/CartPage.tsx`**: Add a line above the confirm dialog: "This order supports {N} local business{es} in your community" where N = `sellerGroups.length`.
- **Pure UI** — no DB change needed. Seller count is already computed from cart grouping.

---

## Phase 2 — P1: Seller Power & Intelligence (Tasks 4, 5, 6, 11, 14)

### Task 4: One-Tap "Reorder Last Order" on Home

**Current state**: `ReorderButton` exists but only on completed order cards in OrdersPage.

**Changes**:
- **`src/pages/HomePage.tsx`**: Add a "Reorder Last Order" card below banners. Query last completed order for the user (`orders` table, `status IN ('completed','delivered')`, limit 1, with seller name + item count).
- **New component `src/components/home/ReorderLastOrder.tsx`**: Shows seller name, item count, total, and a one-tap CTA. Uses existing `ReorderButton` logic internally but checks for price/availability changes and shows a toast if items changed.
- **No DB change** — uses existing orders + products tables.

### Task 5: Enhanced Seller Analytics

**Current state**: `SellerAnalytics` shows repeat buyers, total buyers, cancellations, top products, peak hours. No conversion rate, no active buyer count.

**Changes**:
- **DB Migration**: Create RPC `get_seller_demand_stats(seller_id uuid, radius_km numeric)` returning: `active_buyers_in_radius` (distinct users who placed orders in last 30 days within radius), `views_count` (from `card_analytics` if exists), `conversion_rate` (orders / views).
- **`src/components/seller/SellerAnalytics.tsx`**: Add cards for "Active buyers nearby", "View → Order conversion", and commission breakdown.
- **`src/hooks/queries/useSellerAnalytics.ts`**: Call the new RPC alongside existing queries.
- **Commission display**: Read `platform_fee_percentage` from `system_settings` and display it clearly with "This rate is locked for 30 days" messaging.

### Task 6: Demand Intelligence for Sellers

**Changes**:
- **DB Migration**: Create table `search_demand_log` (id, society_id, search_term, category, searched_at, user_id anonymized as society_id only). Create RPC `get_unmet_demand(society_id uuid, seller_categories text[])` that aggregates search terms with no matching products.
- **New component `src/components/seller/DemandInsights.tsx`**: Shows "15 people searched for 'birthday cake' this week — no seller offers this". Displayed on seller dashboard.
- **`src/pages/SearchPage.tsx`**: Log search terms to `search_demand_log` (debounced, only when user submits/selects — not on every keystroke).

### Task 11: Transparent Price History

**Changes**:
- **DB Migration**: Create table `price_history` (id, product_id FK, old_price, new_price, changed_at, changed_by). Add trigger on `products` UPDATE that logs price changes.
- **DB Migration**: Add `price_stable_since timestamptz` to `products`, updated by trigger.
- **`src/components/product/ProductDetailSheet.tsx`**: Show "Stable Pricing" badge if price unchanged for 30+ days. Show mini sparkline of last 30 days if history exists (opt-in via system_setting `enable_price_history_display`).
- **New component `src/components/product/PriceHistoryChart.tsx`**: Simple sparkline using recharts.

### Task 14: Flatten Category Navigation

**Changes**:
- **`src/components/home/MarketplaceSection.tsx`**: Add two new horizontal sections above category listings: "New this week" (products created in last 7 days) and "Popular near you" (top products by order count in society).
- **`src/hooks/queries/useProductsByCategory.ts`**: Add separate queries for new-this-week and popular-near-you product lists.
- **Pure UI + query change** — no schema modification.

---

## Phase 3 — P2: Strategic Moat (Tasks 7, 9, 12, 13)

### Task 7: Stockout → Demand Loop (Notify When Back in Stock)

**Changes**:
- **DB Migration**: Create table `stock_watchlist` (id, user_id, product_id, created_at, notified_at). RLS: users can only see/create their own entries.
- **DB Migration**: Create trigger on `products` that fires when `is_available` changes from `false` to `true` — inserts into `notification_queue` for all watchers.
- **`src/components/product/ProductListingCard.tsx`**: When out of stock, show "Notify Me" button instead of "Sold Out".
- **`src/components/product/ProductDetailSheet.tsx`**: Same "Notify Me" CTA when unavailable.

### Task 9: Seller Reputation Ledger

**Changes**:
- **DB Migration**: Create table `seller_reputation_ledger` (id, seller_id, event_type enum, event_detail jsonb, occurred_at, is_positive boolean). Event types: `order_completed`, `order_cancelled`, `dispute_resolved`, `dispute_lost`, `response_fast`, `response_slow`.
- **Triggers**: Update existing `recompute_seller_stats` to also insert ledger entries. Update dispute resolution flow to insert ledger entries.
- **Buyer-facing**: `src/pages/SellerDetailPage.tsx` — Add "Reputation" tab showing summarized metrics (fulfillment rate, avg response, dispute outcomes).
- **Admin-facing**: `src/pages/AdminPage.tsx` — Add detailed ledger view per seller.

### Task 12: Neighborhood Guarantee Framework

**Current state**: `dispute_tickets` table and threaded dispute resolution already exists with SLA timers and committee acknowledgment.

**Changes**:
- **UI language update** in `src/components/disputes/CreateDisputeSheet.tsx` and `DisputeDetailSheet.tsx`: Reframe as "Neighborhood Guarantee" — "Your society committee will review this as a neutral party".
- **`src/pages/CartPage.tsx`**: Add small "Protected by Neighborhood Guarantee" badge near checkout.
- **Mostly copy/UX change** — no schema change. The dispute infrastructure is already built.

### Task 13: Collective Buying Engine

**Changes**:
- **DB Migration**: Create tables `collective_buy_requests` (id, product_id, society_id, target_quantity, current_quantity, expires_at, status, created_by) and `collective_buy_participants` (id, request_id, user_id, quantity, joined_at).
- **New page `src/pages/CollectiveBuyPage.tsx`**: Shows active group buys in society, allows joining.
- **`src/components/home/MarketplaceSection.tsx`**: Add "Group Buys" section when active collective buys exist.
- **Seller notification**: When target quantity reached, notify seller via `notification_queue`.

---

## Summary: Files to Create / Modify

### New Files
| File | Purpose |
|---|---|
| `src/components/home/ReorderLastOrder.tsx` | Task 4: Reorder CTA on home |
| `src/components/seller/DemandInsights.tsx` | Task 6: Unmet demand for sellers |
| `src/components/product/PriceHistoryChart.tsx` | Task 11: Price sparkline |
| `src/pages/CollectiveBuyPage.tsx` | Task 13: Group buying |

### Modified Files
| File | Tasks |
|---|---|
| `src/components/product/ProductListingCard.tsx` | 1, 2, 3, 7, 8 |
| `src/components/product/ProductDetailSheet.tsx` | 3, 7, 11 |
| `src/components/listing/ListingCard.tsx` | 1 |
| `src/hooks/queries/useProductsByCategory.ts` | 1, 2, 3, 14 |
| `src/pages/HomePage.tsx` | 4 |
| `src/pages/CartPage.tsx` | 10, 12, 15 |
| `src/components/seller/SellerAnalytics.tsx` | 5 |
| `src/hooks/queries/useSellerAnalytics.ts` | 5 |
| `src/pages/SellerDetailPage.tsx` | 3, 8, 9 |
| `src/pages/SearchPage.tsx` | 6 |
| `src/components/home/MarketplaceSection.tsx` | 2, 13, 14 |
| `src/components/disputes/CreateDisputeSheet.tsx` | 12 |
| `src/components/disputes/DisputeDetailSheet.tsx` | 12 |
| `src/pages/SellerDashboardPage.tsx` | 6 |

### DB Migrations (7 total)
1. RPC `get_society_order_stats` (Task 2)
2. `on_time_delivery_pct` column + updated `recompute_seller_stats` (Task 8)
3. System settings for refund promise (Task 10)
4. RPC `get_seller_demand_stats` (Task 5)
5. `search_demand_log` table + RPC `get_unmet_demand` (Task 6)
6. `price_history` table + trigger (Task 11)
7. `stock_watchlist` table + trigger (Task 7)
8. `seller_reputation_ledger` table (Task 9)
9. `collective_buy_requests` + `collective_buy_participants` tables (Task 13)

### Implementation Order (Recommended)
1. **First batch** (P0, minimal DB): Tasks 15, 3, 1 — pure UI/query changes
2. **Second batch** (P0, light DB): Tasks 10, 8 — system settings + column add
3. **Third batch** (P0, new RPC): Task 2 — social proof
4. **Fourth batch** (P1): Tasks 4, 14 — reorder + flattened nav
5. **Fifth batch** (P1, new tables): Tasks 5, 6, 11 — seller analytics + price history
6. **Sixth batch** (P2): Tasks 7, 9, 12, 13 — moat features

All features will use `useCurrency()` for formatting, `system_settings` for configurable copy, and RLS policies on every new table.

