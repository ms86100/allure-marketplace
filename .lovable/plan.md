

# Seller-Side Gap Analysis — 8 Non-Negotiable Features

## Executive Summary

After auditing every seller-facing page, hook, DB column, and workflow, the seller experience is already strong: dashboard with order tabs, earnings page, settings with vacation mode, demand insights, service bookings, coupons, analytics, reliability scoring, and reorder flows. However, there are 8 critical gaps that prevent sellers from depending on this app daily.

---

## The 8 Features

### 1. Low Stock Alerts & Auto-Pause

**What:** Proactive push notification when a product's `stock_quantity` drops below `low_stock_threshold`. Auto-mark product unavailable at zero stock.

**Gap it solves:** The `low_stock_threshold` column exists on `products` but nothing reads it. Sellers discover they're out of stock only when buyers complain. No notification, no automation.

**Why critical:** A seller who repeatedly gets orders for out-of-stock items loses buyer trust and gets cancellations (hurting their reliability score). This is the #1 operational pain point for any marketplace seller.

**Implementation:**
- DB trigger on `products` UPDATE: when `stock_quantity <= low_stock_threshold`, insert into `notification_queue` for seller
- When `stock_quantity = 0`, auto-set `is_available = false`
- Seller dashboard: add a "Low Stock" warning badge on affected products in SellerProductsPage
- One migration (trigger), one component update

**Effort:** Small — 1 migration + badge in SellerProductsPage

---

### 2. Store Share Card (WhatsApp/Deep Link)

**What:** One-tap "Share My Store" button on SellerDashboardPage that generates a rich link (with store name, image, product count) optimized for WhatsApp, Instagram, and copy-to-clipboard.

**Gap it solves:** The empty order state says "Share your store link with neighbors" but there is NO share button anywhere in the seller dashboard. Sellers have no way to promote themselves.

**Why critical:** For hyperlocal sellers, word-of-mouth via WhatsApp is the #1 customer acquisition channel. Without a share mechanism, sellers cannot grow. This directly impacts habit formation — sellers who get orders stay; sellers who don't, churn.

**Implementation:**
- Add ShareMyStore component to QuickActions or as a prominent card on the dashboard
- Use Web Share API with fallback to clipboard
- Generate URL: `{origin}/#/seller/{sellerId}` with OG meta for preview
- Product deep link sharing already exists (ProductDetailSheet line 242) — reuse the pattern

**Effort:** Small — 1 new component, 1 line in QuickActions

---

### 3. Customer Directory (Repeat Buyer Insights)

**What:** A "My Customers" tab in the seller dashboard showing: unique buyers, order frequency per buyer, last order date, total spent. Grouped into "Regulars" (3+ orders), "Recent" (last 7 days), "Lapsed" (no order in 30+ days).

**Gap it solves:** Sellers have analytics (views, clicks, revenue charts) but zero visibility into WHO their customers are. They can't identify loyal buyers, can't send targeted coupons, can't nurture relationships.

**Why critical:** Repeat buyers are 60-70% of revenue for hyperlocal sellers. Without knowing who they are, sellers can't retain them. This is what makes a seller depend on the platform daily — checking "who ordered today" and "who stopped ordering."

**Implementation:**
- New RPC `get_seller_customer_directory` that aggregates `orders` by `buyer_id` for a given `seller_id`, joining `profiles` for name/avatar
- New component `SellerCustomerDirectory.tsx` with segmented tabs
- Add as a new tab or section in SellerDashboardPage Stats tab

**Effort:** Medium — 1 RPC, 1 component, dashboard integration

---

### 4. Settlement Ledger (Payout Transparency)

**What:** A dedicated "Payouts" page showing every settlement: date, amount, order IDs included, status (pending/processing/settled), bank account used. With running balance.

**Gap it solves:** The `seller_settlements` and `payment_settlements` tables exist in the DB with full schema, but there is NO UI showing sellers their settlement history. The earnings page shows revenue totals but not actual payouts received.

**Why critical:** Financial transparency is the #1 trust driver for sellers. If a seller can't verify "I was paid ₹X on date Y for orders A, B, C," they lose confidence in the platform. Every serious marketplace (Amazon Seller Central, Swiggy Partner) has this.

**Implementation:**
- New page `SellerPayoutsPage.tsx` querying `seller_settlements` table
- Show: settlement ID, date, amount, status, linked order count
- Add link from SellerEarningsPage and SellerSettings payouts tab
- No new DB work — tables already exist

**Effort:** Medium — 1 new page, routing, link from 2 existing pages

---

### 5. Quick Reply Templates for Chat

**What:** Pre-saved response templates sellers can tap to instantly reply to buyer messages. Examples: "Your order is being prepared," "We're out of this item, would you like X instead?", "Delivery will take ~30 min."

**Gap it solves:** Chat exists (SellerChatSheet, chat_messages table) but every response requires typing from scratch. Sellers handling 10+ chats daily waste significant time. `avg_response_minutes` is tracked and displayed — slow responses hurt their score.

