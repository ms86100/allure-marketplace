

# Enterprise Audit: 10-Feature Implementation Status

## Feature-by-Feature Audit

---

### Feature 1: In-Order Chat

**DB-Driven Status**: ⚠️ Partial

**Hardcoding / Dummy Data Found**:
- None — chat uses `chat_messages` table correctly

**Missing or Broken Data Flow**:
- `OrderChat` is functional and order-scoped — this was already built before the plan
- **No unread badge** on `OrdersPage.tsx` order list items (plan specified this, not implemented)
- **No push notification trigger** for new chat messages (plan specified, not implemented — no DB trigger exists on `chat_messages` to enqueue notifications)
- Chat disable-after-completion logic exists but is prop-driven (`disabled` prop), not DB-enforced

**Stakeholder Gaps**:
- Buyer: Can chat ✅, no unread indicator ❌
- Seller: Can chat ✅, no unread indicator ❌
- Admin: No visibility into chat disputes or flagged messages ❌

**What is Missing vs Plan**:
- Unread badge on order list items: **NOT IMPLEMENTED**
- Push notification on new messages: **NOT IMPLEMENTED** (no migration created)

**Fix Recommendation**:
- Add DB trigger on `chat_messages` INSERT → enqueue push notification to recipient
- Add unread count query to `OrdersPage` order cards (count where `is_read = false` and `sender_id != current_user`)

---

### Feature 2: Automated Review Engine

**DB-Driven Status**: ✅ Fully DB-backed

**Hardcoding / Dummy Data Found**:
- Rating label map (`Poor`, `Fair`, `Good`, `Very Good`, `Excellent`) is hardcoded in `ReviewForm.tsx` — acceptable UI text, not a data issue
- Point values in trigger (`+5` for positive, `-2` for negative) are hardcoded in SQL — should be in a config table for tuning

**Missing or Broken Data Flow**:
- `reviews` table: **0 rows** — the engine works but has never been exercised
- `fn_review_after_insert` trigger: ✅ correctly updates `seller_profiles.rating` + inserts `seller_reputation_ledger`
- `fn_enqueue_review_prompt` trigger: ✅ correctly fires on terminal success status → enqueues `review_prompt` notification
- `ReviewPromptBanner` on `OrdersPage`: ✅ queries unreviewed orders and shows prompt
- `notification_queue` review prompts: **0 rows** — no orders have reached terminal success yet in test data

**Stakeholder Gaps**:
- Buyer: Can review ✅, gets prompt ✅
- Seller: Sees updated rating ✅, but **no notification when they receive a review** ❌
- Admin: **No admin UI to moderate reviews** (flag/hide) ❌

**What is Missing vs Plan**:
- Plan fully delivered for buyer-side
- Missing: Seller notification on new review, admin moderation panel

