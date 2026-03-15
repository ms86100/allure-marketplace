

# Smart Phone-Native Capabilities — Implementation Plan

## Current State Assessment

**Already implemented**: Proximity alerts (500m, with 200m variant), stale detection (3min GPS silence), Haversine ETA, ReorderButton (client-side cart replacement), booking reminders (1hr cron), society geofence, background location tracking (10s interval), rich notification cards, home notification banner.

**Key gaps vs. the 12-phase plan**: No predictive ordering, no server-side quick-reorder, no historical ETA stats, no arrival detection, no 200m dedicated alert, no lock-screen live activity, no multi-interval reminders, no smart delay detection.

---

## Implementation Phases (Prioritized by Impact × Feasibility)

### Phase A: Enhanced Delivery Proximity (your Phases 6, 10)
**Why first**: Smallest delta, highest UX impact. Existing code handles 500m as a single event.

- Update `update-delivery-location` edge function:
  - Add `delivery_proximity_imminent` type at <200m (separate dedup key from existing `delivery_proximity`)
  - Include `distance`, `eta`, driver info in payload
  - Add `delivery_en_route` notification at first GPS update after `picked_up` status
- Update `RichNotificationCard` to handle `delivery_proximity_imminent` with urgent styling
- Add full-screen `DeliveryArrivalOverlay` component on order tracking page when distance <200m

### Phase B: Multi-Interval Booking Reminders (your Phase 9)
**Why**: Simple cron enhancement, directly addresses the "10 minutes" requirement.

- Update `send-booking-reminders` to run every 5 minutes (currently every 10)
- Add 30-minute and 10-minute reminder windows alongside existing 1-hour
- Add dedup: check `notification_queue` for existing reminder at same interval before inserting
- Include quick actions in payload: `{ action: "Open Directions", reference_path: "/orders" }`
- Notify both buyer and seller at each interval

### Phase C: Predictive Ordering Engine (your Phases 2, 5)
**Database**:
- New table `order_suggestions` (id, user_id, product_id, seller_id, trigger_type, day_of_week, time_bucket, confidence_score, suggested_at, dismissed, acted_on, created_at)

**Backend**:
- New edge function `generate-order-suggestions`:
  - Runs daily at 6 AM via cron
  - Queries completed orders per user, groups by (product_id, seller_id, day_of_week, hour)
  - If ≥2 occurrences on same day-of-week within 30 days → insert suggestion with `trigger_type: 'time_pattern'`
  - At predicted time (±30min window), insert into `notification_queue` with action payload

**Frontend**:
- New `SmartSuggestionBanner` on HomePage — fetches today's suggestions, shows "Order again?" card with product image, seller name, and Reorder/Dismiss buttons
- New `useOrderSuggestions` hook

### Phase D: One-Tap Server-Side Reorder (your Phase 3)
**Backend**:
- New edge function `quick-reorder`:
  - Accepts `order_id`, validates buyer ownership
  - Checks product availability + approval status
  - Calls existing `create_multi_vendor_orders` DB function
  - Returns new order ID
- Push notification payload includes `action: "Reorder"`, `order_id`

**Frontend**:
- When notification with `action: "Reorder"` is tapped → call `quick-reorder` → show confirmation toast → navigate to order detail
- Falls back to existing cart-based reorder if server call fails

### Phase E: Historical ETA Intelligence (your Phase 4)
**Database**:
- New table `delivery_time_stats` (seller_id, society_id, time_bucket, avg_prep_minutes, avg_delivery_minutes, sample_count, updated_at)

**Backend**:
- New trigger: on delivery completion (`status = 'delivered'`), calculate actual prep and delivery durations, upsert into `delivery_time_stats`
- Update `update-delivery-location` to blend historical avg with live GPS-based ETA when speed data is poor

**Frontend**:
- Show ETA as range ("11–14 min") instead of single number in order tracking UI

