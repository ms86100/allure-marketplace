

# Enterprise-Grade Platform: 10 Feature Implementation Plan

## Assessment Summary

After deep inspection, several of these features have **partial infrastructure already built** but lack the critical connecting logic. This plan focuses on activating what exists and filling gaps efficiently.

```text
EXISTING INFRASTRUCTURE → WHAT'S MISSING
─────────────────────────────────────────
audit_log table + trigger     → No buyer-facing timeline UI
reviews table + ReviewForm    → No auto-prompt after delivery
order_suggestions + edge fn   → Not connected to failure/cancel flows
notification_queue + push     → Only transactional, no re-engagement
seller_reputation_ledger      → Only 2 entries, no auto-population
store-availability.ts         → Client-only, no server-side blocking
sell_beyond_community flag    → Works, but poor discovery UX
dispute_tickets table         → No buyer-facing refund visibility
chat_messages + conversations → Not order-scoped
idempotency in RPC            → Already implemented for orders ✓
```

---

## Phase 1: Quick Wins (High Impact, Low Effort)

### Feature 2: Automated Review Engine
**What exists**: `reviews` table, `ReviewForm` component, review card in OrderDetailPage (line 716)
**What's missing**: Auto-prompt — currently requires buyer to manually find the review button on order detail

**Implementation**:
- Create a **post-delivery review prompt notification** — add a case in `fn_enqueue_order_status_notification` trigger: when status → `delivered` or `completed`, enqueue a push notification to buyer with deep link to order detail
- Add an **in-app review banner** on the Orders list page for orders that are `completed`/`delivered` and have no review (query `reviews` table)
- After review submission, insert a `seller_reputation_ledger` entry (`event_type: 'review_received'`, `is_positive: rating >= 4`)
- Update `seller_profiles.rating` and `total_reviews` via a DB trigger on `reviews` INSERT

**Files**: 1 migration (trigger + ledger logic), `src/pages/OrdersPage.tsx` (review banner), `src/components/review/ReviewForm.tsx` (add ledger insert on success)

---

### Feature 8: Store Hours Enforcement (Server-Side)
**What exists**: `computeStoreStatus()` in `src/lib/store-availability.ts`, `operating_days`/`availability_start`/`availability_end` columns on `seller_profiles`
**What's missing**: Server-side enforcement — orders can be placed to closed stores

**Implementation**:
- Add a validation check inside `create_multi_vendor_orders` RPC: for each seller group, check `is_available`, `operating_days`, and `availability_start/end` against `now() AT TIME ZONE 'Asia/Kolkata'`
- If seller is closed, return error with message: "Store is currently closed. Opens at X"
- Add a pre-checkout validation in `useCartPage.ts` that calls `computeStoreStatus()` before submitting

**Files**: 1 migration (update RPC), `src/hooks/useCartPage.ts` (pre-checkout check)

---

### Feature 5: Order Failure Recovery
**What exists**: `auto-cancel-orders` edge function, `order_suggestions` table, `generate-order-suggestions` edge function
**What's missing**: Connection between cancellation and recovery flow

**Implementation**:
- After `auto-cancel-orders` cancels an order, call `generate-order-suggestions` for the buyer with the cancelled order's products
- Add a **"Similar items available"** card on the OrderDetailPage when order is cancelled and suggestions exist
- Add a push notification on cancellation: "Your order was cancelled — here are alternatives"
- Use existing `useOrderSuggestions` hook + `useReorderInterceptor` for the recovery UI

**Files**: `supabase/functions/auto-cancel-orders/index.ts` (call suggestions generator), `src/pages/OrderDetailPage.tsx` (suggestions card for cancelled orders)

---

## Phase 2: Retention Engine

### Feature 3: Smart Notification Digest
**What exists**: `notification_queue`, `process-notification-queue`, `daily-society-digest`, `generate-weekly-digest` edge functions, full push infrastructure
**What's missing**: Buyer re-engagement notifications (only transactional today)

**Implementation**:
- Create `generate-buyer-digest` edge function: queries recent activity (new products from favorited sellers, trending items in society, "you haven't ordered in X days")
- Schedule via cron (daily at 10 AM IST)
- Enqueue as push notifications with deep links
- Add a "What's New" section on the home page showing digest items

**Files**: 1 new edge function (`generate-buyer-digest`), cron schedule migration, `src/components/home/WhatsNewSection.tsx`

---

### Feature 4: Seller Analytics Dashboard
**What exists**: `product_views`, `marketplace_events`, `banner_analytics` tables with behavioral data, `SellerDashboardPage.tsx`
**What's missing**: No analytics visualization for sellers

**Implementation**:
- Create `SellerAnalyticsTab` component with:
  - Revenue chart (last 30 days from `orders`)
  - Top products by views (from `product_views`)
  - Repeat customer % (from `orders` grouped by `buyer_id`)
  - Average order value trend
  - Peak hours heatmap (from `orders.created_at`)
- Add as a tab on the seller dashboard
- Use recharts (already in dependencies)

