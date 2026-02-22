

# Delivery Integration PRD - Honest Review and Implementation Plan

## My Honest Assessment

Your PRD is **one of the best-structured feature documents I've seen for this project**. The thinking is solid, the risks are clearly identified, and the "do not" list at the end shows mature product judgment. That said, I have some important feedback before we implement.

---

## What's Good (Keep As-Is)

1. **Starting with 3PL, not native fleet** -- Correct. Building a rider app is a separate product.
2. **OTP-based delivery confirmation** -- Absolutely necessary for gated communities.
3. **Gate integration for delivery riders** -- This is Sociva's moat. No other delivery platform does this.
4. **Server-side fee calculation** -- Critical for financial integrity.
5. **Not rebuilding commerce or payments** -- Smart scoping.

---

## What Needs Adjustment

### Issue 1: "out_for_delivery" and "failed_delivery" as new enum values -- Unnecessary

The order_status enum already has 13 values including `picked_up` and `delivered`. Your PRD proposes `out_for_delivery` and `failed_delivery`. Here's the problem:

- `out_for_delivery` is semantically identical to `picked_up` (which already exists and means "left the seller")
- Adding `failed_delivery` creates a terminal state that conflicts with `cancelled` and `returned`

**Recommendation:** Reuse `picked_up` as "out for delivery" (just relabel it in the UI). For failed delivery, use `returned` (already exists). This avoids an enum migration and keeps the state machine clean. The delivery metadata (attempt count, failure reason) belongs in `delivery_assignments`, not in the order status.

### Issue 2: 3PL Adapter Abstraction Layer -- Over-Engineering for Phase 1

Your PRD proposes an interface with `createShipment`, `cancelShipment`, `trackShipment`. This is classic enterprise architecture that makes sense when you have 3+ providers. For v1 with one 3PL:

**Recommendation:** Build a single edge function `manage-delivery` that handles the 3PL API directly. The abstraction can come in Phase 2 when you actually need a second provider. Right now it adds complexity without value.

### Issue 3: "Delivery Service may trigger transitions" -- Who is the Delivery Service?

The PRD says "Only Delivery Service may trigger these transitions" but doesn't define what that is. In the current architecture:

- Order status updates happen via direct Supabase client calls from the frontend
- There's a DB trigger (`validate_order_status_transition`) that enforces valid transitions
- There's no "service layer" between frontend and database

**Recommendation:** The "Delivery Service" should be an edge function (`manage-delivery`) that:
- Receives webhooks from 3PL
- Validates webhook signatures
- Updates order status via service_role_key (bypassing RLS)
- Creates audit trail

The frontend should NOT be able to set `picked_up` or `delivered` for delivery orders -- only the edge function should. This requires an RLS policy change for delivery-enabled orders.

### Issue 4: Delivery Fee in Orders Table -- Partially Correct

Adding `delivery_fee` to `orders` is fine. But `delivery_commission`, `partner_payout`, `platform_margin` belong in `delivery_assignments`, not `orders`. The orders table should only know the total delivery fee charged to the buyer. The economics split is a delivery-domain concern.

### Issue 5: Missing Concept -- Delivery Eligibility

The PRD doesn't address: **Which orders get delivery?** Not every order should. Consider:
- Same-building orders (seller and buyer in same society) -- self-pickup makes more sense
- Service orders (`request_service`, `book`) -- no physical delivery
- Low-value orders -- delivery fee may exceed order value

**Recommendation:** Add a `fulfillment_type` field to orders: `self_pickup` | `delivery` | `both`. Let the buyer choose at checkout. Only `delivery` orders enter the delivery pipeline.

### Issue 6: Week 5 Timeline for Admin Dashboard -- Too Late

Delivery monitoring should be available from Week 2, not Week 5. Without monitoring, you'll be flying blind during testing.

---

## Revised Implementation Plan

### Phase 1: Database Schema (Week 1)

**1a. New tables:**