**Why critical:** Response time is a core trust metric (shown on store page, factored into reliability score). Quick replies directly reduce response time, improving seller ranking and buyer satisfaction. This is what makes the chat sticky vs. sellers just giving out their phone number.

**Implementation:**
- New table `seller_quick_replies` (seller_id, label, message_text, sort_order)
- Quick reply chip bar above the chat input in SellerChatSheet
- 5 default templates auto-created on seller approval (via trigger or edge function)

**Effort:** Medium — 1 migration, 1 component, modify SellerChatSheet

---

### 6. Daily Sales Summary Push Notification

**What:** A scheduled daily push at 9 PM: "Today: 8 orders, ₹2,340 revenue, 2 pending actions." With a weekly digest on Mondays.

**Gap it solves:** Sellers currently have no reason to open the app unless they hear a new-order alert. If they miss the alert, they miss the order (and it auto-cancels). A daily summary creates a daily habit loop.

**Why critical:** Habit formation. The daily summary is the seller's "check-in" moment. It surfaces pending actions they might have missed, reinforces revenue milestones (dopamine), and keeps the app top-of-mind. Swiggy and Zomato partners get this.

**Implementation:**
- New edge function `daily-seller-summary` triggered by pg_cron at 9 PM IST
- Queries today's orders, revenue, pending count per seller
- Inserts into `notification_queue` for each active seller
- No UI changes needed — uses existing push notification infrastructure

**Effort:** Medium — 1 edge function, 1 cron job migration

---

### 7. Product Performance Ranking

**What:** On SellerProductsPage, show each product's rank within the seller's catalog: views (7-day, already fetched), orders, conversion rate, and a simple "Top Performer / Needs Attention / New" badge.

**Gap it solves:** The 7-day view count is already fetched (SellerProductsPage line 27-43) but displayed as a raw number with no context. Sellers don't know which products to promote, reprice, or discontinue. The `banner_analytics` and `product_trust_metrics` RPCs exist but aren't surfaced to sellers.

**Why critical:** Sellers who understand their catalog performance make better decisions (pricing, stock, promotion). This turns the products page from a static list into an actionable intelligence dashboard. It's the difference between "I have 20 products" and "Product X converts 3x better than Product Y."

**Implementation:**
- Extend existing view count fetch to also pull order counts from `order_items`
- Calculate conversion rate (orders/views) client-side
- Add badge component: green "Top Performer" (top 20% by orders), amber "Needs Attention" (0 orders in 14 days), gray "New" (<7 days old)
- No new RPCs needed — data already available

**Effort:** Small — modify SellerProductsPage, add badge logic

---

### 8. Order Auto-Accept with Smart Defaults

**What:** Allow sellers to enable "Auto-accept orders" in settings. When enabled, new orders skip "placed" and go directly to "preparing" status. With configurable rules: auto-accept only during operating hours, only for items in stock, only below daily order limit.

**Gap it solves:** `daily_order_limit` column exists on `seller_profiles` but isn't enforced. Sellers must manually accept every order within the SLA window or it auto-cancels. For high-volume sellers (10+ orders/day), this is unsustainable.

**Why critical:** Manual acceptance is the biggest friction point for scaling sellers. Every missed acceptance = cancelled order = unhappy buyer = lower reliability score. Auto-accept with guardrails lets sellers scale without being glued to the app, while maintaining quality control.

**Implementation:**
- Add `auto_accept_enabled` boolean to `seller_profiles`
- DB trigger on `orders` INSERT: if seller has auto-accept ON + within operating hours + stock available + under daily limit, auto-update status to 'accepted'/'preparing'
- Toggle in SellerSettingsPage with clear explanation of rules
- Respect existing `daily_order_limit` column

**Effort:** Medium — 1 migration (column + trigger), settings UI toggle

---

## Priority Matrix

| Priority | Feature | Impact | Effort |
|----------|---------|--------|--------|
| P0 | Low Stock Alerts & Auto-Pause | Prevents cancellations | Small |
| P0 | Store Share Card | Enables growth | Small |
| P0 | Product Performance Ranking | Actionable intelligence | Small |
| P1 | Settlement Ledger | Financial trust | Medium |
| P1 | Order Auto-Accept | Scales operations | Medium |
| P1 | Daily Sales Summary Push | Habit formation | Medium |
| P2 | Customer Directory | Retention insights | Medium |
| P2 | Quick Reply Templates | Response time improvement | Medium |

## Recommended Build Order

**Sprint 1 (3 P0s — small effort, massive impact):**
1. Low Stock Alerts & Auto-Pause
2. Store Share Card
3. Product Performance Ranking

**Sprint 2 (3 P1s — trust + scale):**
4. Settlement Ledger
5. Order Auto-Accept
6. Daily Sales Summary Push

**Sprint 3 (2 P2s — retention + engagement):**
7. Customer Directory
8. Quick Reply Templates