**Files**: `src/components/seller/SellerAnalyticsTab.tsx`, `src/hooks/useSellerAnalytics.ts`, update `SellerDashboardPage.tsx`

---

## Phase 3: Growth & Trust

### Feature 1: In-Order Chat
**What exists**: `chat_messages` table, `OrderChat` component already rendered in OrderDetailPage, `seller_conversations` table
**What's missing**: The chat is already order-scoped and functional. Need to verify it works for both buyer and seller views.

**Implementation**:
- Audit existing `OrderChat` component — it already uses `order_id` as conversation scope
- Add unread badge to order list items (buyer and seller)
- Add push notification for new chat messages during active orders
- Ensure chat is disabled after order completion (already partially done)

**Files**: `src/components/chat/OrderChat.tsx` (verify), `src/pages/OrdersPage.tsx` (unread badge), notification trigger migration

---

### Feature 6: Cross-Society Discovery UX
**What exists**: `sell_beyond_community` flag, `delivery_radius_km`, haversine distance calculation, cross-society filtering in marketplace hooks
**What's missing**: Poor discovery UX — toggle buried in filters

**Implementation**:
- Add a "Nearby Sellers" section on marketplace home when buyer's society has < 5 active sellers
- Show cross-society sellers with: distance badge, society name, delivery time estimate
- Add "Browse Beyond" tab on marketplace page (alongside existing categories)
- Sort by distance, show delivery fee estimate

**Files**: `src/components/marketplace/NearbySellersSection.tsx`, update marketplace page layout

---

### Feature 7: Refund & Payment Visibility
**What exists**: `payment_records` table, `dispute_tickets`, `payment_settlements`
**What's missing**: Buyer has zero visibility into refund status

**Implementation**:
- Add "Payment Status" card on OrderDetailPage showing: payment method, amount, status, refund timeline
- For cancelled/disputed orders, show refund progress: "Refund initiated → Processing → Credited"
- Add "My Payments" section in profile page with payment history from `payment_records`
- Link dispute status from `dispute_tickets` to order detail

**Files**: `src/components/order/PaymentStatusCard.tsx`, `src/pages/ProfilePage.tsx` (payments section), update `OrderDetailPage.tsx`

---

### Feature 9: Order Event Timeline (Buyer-Facing)
**What exists**: `audit_log` table with `order_status_changed` events (34 entries), DB trigger auto-logs every status change
**What's missing**: No buyer-facing timeline UI

**Implementation**:
- Add `OrderTimeline` component: query `audit_log` where `target_type = 'order'` and `target_id = order.id`
- Display as a vertical timeline with: timestamp, human-readable action, actor (system/seller/buyer)
- Show on OrderDetailPage below the status card (collapsible, "View order history")
- Map internal actions to friendly labels: `order_status_changed` + `new_status: accepted` → "Seller accepted your order"

**Files**: `src/components/order/OrderTimeline.tsx`, `src/hooks/useOrderTimeline.ts`, update `OrderDetailPage.tsx`

---

### Feature 10: Idempotency Layer
**What exists**: Already fully implemented in `create_multi_vendor_orders` RPC — advisory locks, `ON CONFLICT` on `idempotency_key`, canonical response for duplicate calls
**What's missing**: Nothing significant — this is already production-grade

**Implementation**:
- Verify `confirm_upi_payment` RPC has idempotency (check if double-confirmation is safe)
- Add idempotency key to COD confirmation flow if missing
- Document the existing idempotency pattern

**Files**: 1 migration (if COD confirm needs guard), documentation update

---

## Implementation Order

| Phase | Feature | Effort | New Files | Migrations |
|-------|---------|--------|-----------|------------|
| 1 | #2 Review Engine | 3-4 hrs | 0 new, 3 modified | 1 |
| 1 | #8 Store Hours | 2 hrs | 0 new, 2 modified | 1 |
| 1 | #5 Failure Recovery | 3 hrs | 1 new component | 0 (edge fn update) |
| 2 | #3 Smart Notifications | 4 hrs | 2 new | 1 |
| 2 | #4 Seller Analytics | 4-5 hrs | 2 new | 0 |
| 3 | #1 In-Order Chat | 2 hrs | 0 (audit existing) | 1 |
| 3 | #6 Cross-Society UX | 3 hrs | 1 new | 0 |
| 3 | #7 Refund Visibility | 3-4 hrs | 2 new | 0 |
| 3 | #9 Order Timeline | 2-3 hrs | 2 new | 0 |
| 3 | #10 Idempotency | 1 hr | 0 | 0-1 |

**Total estimated effort**: ~28-32 hours across all 10 features

## Technical Notes

- **No new tables needed** — all 10 features use existing tables
- **No architectural changes** — all features are additive
- **Feature #10 is already done** — just needs verification
- **Feature #1 is mostly done** — OrderChat already exists and is order-scoped
- Charts use `recharts` (already installed)
- All edge functions auto-deploy on save

