

# Final Gap Implementation Plan — Production-Grade Real-Time UX

## Current State Assessment

**Already fully implemented and verified in code:**
- Real-time pipeline (DB trigger -> edge fn -> device) with inline retry + dead-letter
- Live Activity orchestrator with single entry point (`useLiveActivityOrchestrator`)
- Native + JS dedup (hydration lock, `starting` Set, Swift entity check)
- Dynamic Island UI with item count, widgetURL deep-link, seller name
- Push deep-linking (`route` from `reference_path`), threadId grouping, rich push images (NSE)
- Distance-based progress interpolation in `liveActivityMapper.ts`
- APNs Push-to-Live-Activity (token capture, `live_activity_tokens` table, `update-live-activity-apns` edge fn)
- GPS tracking infrastructure: `delivery_locations` table (realtime-enabled), `useBackgroundLocationTracking` hook, `useDeliveryTracking` hook, `LiveDeliveryTracker` component
- Silent push for mid-flow statuses
- 5s throttle, max 10 concurrent activities
- Token cleanup on activity end

**What is NOT yet implemented (verified by code audit):**

| Gap | Description | Actor Impact |
|-----|-------------|-------------|
| **Seller self-delivery GPS** | `useBackgroundLocationTracking` only wired to `DeliveryPartnerDashboardPage`. When `delivery_handled_by = "seller"`, the seller has no GPS broadcasting UI | Seller (as rider), Buyer (no live tracking) |
| **Buyer live map** | `LiveDeliveryTracker` shows text (ETA, distance, proximity messages) but NO actual map component | Buyer |
| **Idempotency on status updates** | No dedup key (order_id + status) in edge function or trigger — retries can process the same status change twice | System reliability |
| **Realtime channel failure detection** | Orchestrator logs warning on `CHANNEL_ERROR`/`TIMED_OUT` but does NOT attempt reconnection | Buyer (silent staleness) |

---

## Phase 1: System Reliability (P0)

### 1A. Idempotency Guard on Push Processing

**Problem:** The `process-notification-queue` edge function claims batches atomically, but if the same order status triggers the trigger twice (e.g., rapid DB updates), two queue entries are created. The `queue_item_id` unique constraint on `user_notifications` prevents duplicate in-app notifications, but duplicate push notifications can still be sent.

**Fix:**
- **`fn_enqueue_order_status_notification` trigger**: Add idempotency check — before INSERT into `notification_queue`, check if a row with the same `reference_id` (order_id) and status already exists and was processed within the last 30 seconds. Use `NOT EXISTS (SELECT 1 FROM notification_queue WHERE reference_id = NEW.id AND payload->>'status' = NEW.status AND created_at > now() - interval '30 seconds')`.
- **Migration**: Add index on `notification_queue(reference_id, created_at)` for the idempotency lookup.

### 1B. Realtime Channel Auto-Reconnect

**Problem:** If the Supabase Realtime channel drops (`CHANNEL_ERROR` or `TIMED_OUT`), Live Activity updates stop silently. The orchestrator logs a warning but takes no action.

**Fix:**
- **`useLiveActivityOrchestrator.ts`**: On `CHANNEL_ERROR` or `TIMED_OUT`, remove the old channel and re-subscribe after a 3-second delay. Add a retry counter (max 3 reconnects per session) to prevent infinite loops. On successful reconnect, trigger a one-shot `syncActiveOrders`.

---

## Phase 2: Seller Self-Delivery GPS Broadcasting (P1)

**Problem:** When `delivery_handled_by = "seller"`, the seller transitions the order through `picked_up` -> `on_the_way` -> `delivered` themselves. But the GPS broadcasting (`useBackgroundLocationTracking`) is only available on the Delivery Partner Dashboard — not in the seller's order detail view.

**What exists:**
- `useBackgroundLocationTracking` hook — fully functional, uses Capacitor Geolocation, sends to `update-delivery-location` edge fn
- `delivery_locations` table — realtime-enabled, RLS allows buyer + seller reads
- `useDeliveryTracking` hook — buyer-side, subscribes to `delivery_locations` + `delivery_assignments`
- `LiveDeliveryTracker` component — shows proximity, ETA, rider info (text-based, no map)

**Fix (3 changes):**

**2A. Wire GPS tracking into seller's OrderDetailPage**
- In `OrderDetailPage.tsx`: When `o.isSellerView && delivery_handled_by === "seller"` and order status is `picked_up` or `on_the_way`, show a "Start Tracking" button and use `useBackgroundLocationTracking(deliveryAssignmentId)`.
- Show tracking state indicator (GPS active badge, last sent timestamp).
- Auto-start tracking when seller taps "Mark Picked Up".