### Phase F: Smart Arrival Detection (your Phase 5)
**Frontend only** (no new backend):
- New `useArrivalDetection` hook:
  - Uses `navigator.geolocation.watchPosition` (or Capacitor Geolocation)
  - Compares against user's society coordinates + `geofence_radius_meters`
  - When entering geofence → check `order_suggestions` for arrival-triggered suggestions
  - Show `ArrivalSuggestionCard` on HomePage

### Phase G: Smart Delay Detection (your Phase 8)
- Enhance `update-delivery-location`:
  - Track heading changes — if driver reverses direction significantly, flag as "route changed"
  - If ETA increases by >5 min between updates, send `delivery_delayed` notification
  - Dedup via `notification_queue` type + reference_path

### Phase H: Notification Payload Standardization (your Phase 1 enhancement)
- Ensure every notification inserted into `notification_queue` includes standardized payload:
  ```json
  { "type": "...", "entity_type": "order|booking", "entity_id": "...", "workflow_status": "...", "action": "..." }
  ```
- Update DB trigger, booking reminders, and delivery location function to use this format
- Update `RichNotificationCard` to use `entity_type` for icon selection

### Phase I: Lock Screen Live Activities (your Phase 7)
**Note**: This requires native iOS/Android code (Swift LiveActivity API / Android Foreground Service). Cannot be implemented purely in web/Capacitor without a native plugin.

- **Feasible now**: Persistent push notification updates (Android) — update existing notification instead of creating new ones
- **Requires native plugin**: iOS Live Activities — would need a custom Capacitor plugin
- **Recommendation**: Defer iOS Live Activities. Implement Android persistent notification via updated push payloads with `tag` field for replacement

---

## Database Changes

```sql
-- Phase C
CREATE TABLE order_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES seller_profiles(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'time_pattern',
  day_of_week int, -- 0=Sun..6=Sat
  time_bucket int, -- hour of day 0-23
  confidence_score numeric(3,2) DEFAULT 0.5,
  suggested_at timestamptz,
  dismissed boolean DEFAULT false,
  acted_on boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE order_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own suggestions" ON order_suggestions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own suggestions" ON order_suggestions FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Phase E
CREATE TABLE delivery_time_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES seller_profiles(id) ON DELETE CASCADE NOT NULL,
  society_id uuid REFERENCES societies(id) ON DELETE CASCADE,
  time_bucket int, -- hour 0-23
  avg_prep_minutes numeric(6,1) DEFAULT 0,
  avg_delivery_minutes numeric(6,1) DEFAULT 0,
  sample_count int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(seller_id, society_id, time_bucket)
);
```

## Files to Create/Modify

| File | Phase | Action |
|---|---|---|
| `supabase/functions/update-delivery-location/index.ts` | A, G | Add 200m alert, delay detection |
| `supabase/functions/send-booking-reminders/index.ts` | B | Add 30min + 10min intervals, dedup |
| `supabase/functions/generate-order-suggestions/index.ts` | C | New — pattern analysis cron |
| `supabase/functions/quick-reorder/index.ts` | D | New — server-side reorder |
| `src/components/home/SmartSuggestionBanner.tsx` | C | New — suggestion cards |
| `src/components/order/DeliveryArrivalOverlay.tsx` | A | New — full-screen arrival alert |
| `src/components/home/ArrivalSuggestionCard.tsx` | F | New — geofence-triggered card |
| `src/hooks/useOrderSuggestions.ts` | C | New |
| `src/hooks/useArrivalDetection.ts` | F | New |
| `src/components/notifications/RichNotificationCard.tsx` | A, H | Add imminent styling + entity_type |
| `src/pages/HomePage.tsx` | C, F | Mount new banners |
| Database migration | A–H | Tables + cron jobs |

## Execution Order

Phase A → B → C → D → E → F → G → H (each independently deployable)

Phase I (Live Activities) deferred — requires native plugin development outside Lovable scope.