```text
delivery_partners
  - id (uuid, PK)
  - society_id (uuid, FK -> societies)
  - name (text)
  - provider_type ('3pl' | 'native')
  - api_config (jsonb) -- encrypted 3PL credentials
  - is_active (boolean)
  - created_at, updated_at

delivery_assignments
  - id (uuid, PK)
  - order_id (uuid, FK -> orders, UNIQUE)
  - partner_id (uuid, FK -> delivery_partners, nullable)
  - society_id (uuid, FK -> societies)
  - rider_name (text, nullable)
  - rider_phone (text, nullable)
  - rider_photo_url (text, nullable)
  - status ('pending' | 'assigned' | 'picked_up' | 'at_gate' | 'delivered' | 'failed' | 'cancelled')
  - gate_token_id (uuid, nullable) -- links to gate_entries
  - otp_hash (text, nullable) -- hashed delivery OTP
  - otp_expires_at (timestamptz, nullable)
  - delivery_fee (numeric)
  - partner_payout (numeric)
  - platform_margin (numeric)
  - pickup_at (timestamptz, nullable)
  - delivered_at (timestamptz, nullable)
  - failed_reason (text, nullable)
  - attempt_count (integer, default 0)
  - external_tracking_id (text, nullable) -- 3PL reference
  - idempotency_key (text, UNIQUE)
  - created_at, updated_at

delivery_tracking_logs
  - id (uuid, PK)
  - assignment_id (uuid, FK -> delivery_assignments)
  - status (text)
  - location_lat (numeric, nullable)
  - location_lng (numeric, nullable)
  - note (text, nullable)
  - source ('3pl_webhook' | 'manual' | 'system')
  - created_at
```

**1b. Modify orders table:**
- Add `fulfillment_type` (text, default 'self_pickup') -- values: 'self_pickup', 'delivery'
- Add `delivery_fee` (numeric, default 0)
- Do NOT add delivery economics columns here

**1c. Update order state machine:**
- No new enum values needed
- Update `validate_order_status_transition` to allow: `ready -> picked_up` (already allowed via ready -> picked_up path)
- The existing transitions already support the delivery flow

**1d. RLS policies:**
- `delivery_partners`: SELECT for society members, INSERT/UPDATE for admin/society_admin only
- `delivery_assignments`: SELECT for buyer + seller + admin, INSERT/UPDATE only via edge function (service role)
- `delivery_tracking_logs`: SELECT for buyer + seller + admin, INSERT only via edge function

### Phase 2: Delivery Assignment Engine (Week 2)

**Edge function: `manage-delivery/index.ts`**

Handles:
- `POST /assign` -- Called by DB trigger when order hits 'ready' + fulfillment_type = 'delivery'
- `POST /webhook` -- Receives 3PL status updates
- `POST /complete` -- Validates OTP and marks delivered
- `GET /track` -- Returns current delivery status

**DB trigger:** `trg_auto_assign_delivery`
- Fires on orders UPDATE when status changes to 'ready' AND fulfillment_type = 'delivery'
- Inserts into `delivery_assignments` with status 'pending'
- Inserts notification to seller: "Delivery partner being assigned"

**OTP generation:**
- When assignment status changes to 'picked_up', generate 4-digit OTP
- Store bcrypt hash in `delivery_assignments.otp_hash`
- Send OTP to buyer via notification_queue
- OTP expires in 30 minutes

### Phase 3: Gate Integration (Week 3)

**How it works:**
- When delivery assignment status = 'at_gate', the system generates a temporary gate entry
- Reuse existing `visitor_entries` table with `visitor_type = 'delivery'`
- Auto-create visitor entry with: rider name, rider phone, order reference, flat of buyer
- Guard kiosk "Expected" tab already shows today's visitors -- delivery riders appear here
- Guard validates via existing OTP flow (auto-generated OTP sent to buyer)
- On gate entry confirmation, delivery assignment status updates to 'at_gate'

This reuses the existing gate infrastructure completely -- no new gate logic needed.

### Phase 4: Checkout Integration + Fee Calculation (Week 3-4)

**Frontend changes:**
- `CartPage.tsx`: Add fulfillment type selector (Pickup / Delivery) before checkout
- Delivery fee calculated server-side based on: distance_km between societies, order value, society-level delivery config
- Show delivery fee breakdown in order summary