**2B. Create delivery assignment for seller self-delivery**
- Verify that the DB trigger/flow already creates a `delivery_assignments` row when seller marks `ready` for self-delivery orders. If not, ensure a row is created with `rider_name` = seller's business name and `rider_id` = seller's user ID.
- The `update-delivery-location` edge function already writes to `delivery_locations` and updates `delivery_assignments.last_location_lat/lng` — this works for sellers too.

**2C. Buyer receives live tracking for seller-delivered orders**
- No code change needed — `OrderDetailPage` already shows `LiveDeliveryTracker` when `fulfillmentType === 'delivery'` and `isInTransit && deliveryAssignmentId`. The buyer sees the same proximity/ETA info regardless of who delivers.

---

## Phase 3: Buyer Live Map Component (P1)

**Problem:** `LiveDeliveryTracker` shows text-based proximity messages but no visual map. Blinkit shows an in-app map with the rider's moving dot.

**Fix:**

**3A. Map component using Google Maps or Leaflet (free)**
- Create `src/components/delivery/DeliveryMapView.tsx` — a lightweight map that:
  - Shows rider's current position as a moving marker
  - Shows buyer's delivery address as destination marker
  - Draws a straight line or simple route between them
  - Updates in real-time via `useDeliveryTracking` (already provides `riderLocation.latitude/longitude`)
- Use Leaflet + OpenStreetMap tiles (no API key required) for v1. Upgrade to Google Maps later if needed.

**3B. Integrate map into OrderDetailPage**
- In `OrderDetailPage.tsx`: When `isInTransit && deliveryAssignmentId && riderLocation exists`, render `DeliveryMapView` above or inside `LiveDeliveryTracker`.
- Map shows only when rider has GPS data. Falls back to text-only tracker when no location available.
- Buyer's delivery coordinates come from `order.delivery_lat/delivery_lng` (already in the orders table).

**3C. Map in Dynamic Island / Lock Screen — NOT possible**
- Apple does not allow MapKit or web views in Live Activity widgets. The lock screen continues showing text-based distance/ETA. This is a platform limitation, not a gap.

---

## Phase 4: Validation & Hardening (P0)

### 4A. State Consistency Audit
- Verify that all three surfaces (push notification, Live Activity widget, in-app UI) show the same status/ETA/progress for a given order at any point in time.
- The single source of truth is `orders.status` + `delivery_assignments` — all three surfaces already read from these tables. No fix needed, just validation.

### 4B. Notification Noise Validation
- Already implemented: `silent_push` flag on mid-flow statuses. Only `accepted`, `ready`, `delivered`, `completed`, `cancelled` trigger full push.
- Validate the `category_status_flows.silent_push` values in the database match the expected matrix.

### 4C. Deep-Link Validation
- Push tap: `pushData.route = item.reference_path` -> `/orders/{id}` -> `OrderDetailPage`
- Dynamic Island tap: `widgetURL("sociva://orders/{entityId}")` -> deep link handler -> `/orders/{id}`
- Both paths lead to the same page. Works from background, killed app, and cold start (deep link is handled by Capacitor App plugin).

---

## Implementation Order

| Order | Phase | Scope | Actor |
|-------|-------|-------|-------|
| 1 | 1A | Idempotency guard (migration + trigger update) | System |
| 2 | 1B | Realtime channel auto-reconnect (TS only) | Buyer |
| 3 | 2A-2B | Seller self-delivery GPS broadcasting (TS + possibly migration) | Seller |
| 4 | 3A-3B | Buyer live map component (new React component) | Buyer |
| 5 | 4A-4C | Validation pass (no code changes, audit only) | All |

## Files to Modify/Create

| File | Change |
|------|--------|
| New migration | Idempotency index on `notification_queue`, trigger update |
| `src/hooks/useLiveActivityOrchestrator.ts` | Auto-reconnect on channel error |
| `src/pages/OrderDetailPage.tsx` | Add seller GPS tracking UI for self-delivery |
| `src/components/delivery/DeliveryMapView.tsx` | New — Leaflet map with rider + destination markers |
| `src/pages/OrderDetailPage.tsx` | Integrate map view for buyer |

## What is NOT in scope (deferred)

| Item | Reason |
|------|--------|
| Product thumbnails in widget | Apple 4KB payload limit, unreliable AsyncImage |
| Map in lock screen widget | Apple platform limitation |
| Dedicated rider app | Separate product; seller self-delivery covers the immediate need |
| Polling fallback | Explicitly prohibited by architecture decision |

