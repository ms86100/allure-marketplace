

# Sociva Platform — Product Owner Audit & Improvement Plan

## System Overview
Sociva is a hyperlocal community marketplace connecting buyers and sellers within residential societies. It supports multi-category commerce (food, services, products), delivery tracking, UPI/Razorpay/COD payments, society administration, builder management, worker management, and more. The system is mature with ~80 pages, DB-driven workflows, real-time order tracking, and a mobile-first design.

---

## Gap Analysis: Where Trust Breaks

### Buyer Perspective
1. **No order ETA visibility after placement** — The `ActiveOrderStrip` shows a status label and countdown timer for auto-cancel, but once the seller accepts, buyers have no estimated completion/delivery time on the home page strip. They must tap into the order detail to see the ETA banner.
2. **Payment failure leaves buyer anxious** — After a failed UPI/Razorpay payment, the toast says "Your order has been cancelled. You can try again" but the cart page may show a confusing "Pending Payment" state with no clear timeline of what happened.
3. **Seller response time not visible pre-purchase** — `avg_response_minutes` exists on `seller_profiles` but is not shown on the `ProductCard` or `ProductListingCard` that buyers see while browsing the marketplace. Buyers discover slow sellers only after ordering.
4. **No read receipts on chat messages** — `chat_messages` has `read_status` but buyers can't see if the seller has read their message, creating uncertainty.
5. **Refund timeline opacity** — `RefundRequestCard` shows status badges but no estimated resolution time. Buyers see "Requested" or "Processing" with no indication of when to expect resolution.
6. **Review prompt timing** — `ReviewPromptBanner` appears on the Orders page but not contextually after delivery confirmation, missing the highest-intent moment.
7. **No seller "last active" indicator** — Buyers can't tell if a store marked "available" is actively monitored or if the seller forgot to close it.

### Seller Perspective
8. **No earnings notification** — When a payment is confirmed/settled, the seller has no push notification or in-app alert for the payment event itself (only order status notifications exist).
9. **Refund impact unclear** — `SellerRefundList` shows refund requests but doesn't show how refunds affect their earnings summary, creating accounting anxiety.
10. **Store health score not actionable enough** — `SellerVisibilityChecklist` groups checks into categories but doesn't show the single most impactful action to take next.
11. **No order acceptance SLA warning** — Sellers see new order alerts but don't see a clear "respond within X minutes or auto-cancel" warning prominently on the dashboard.
12. **Coupon performance invisible** — `CouponManager` lets sellers create coupons but shows no redemption count or revenue impact data.

### System-Level Trust Gaps
13. **Stale store availability** — A seller can be "available" for days without any orders or activity. No automatic staleness detection.
14. **No delivery proof for self-pickup** — Self-pickup orders have no handover confirmation mechanism from the seller side, only status transitions.
15. **Price change after cart add** — Products in cart use the price at cart-add time, but if the seller changes the price before checkout, the buyer sees the old price. No validation occurs at order placement.

---

## 12 High-Impact Improvements

### 1. Show Seller Response Time on Product Cards
**Objective**: Let buyers assess seller reliability before adding to cart.
**Tasks**:
- Add `avg_response_minutes` to the seller data joined in `useProductsByCategory` and `search_sellers_paginated`
- Display a small badge (e.g., "⚡ ~5 min response") on `ProductListingCard` and `ProductCard` when value is ≤15 min
- Show "Typically responds in ~X min" on `SellerDetailPage` header
**Affected**: `ProductListingCard.tsx`, `ProductCard.tsx`, `SellerDetailPage.tsx`, `useProductsByCategory` hook
**Risk**: Minimal — read-only display, no schema change

### 2. Add Estimated Resolution Time to Refund Status
**Objective**: Reduce buyer anxiety during refund processing.
**Tasks**:
- Add `estimated_resolution_hours` column to `refund_requests` table (default: 48)
- Populate via a trigger or admin setting based on refund category
- Show "Expected by [date]" in `RefundRequestCard` when status is `requested` or `processing`
**Affected**: `RefundRequestCard.tsx`, migration for new column, system_settings seed
**Risk**: Low — additive column, no existing data change

### 3. Seller "Last Active" Indicator
**Objective**: Prevent buyers from ordering from inactive/ghost stores.
**Tasks**:
- Add `last_active_at` timestamp to `seller_profiles` (updated on dashboard visit, order action, availability toggle)
- Create a DB trigger on `orders` status changes to update `last_active_at`
- Show "Active today" / "Active 3 days ago" badge on seller cards and store page
- If `last_active_at` > 7 days and `is_available = true`, show a warning badge: "Store may be unresponsive"
**Affected**: `seller_profiles` migration, `SellerDetailPage.tsx`, `ProductListingCard.tsx`, `SellerDashboardPage.tsx`
**Risk**: Low — new column with trigger, purely additive

### 4. Cart Price Validation at Checkout
**Objective**: Prevent price mismatch between cart and actual product price.
**Tasks**:
- In `useCartPage.handlePlaceOrder`, fetch current prices for all cart items before creating orders
- If any price differs, show a dialog: "Price for [item] changed from ₹X to ₹Y. Continue?"
- Update cart item prices to current values if buyer confirms
**Affected**: `useCartPage.ts`, `CartPage.tsx` (new dialog)
**Risk**: Medium — adds a network call before order placement; must handle race conditions

### 5. Chat Read Receipts for Buyers
**Objective**: Let buyers know the seller has seen their message.
**Tasks**:
- `chat_messages.read_status` already exists — add a read timestamp column `read_at`
- When seller opens chat, mark messages as read and update `read_at`
- Show double-check icon (✓✓) on buyer's sent messages when `read_at` is set
- Real-time subscription already exists for chat — extend to include `read_at` updates
**Affected**: `OrderChat.tsx`, migration for `read_at` column
**Risk**: Low — additive column, UI-only change on buyer side