**Server-side fee calculation (edge function or DB function):**

```text
calculate_delivery_fee(order_value, distance_km, society_id):
  - Base fee from society config (e.g., Rs 20 for < 2km)
  - Distance surcharge (e.g., Rs 5 per additional km)
  - Free delivery threshold (e.g., orders > Rs 500)
  - Returns: { delivery_fee, partner_payout, platform_margin }
```

### Phase 5: Monitoring + Notifications (Week 4)

**Admin delivery monitoring:**
- New tab in Admin page or Society Dashboard
- Shows: active deliveries, delayed (SLA breach), failed, completed today
- SLA: assignment within 60s, delivery within 45min for intra-society
- Filterable by society (for platform admin)

**Notification triggers (DB triggers on delivery_assignments):**
- `pending -> assigned`: Notify buyer "Delivery partner assigned: [name]"
- `assigned -> picked_up`: Notify buyer "Your order is on the way!"
- `picked_up -> at_gate`: Notify buyer "Delivery partner at your gate. OTP: XXXX"
- `at_gate -> delivered`: Notify buyer "Order delivered!"
- `* -> failed`: Notify buyer + seller + admin

### Phase 6: Buyer/Seller UI (Week 4-5)

**OrderDetailPage.tsx changes:**
- Show delivery status card when fulfillment_type = 'delivery'
- Show rider info (name, phone) when assigned
- Show OTP when rider is at gate
- Show delivery timeline (picked up -> at gate -> delivered)
- Realtime subscription on delivery_assignments for live updates

**SellerDashboardPage.tsx changes:**
- Show fulfillment type badge on order cards
- For delivery orders, show "Awaiting Pickup" instead of "Ready for Customer"

---

## What We're Deliberately NOT Building in v1

| Feature | Why Not |
|---------|---------|
| Live map tracking | Requires continuous GPS from rider app. Overkill for intra-society delivery. |
| Rider app | 3PL provides their own rider interface. |
| Multi-attempt delivery | v1 allows 1 attempt. Failed = returned to seller. |
| Dynamic pricing | Fixed fee per society config. Dynamic pricing adds complexity without validated demand. |
| Rating delivery partner | No rider app to receive feedback. Revisit with native fleet. |
| Delivery slots/scheduling | v1 is immediate delivery only. |

---

## Technical Summary

| Component | Action |
|-----------|--------|
| New tables | `delivery_partners`, `delivery_assignments`, `delivery_tracking_logs` |
| Modified tables | `orders` (add `fulfillment_type`, `delivery_fee`) |
| New edge function | `manage-delivery` (assignment, webhook, OTP, tracking) |
| Modified edge function | `gate-token` (support delivery rider gate pass) |
| New DB triggers | `trg_auto_assign_delivery`, `trg_notify_delivery_status` |
| Modified DB trigger | `validate_order_status_transition` (no changes needed -- existing transitions work) |
| New UI components | `DeliveryStatusCard`, `FulfillmentSelector`, `DeliveryMonitoringTab` |
| Modified pages | `CartPage`, `OrderDetailPage`, `SellerDashboardPage`, `AdminPage`/`SocietyDashboardPage` |
| RLS policies | 3 new tables with society-scoped policies |
| No enum changes | Reuse existing `picked_up`, `delivered`, `returned` statuses |

---

## Risk Mitigation

| PRD Risk | Mitigation |
|----------|------------|
| Payment-delivery coupling | Delivery fee is a line item. Payment flow unchanged. |
| Client-side status manipulation | Delivery status updates only via edge function with service_role_key |
| Gate bypass | Reuse existing visitor_entries + gate validation. No new security surface. |
| Cross-society routing | delivery_assignments has society_id. RLS enforces isolation. |
| Duplicate assignments | UNIQUE constraint on order_id in delivery_assignments + idempotency_key |

This plan delivers 80% of the PRD's value with 50% of the proposed complexity by reusing existing infrastructure (gate system, visitor entries, order states, notification pipeline) rather than building parallel systems.

