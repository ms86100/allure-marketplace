# Smart Phone-Native Capabilities — Final Audit Status

## Status: COMPLETE (All Phases A–I + Blinkit Gap-Fill Phases 1–3)

All 9 original phases plus Blinkit parity Phases 1–3 are fully implemented.

## Blinkit Gap-Fill Status

### Phase 1: APNs Push-to-Live-Activity — COMPLETE

Live Activities now update even when the app process is killed by iOS, matching Blinkit's reliability.

#### Architecture

```
Order status change → DB trigger → net.http_post → update-live-activity-apns edge function
  → APNs push (apns-push-type: liveactivity) → iOS widget receives content-state update
  → Lock screen / Dynamic Island re-renders
```

#### Implementation Details

| Component | What Was Done |
|-----------|---------------|
| **DB table** | `live_activity_tokens` (user_id, order_id, push_token, platform) with RLS |
| **Swift plugin** | `LiveActivityPlugin.swift` — requests activity with `pushType: .token`, observes `Activity.pushTokenUpdates`, emits `liveActivityPushToken` event to JS |
| **LiveActivityManager.ts** | Listens for `liveActivityPushToken` events, upserts token to `live_activity_tokens` table, cleans up on activity end |
| **Edge function** | `update-live-activity-apns` — receives order status + push token, fetches delivery data (ETA, distance, rider), builds `content-state` matching `LiveDeliveryAttributes.ContentState`, sends APNs push with `apns-push-type: liveactivity` |
| **DB trigger** | `fn_enqueue_order_status_notification` updated — looks up LA token for order, invokes edge function via `net.http_post` if token exists. Cleans up tokens on terminal statuses. Also now includes `silent_push` and `image_url` in notification payload. |

### Phase 2: System Reliability — COMPLETE

#### 2A. Idempotency Guard on Push Processing

| Component | What Was Done |
|-----------|---------------|
| **DB trigger** | `fn_enqueue_order_status_notification` now checks for duplicate entries (same `reference_path` + `payload->>'status'` within 30 seconds) before inserting into `notification_queue`. Skips with `RAISE NOTICE`. |
| **DB index** | `idx_notification_queue_dedup` on `notification_queue(reference_path, created_at DESC)` for fast dedup lookups |

#### 2B. Realtime Channel Auto-Reconnect

| Component | What Was Done |
|-----------|---------------|
| **`useLiveActivityOrchestrator.ts`** | Both order and delivery channels now detect `CHANNEL_ERROR` / `TIMED_OUT`, remove the dead channel, and re-subscribe after 3s delay. Max 3 reconnects per session. On successful reconnect (`SUBSCRIBED`), retry counter resets. Each reconnect triggers a one-shot `syncActiveOrders` to fill any gap. Unique channel names with `Date.now()` suffix prevent Supabase channel name conflicts. |

### Phase 3: Seller Self-Delivery GPS + Buyer Live Map — COMPLETE

#### 3A. Seller GPS Broadcasting for Self-Delivery

| Component | What Was Done |
|-----------|---------------|
| **`SellerGPSTracker.tsx`** | New component — shown to sellers on OrderDetailPage when `delivery_handled_by === 'seller'` and order status is `picked_up` or `on_the_way`. Uses existing `useBackgroundLocationTracking` hook. Shows Start/Stop controls, live badge, and last-sent timestamp. |
| **`OrderDetailPage.tsx`** | Integrated `SellerGPSTracker` in the seller action area, gated by `delivery_handled_by === 'seller'` + transit statuses |

#### 3B. Buyer Live Map

| Component | What Was Done |
|-----------|---------------|
| **`DeliveryMapView.tsx`** | New component using Leaflet + OpenStreetMap (no API key). Shows rider position (🛵 marker) and destination (📍 marker). Auto-fits bounds on mount, pans when rider moves out of view. |
| **`OrderDetailPage.tsx`** | Integrated `DeliveryMapView` above `LiveDeliveryTracker` for buyer view when rider has GPS data and order has delivery coordinates (`delivery_lat`/`delivery_lng`). Falls back to text-only tracker when no GPS data available. |

### Previously Completed Blinkit Gaps

| Feature | Status |
|---------|--------|
| Push deep-link routing | ✅ Done |
| Notification grouping (threadId) | ✅ Done |
| Rich push images (NSE) | ✅ Done |
| Dynamic Island tap → order page | ✅ Done |
| Item count in DI | ✅ Done |
| GPS-derived progress | ✅ Done |

### Phase 4: Live Map / Rider GPS — DEFERRED

Requires dedicated rider-side GPS broadcasting infrastructure (separate product workstream). Seller self-delivery GPS (Phase 3A) covers the immediate need.

### Product Thumbnails in Widget — DEFERRED

Low impact due to Apple's 4KB payload limit and unreliable `AsyncImage` in widgets.

## Silent Push Optimization: COMPLETE

### Notification Matrix

| Status | Push? | Live Activity? | Rationale |
|--------|-------|----------------|-----------|
| `accepted` | ✅ Always | Yes | Critical — order confirmed |
| `preparing` | 🔇 Silent | Yes | Mid-flow, Live Activity handles it |
| `ready` | ✅ Always | Yes | Pickup moment — user must know |
| `picked_up` | 🔇 Silent | Yes | Mid-flow tracking |
| `on_the_way` | 🔇 Silent | Yes | Mid-flow tracking |
| `arrived` | 🔇 Silent | Yes | Live Activity shows on lock screen |
| `delivered` | ✅ Always | Yes | Critical endpoint |
| `completed` | ✅ Always | No | Critical endpoint |
| `cancelled` | ✅ Always | No | Critical — must alert |
| All service/booking | ✅ Always | No | No Live Activity for these |

## Implementation Matrix

| Phase | Feature | Status |
|---|---|---|
| A | Enhanced Delivery Proximity | Implemented |
| B | Multi-Interval Booking Reminders | Implemented |
| C | Predictive Ordering Engine | Implemented |
| D | One-Tap Server-Side Reorder | Implemented |
| E | Historical ETA Intelligence | Implemented |
| F | Smart Arrival Detection | Implemented |
| G | Smart Delay Detection | Implemented |
| H | Notification Payload Standardization | Implemented |
| I | Lock Screen Live Activities | Implemented (CI pipeline complete) |
| BG-1 | APNs Push-to-Live-Activity | Implemented |
| BG-2 | System Reliability (Idempotency + Reconnect) | Implemented |
| BG-3 | Seller Self-Delivery GPS + Buyer Live Map | Implemented |