### 6. Post-Delivery Review Prompt (Contextual)
**Objective**: Capture reviews at the highest-intent moment.
**Tasks**:
- In `OrderDetailPage`, when order reaches a successful terminal status AND no review exists, show an inline review prompt card (not just on the Orders list page)
- Add a gentle delay (show after 2 seconds of viewing the completed order)
- Include the seller name, order items summary, and star rating inline
**Affected**: `OrderDetailPage.tsx`, `ReviewForm.tsx`
**Risk**: Minimal — UI-only, no schema change

### 7. Seller Earnings Push Notification
**Objective**: Positive reinforcement and trust that money is being tracked.
**Tasks**:
- In the `enqueue_order_status_notification` DB function, add a notification when payment_status changes to `confirmed` or `settled`
- Title: "Payment received: ₹{amount}" / Body: "For order from {buyer_name}"
- Add a `notify_on_payment` boolean to `system_settings` (default true)
**Affected**: DB function `enqueue_order_status_notification`, `system_settings` seed
**Risk**: Low — extends existing notification pipeline

### 8. Coupon Performance Dashboard
**Objective**: Help sellers understand coupon ROI to encourage continued promotions.
**Tasks**:
- Query `orders` table joined with `coupons` to compute: redemption count, total discount given, orders generated
- Add a "Performance" expandable section in `CouponManager` showing these stats per coupon
- Show a simple bar or summary: "Used 12 times · ₹840 in discounts · ₹7,200 in orders"
**Affected**: `CouponManager.tsx`, new query hook
**Risk**: Minimal — read-only aggregation

### 9. Auto-Cancel SLA Warning on Seller Dashboard
**Objective**: Make the auto-cancel countdown impossible to miss for sellers.
**Tasks**:
- In `SellerOrderCard`, when order has `auto_cancel_at` and status is pending, show a prominent countdown timer (reuse `CompactCountdown` from `ActiveOrderStrip`)
- Add a pulsing red border when < 60 seconds remain
- Add a toast notification on dashboard load if any pending order has < 2 min left
**Affected**: `SellerOrderCard.tsx`
**Risk**: Minimal — UI-only, component reuse

### 10. Payment Failure Recovery Clarity
**Objective**: Eliminate buyer confusion after payment failures.
**Tasks**:
- Replace the generic toast with a bottom sheet explaining exactly what happened: "Payment of ₹{amount} to {seller} was not completed"
- Show clear options: "Try Again" (re-opens payment), "Cancel & Return to Cart" (cancels pending orders)
- Add a persistent banner on CartPage when `hasActivePaymentSession` is true
**Affected**: `useCartPage.ts` (handlers), `CartPage.tsx` (new bottom sheet component)
**Risk**: Low — replaces existing toast logic with richer UI

### 11. Self-Pickup Handover Confirmation
**Objective**: Create a trust-verified handover for self-pickup orders.
**Tasks**:
- When order is `ready` and fulfillment is `self_pickup`, show a 4-digit OTP on the buyer's order detail page
- Seller enters this OTP on their side to confirm handover (reuse `GenericOtpDialog`)
- Status transitions to the next step (e.g., `picked_up` or terminal)
- The OTP mechanism already exists (`stepRequiresOtp`, `getStepOtpType`) — configure it for pickup flows in `category_status_flows`
**Affected**: `category_status_flows` data (migration), `OrderDetailPage.tsx` (buyer OTP display)
**Risk**: Low — leverages existing OTP infrastructure

### 12. Stale Store Auto-Close
**Objective**: Prevent buyer orders to unresponsive stores.
**Tasks**:
- Create a scheduled DB function (pg_cron or edge function) that runs daily
- If `seller_profiles.last_active_at` < NOW() - interval '7 days' AND `is_available = true`, set `is_available = false`
- Send a push notification to the seller: "Your store was automatically closed due to inactivity. Re-open it anytime."
- Seller can re-open with one tap from the notification
**Affected**: New edge function or pg_cron job, `seller_profiles` table, notification system
**Risk**: Medium — requires the `last_active_at` column from improvement #3; must avoid false positives for sellers with legitimately slow businesses

---

## Execution Priority (Impact vs Effort)

| # | Improvement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | Seller response time on cards | High | Low | P0 |
| 9 | Auto-cancel SLA warning | High | Low | P0 |
| 4 | Cart price validation | High | Medium | P0 |
| 6 | Post-delivery review prompt | Medium | Low | P1 |
| 10 | Payment failure clarity | High | Medium | P1 |
| 3 | Seller last-active indicator | High | Medium | P1 |
| 5 | Chat read receipts | Medium | Low | P1 |
| 11 | Self-pickup handover OTP | Medium | Low | P2 |
| 2 | Refund resolution ETA | Medium | Low | P2 |
| 7 | Seller earnings notification | Medium | Low | P2 |
| 8 | Coupon performance stats | Medium | Low | P2 |
| 12 | Stale store auto-close | High | Medium | P3 |

---

## Stability Assurance
- All improvements are **additive** — no existing table columns are modified or removed
- New DB columns use defaults, so zero migration risk on existing rows
- UI changes are isolated to specific components with no cross-component state dependencies
- Existing test suite (`edge-cases-gaps.test.ts`, `orders-payments.test.ts`) covers the core flows being enhanced
- Each improvement can be shipped independently — no inter-dependencies except #12 depends on #3

