

# Sociva: Enterprise-Grade Reliability Roadmap

## Current State Summary

- **150+ tables**, 22+ triggers on `orders` alone, 27 order statuses
- 3 sellers, 3 users, 14 orders (7 delivered), 1 society, 0 disputes, 0 reviews
- **Critical finding**: All 14 orders have `society_id = NULL` — society isolation is broken at the data level
- `payment_records` lacks a unique constraint on `order_id`, causing duplicate records
- No refund workflow exists beyond terms page text
- Notification queue exists but no evidence of reliable processing (cron/worker)

---

## 8 Non-Negotiable Features

### 1. Payment & Order Integrity Hardening

**What**: Add `UNIQUE(order_id)` on `payment_records`, fix `society_id` population on orders, add idempotency guards on all financial mutations.

**Why critical**: The recurring "Failed to confirm payment" bugs stem from missing constraints. Every financial write must be idempotent and atomic. 14/14 orders have NULL society_id — this breaks all society-scoped RLS.

**Gap solved**: Payment failures, duplicate records, broken society isolation.

**Trust impact**: Buyers and sellers must never see "payment failed" for a valid transaction. Financial reliability = platform trust.

**Implementation**: One migration — add unique constraint, backfill society_id, consolidate the 22 order triggers into fewer, well-tested functions.

---

### 2. Trigger Consolidation & Circuit Breaker

**What**: Reduce the 22 triggers on `orders` to 5-6 grouped trigger functions. Add a `trigger_errors` dead-letter table with alerting. Add a circuit breaker that skips non-critical triggers if the transaction is taking >2s.

**Why critical**: Any single trigger failure (like the OTP gate or payment validator) blocks the entire order state machine. Cascading failures from 22 independent triggers are nearly impossible to debug.

**Gap solved**: Every recent bug (payment_collection, en_route enum, OTP gate) was a trigger conflict.

**Trust impact**: Orders never get stuck in limbo. Seller can always move orders forward.

---

### 3. Automated Refund & Dispute Resolution Engine

**What**: Build a refund state machine (`refund_requested → approved → processed → settled`) with auto-approval rules (e.g., seller-cancelled = auto-refund). Add a dispute escalation timer (48h seller response → auto-resolve in buyer's favor).

**Why critical**: The terms page promises refunds but no mechanism exists. Zero disputes filed = users have no recourse, so they leave instead.

**Gap solved**: No refund workflow, no dispute SLA, no accountability.

**Trust impact**: Buyer confidence. "If something goes wrong, the platform protects me."

**Habit formation**: Buyers order more when they know refunds work. This is the #1 trust driver on any marketplace.

---

### 4. Seller Reliability Score & Smart Ranking

**What**: Compute a real-time reliability score from: acceptance rate, preparation time, cancellation rate, rating, response time. Surface it as a badge (Gold/Silver/Bronze). Use it to rank sellers in marketplace discovery.

**Why critical**: `seller_reputation_ledger` table exists but isn't surfaced. Buyers have no way to differentiate reliable sellers from flaky ones.

**Gap solved**: No seller accountability, no quality signal for buyers.

**Trust impact**: Good sellers get rewarded with visibility. Bad sellers get deprioritized. Buyers learn to trust the ranking.

**Habit formation**: Sellers compete to maintain high scores → better service → buyers return.

---

### 5. Smart Reorder & Subscription Fulfillment

**What**: One-tap reorder from order history. Auto-populate cart with previous order items. Enable recurring subscriptions (daily milk, weekly groceries) with skip/pause/modify.

**Why critical**: `subscriptions` and `subscription_deliveries` tables exist but have 0 records. The infrastructure is built but not connected.

**Gap solved**: No repeat-purchase friction reduction. Every order requires full cart rebuild.

**Trust impact**: Predictable revenue for sellers. Convenience for buyers.

**Habit formation**: This is THE habit loop — daily/weekly automatic orders make the app indispensable. Once a buyer subscribes to daily milk delivery, they open the app every morning.

---

### 6. Real-Time Order Tracking with Live Map

**What**: Google Maps integration showing seller→buyer route with live driver location, ETA countdown, and auto-zoom. For both buyer and seller views. Use `delivery_tracking_logs` and `delivery_locations` tables (already exist).

**Why critical**: User uploaded reference images show exactly this expectation. `delivery_locations` and `delivery_tracking_logs` tables exist but the map UI doesn't.

**Gap solved**: Buyers have no visibility into where their order is after "on the way."

**Trust impact**: Real-time visibility eliminates "where is my order?" anxiety. Reduces support load.

**Habit formation**: The dopamine hit of watching your order approach in real-time (Swiggy/Zomato effect).

---

### 7. Cross-Society Seller Discovery & Isolation

**What**: Fix `cart_items` and `favorites` to enforce society scoping (flagged as known gaps). Enable verified sellers to opt into cross-society visibility via `service_radius_km`. Show distance badge and delivery fee calculation for cross-society orders.

**Why critical**: RLS doc explicitly lists cart_items, favorites, payment_records as having NO society isolation. Cross-society commerce is the growth lever but currently has no guardrails.

**Gap solved**: Security gap (cross-society data leakage), missing cross-society commerce UX.

**Trust impact**: Buyers see relevant sellers. Sellers reach more customers safely. No accidental data exposure.

---

### 8. Notification Reliability & Delivery Receipts

**What**: Add a cron-based notification processor (pg_cron or edge function on schedule) that processes `notification_queue`, implements exponential backoff (already partially built in `notifications.ts`), and tracks delivery receipts. Add an in-app notification inbox with read/unread state.

**Why critical**: `notification_queue` exists with retry infrastructure but no evidence of scheduled processing. Push notifications are fire-and-forget from the client side.

**Gap solved**: Missed order notifications = missed revenue. Sellers don't know they have new orders.

**Trust impact**: "I never miss an order" for sellers. "I always know my order status" for buyers.

**Habit formation**: Timely notifications are the #1 driver of app opens. Every notification is a re-engagement opportunity.

---

## Implementation Priority (by impact/effort ratio)

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Payment & Order Integrity Hardening | 1 day | Stops all current bugs |
| P0 | Trigger Consolidation | 2 days | Prevents future bugs |
| P1 | Refund & Dispute Engine | 3 days | Buyer trust |
| P1 | Notification Reliability | 2 days | Engagement |
| P1 | Real-Time Order Tracking Map | 3 days | User delight |
| P2 | Seller Reliability Score | 2 days | Marketplace quality |
| P2 | Smart Reorder & Subscriptions | 2 days | Habit formation |
| P2 | Cross-Society Isolation & Discovery | 3 days | Growth + security |

---

## Technical Approach

All features leverage existing tables and infrastructure. No new architectural patterns needed — just connecting and hardening what's already built. The migration strategy is additive (no breaking changes). Each feature ships independently behind existing feature flag infrastructure (`society_feature_overrides`).

Shall I proceed with implementing these in priority order, starting with P0 (Payment Integrity + Trigger Consolidation)?