**Fix Recommendation**:
- Add seller notification in `fn_review_after_insert` (enqueue notification to seller's user_id)
- Consider admin review moderation view (low priority)

---

### Feature 3: Smart Notification Digest

**DB-Driven Status**: ❌ Not implemented

**Hardcoding / Dummy Data Found**: N/A

**Missing or Broken Data Flow**:
- **`generate-buyer-digest` edge function: DOES NOT EXIST** — not created
- **No cron schedule migration** was created
- `WhatsNewSection` exists on HomePage — but this is a pre-existing dormant-user component, NOT the digest described in the plan
- `WhatsNewSection` only shows new sellers since last order — it does NOT show trending items, favorited seller updates, or "you haven't ordered in X days"

**Stakeholder Gaps**:
- Buyer: No re-engagement push notifications ❌
- Seller: No "your products are trending" notifications ❌
- Admin: No digest monitoring ❌

**What is Missing vs Plan**:
- Edge function: **NOT CREATED**
- Cron schedule: **NOT CREATED**
- Home page digest section: Only pre-existing `WhatsNewSection` (partial)

**Why This is Risky**: Zero proactive re-engagement. Users who stop ordering are lost permanently.

**Fix Recommendation**:
- Create `generate-buyer-digest` edge function
- Add cron schedule (daily 10 AM IST)
- Enhance `WhatsNewSection` or create new component with trending items + favorited seller updates

---

### Feature 4: Seller Analytics Dashboard

**DB-Driven Status**: ✅ Fully DB-backed

**Hardcoding / Dummy Data Found**:
- "30d" label hardcoded — matches actual query (30-day window) ✅
- Peak hours use JS `getHours()` which is browser-timezone, NOT IST — **this is a bug for sellers in different timezones**

**Missing or Broken Data Flow**:
- `useSellerAnalytics` queries `orders` + `product_views` tables: ✅ all DB-backed
- `SellerAnalyticsTab` renders on `SellerDashboardPage`: ✅ verified
- Revenue, top products, repeat rate, avg order value, peak hours: all computed from real DB data ✅

**Stakeholder Gaps**:
- Seller: Full analytics visible ✅
- Buyer: N/A
- Admin: **No platform-wide analytics** — only per-seller ❌

**What is Missing vs Plan**:
- Plan fully delivered ✅
- Minor: peak hours heatmap was specified but implemented as chip list (acceptable simplification)

**Fix Recommendation**:
- Fix peak hours timezone to use IST consistently (use `toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})`)

---

### Feature 5: Order Failure Recovery

**DB-Driven Status**: ⚠️ Partial — UI exists, backend connection missing

**Hardcoding / Dummy Data Found**:
- None in the component itself

**Missing or Broken Data Flow**:
- `OrderFailureRecovery` component: ✅ created, queries `order_suggestions` table
- **`auto-cancel-orders` does NOT call `generate-order-suggestions`** — the critical connection is missing
- `order_suggestions` table has **0 rows** — the recovery engine has no fuel
- The component will render "nothing" because there are never suggestions generated on cancellation

**Stakeholder Gaps**:
- Buyer: Sees recovery UI IF suggestions exist — but they never exist ❌
- Seller: N/A
- Admin: No visibility into recovery attempts ❌

**What is Missing vs Plan**:
- Plan specified: "After auto-cancel-orders cancels, call generate-order-suggestions" — **NOT DONE**
- Push notification on cancellation with alternatives: **NOT DONE**

**Why This is Risky**: Buyer gets cancelled with zero recovery path. Trust-killer #1.

**Fix Recommendation**:
- In `auto-cancel-orders/index.ts`, after successful cancellation, call `generate-order-suggestions` edge function with buyer_id and product list from the cancelled order
- Add cancellation notification with "alternatives available" message

---

### Feature 6: Cross-Society Discovery UX

**DB-Driven Status**: ⚠️ Partial — DB infrastructure exists, new UX not built

**Hardcoding / Dummy Data Found**:
- None

**Missing or Broken Data Flow**:
- `sell_beyond_community` flag and `delivery_radius_km` work in existing marketplace hooks
- **`NearbySellersSection` component: DOES NOT EXIST** — not created
- **"Browse Beyond" tab: NOT ADDED** to marketplace page
- Cross-society sellers are only discoverable via a filter toggle buried in search

**Stakeholder Gaps**:
- Buyer: Cannot easily discover cross-society sellers ❌
- Seller: No visibility into cross-society demand ❌
- Admin: N/A

**What is Missing vs Plan**:
- `NearbySellersSection.tsx`: **NOT CREATED**
- "Browse Beyond" tab: **NOT ADDED**
- Distance badge, society name, delivery estimate: **NOT BUILT**

**Fix Recommendation**:
- Create `NearbySellersSection.tsx` with distance-sorted cross-society sellers
- Add to marketplace page when local sellers < 5
- Show distance badge and delivery fee estimate per seller

---

### Feature 7: Refund & Payment Visibility

**DB-Driven Status**: ⚠️ Partial — UI built, but data tables are empty

**Hardcoding / Dummy Data Found**:
- `refundStatus` logic at line 73-75 is **hardcoded heuristic**: if cancelled + not COD → assume `refund_initiated`. No actual refund status column exists on `payment_records`
- Refund progress bar steps (`Initiated`, `Processing`, `Credited`) are **static strings** — not tracked in DB
- `payment_records` table has **0 rows** — the card shows fallback "pending" for everything

**Missing or Broken Data Flow**:
- `PaymentStatusCard` queries `payment_records` + `dispute_tickets`: ✅ correct queries
- But `payment_records` is **never populated** — no trigger or edge function writes to it
- Refund progress is **faked**: no actual refund tracking in DB
- "My Payments" section on profile page: **NOT IMPLEMENTED** (plan specified this)

**Stakeholder Gaps**:
- Buyer: Sees payment card ✅ but data is always "pending" because `payment_records` is empty ❌
- Seller: No visibility into payment status from their side ❌
- Admin: No refund management tools ❌

**What is Missing vs Plan**:
- `payment_records` population on order payment: **NOT DONE**
- Profile "My Payments" section: **NOT DONE**
- Real refund tracking: **NOT DONE** (hardcoded heuristic)

**Why This is Risky**: "Where is my money?" with no real answer. Support ticket generator.

**Fix Recommendation**:
- Add trigger on `orders` (payment confirmed) → INSERT into `payment_records`
- Add `refund_status` column or use `payment_status` enum with refund states
- Add "My Payments" to profile page
- Populate `payment_records` from existing payment confirmation flows

---

### Feature 8: Store Hours Enforcement

**DB-Driven Status**: ✅ Fully DB-backed (with caveat)

**Hardcoding / Dummy Data Found**:
- `_day_abbrevs` array in `check_seller_availability()` is hardcoded but correct — this is a language constant

**Missing or Broken Data Flow**:
- `check_seller_availability()` function: ✅ created and deployed
- **BUT `create_multi_vendor_orders` uses `compute_store_status()` — a DIFFERENT function** (line 174 of RPC)
- The RPC already blocks closed stores ✅ (lines 181-183, 217-218)
- `check_seller_availability()` is **orphaned** — created but never called anywhere
- Pre-checkout validation in `useCartPage.ts`: **NOT ADDED** (plan specified)
- However, `useCart.tsx` already calls `computeStoreStatus()` on add-to-cart ✅

**Stakeholder Gaps**:
- Buyer: Blocked from ordering closed stores at RPC level ✅, blocked at cart level ✅
- Seller: Can toggle availability ✅
- Admin: N/A

**What is Missing vs Plan**:
- Plan specified adding `check_seller_availability` call to RPC — but RPC already uses `compute_store_status` which does the same thing
- `check_seller_availability` function is **redundant/orphaned**
- Pre-checkout validation not added to cart page, but cart-add already validates

**Fix Recommendation**:
- Remove orphaned `check_seller_availability` function OR replace `compute_store_status` usage in RPC with it for consistency
- Feature is functionally complete despite implementation divergence from plan

---

### Feature 9: Order Event Timeline

**DB-Driven Status**: ✅ Fully DB-backed

**Hardcoding / Dummy Data Found**:
- `ACTION_LABELS` and `STATUS_LABELS` maps (lines 9-32) are **hardcoded string dictionaries** — not DB-driven
- These should ideally come from `category_status_flows.label` column for consistency with the workflow engine
- However, these are display labels only — acceptable for now

**Missing or Broken Data Flow**:
- `OrderTimeline` queries `audit_log` table: ✅ correct
- `audit_log` has **34 entries** for orders: ✅ real data
- Timeline renders on `OrderDetailPage`: ✅ verified
- Collapsible with "Show all": ✅

**Stakeholder Gaps**:
- Buyer: Can see timeline ✅
- Seller: Can also see timeline (same OrderDetailPage) ✅
- Admin: No separate admin timeline view ❌ (acceptable — admin can use Supabase dashboard)

**What is Missing vs Plan**:
- Plan fully delivered ✅
- Actor labels could be richer (show actual names instead of "Seller"/"You")

**Fix Recommendation**:
- Consider pulling status labels from `category_status_flows.label` for consistency
- Minor polish only — feature is production-ready

---

### Feature 10: Idempotency Layer

**DB-Driven Status**: ✅ Fully DB-backed (pre-existing)

**Hardcoding / Dummy Data Found**:
- None

**Missing or Broken Data Flow**:
- `create_multi_vendor_orders`: ✅ advisory locks + `ON CONFLICT` idempotency
- `confirm_upi_payment`: **NOT AUDITED** — plan specified verifying this but no migration was created
- COD confirmation idempotency: **NOT VERIFIED**

**Stakeholder Gaps**:
- All stakeholders protected for order creation ✅
- Payment confirmation double-tap protection: **UNKNOWN**

**What is Missing vs Plan**:
- Payment confirmation idempotency audit: **NOT DONE**

**Fix Recommendation**:
- Audit `confirm_upi_payment` and COD confirmation RPCs for double-submit protection
- Add idempotency guard if missing

---

## System-Wide Report

### 1. ALL HARDCODED ELEMENTS

| Location | What | Severity |
|---|---|---|
| `PaymentStatusCard.tsx:73-75` | Refund status heuristic (cancelled → assume refund_initiated) | **HIGH** — fake refund tracking |
| `PaymentStatusCard.tsx:116` | Refund progress steps (static strings) | **HIGH** — not tied to real state |
| `OrderTimeline.tsx:9-32` | Action/status label dictionaries | LOW — display text only |
| `ReviewForm.tsx:126-131` | Rating text labels (Poor/Fair/Good) | LOW — UI cosmetic |
| `fn_review_after_insert:29-31` | Reputation points (+5/-2) | MEDIUM — should be configurable |
| `useSellerAnalytics.ts:97` | Peak hours use browser timezone | MEDIUM — incorrect for IST |

### 2. DISCONNECTED FEATURES

| Status | Feature | Detail |
|---|---|---|
| **DB exists, no UI** | `order_suggestions` | Table exists, 0 rows. Edge function exists. `auto-cancel-orders` never calls it. Recovery UI created but will always be empty. |
| **DB exists, no UI** | `payment_records` | Table exists, 0 rows. `PaymentStatusCard` queries it but nothing writes to it. Card always shows "pending". |
| **Function exists, never called** | `check_seller_availability()` | Created in migration but RPC uses different function (`compute_store_status`). Orphaned code. |
| **No backend at all** | `generate-buyer-digest` | Plan specified creating this edge function. Never created. |
| **No UI** | Cross-society discovery (`NearbySellersSection`) | Plan specified creating this component. Never created. |

### 3. TOP 5 CRITICAL GAPS (Must Fix Before Production)

1. **`payment_records` never populated** — PaymentStatusCard is a facade. Buyer sees "pending" for every order. Refund progress is faked. This WILL generate support tickets.

2. **`auto-cancel-orders` does not trigger recovery suggestions** — The entire order failure recovery pipeline is disconnected. Cancelled buyers hit a dead end.

3. **`generate-buyer-digest` edge function not created** — Zero re-engagement. Dormant users are permanently lost. The #1 retention lever is missing.

4. **Cross-society discovery UX not built** — `NearbySellersSection` not created. The growth engine for supply expansion is invisible.

5. **Chat has no push notifications** — Buyers send messages, sellers don't know. No DB trigger on `chat_messages`. Real-time only works if app is open.

### 4. FINAL VERDICT

## ⚠️ PARTIALLY READY

**What works (production-grade)**:
- Review engine (DB triggers, prompts, reputation ledger) — needs first real usage
- Order timeline (audit_log → UI) — fully connected
- Seller analytics (real DB data → charts) — fully connected
- Store hours enforcement — already enforced in RPC (via existing function)
- Idempotency for orders — pre-existing, production-grade

**What is facade/broken**:
- Payment visibility — UI exists, DB has 0 data, refund tracking is faked
- Order failure recovery — UI exists, backend pipeline disconnected
- Smart notifications — not built at all
- Cross-society UX — not built at all
- Chat notifications — missing push triggers

---

## Implementation Fix Plan (Priority Order)

### Phase 1: Fix Facades (2 migrations + 1 edge function update)
1. **Populate `payment_records`** — Add trigger on order payment confirmation to INSERT record
2. **Connect auto-cancel → suggestions** — Add `generate-order-suggestions` call in `auto-cancel-orders/index.ts`
3. **Add chat notification trigger** — DB trigger on `chat_messages` INSERT → `notification_queue`

### Phase 2: Build Missing Features (1 edge function + 1 component)
4. **Create `generate-buyer-digest` edge function** + cron schedule
5. **Create `NearbySellersSection`** component for cross-society discovery

### Phase 3: Polish
6. Fix peak hours timezone in `useSellerAnalytics`
7. Remove orphaned `check_seller_availability` function
8. Add seller notification on review received
9. Audit payment confirmation RPCs for idempotency

