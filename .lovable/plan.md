

# Honest Assessment: What's Already Done vs What's Truly Missing

## Already Implemented (Confirmed in Code)

All 6 gaps from the previous plan are **fully implemented**:

| Feature | Status | Evidence |
|---------|--------|----------|
| Push deep-link routing | Done | `pushData.route = item.reference_path` in `process-notification-queue` line 113-115 |
| Notification grouping (threadId) | Done | `threadId` passed to APNs (`thread-id`, `apns-collapse-id`) and FCM (`tag`) in `send-push-notification` |
| Rich push images | Done | NSE created, `mutable-content: 1` set, `image_url` from seller logo in trigger, payload wired end-to-end |
| Dynamic Island tap → order page | Done | `.widgetURL(URL(string: "sociva://orders/\(context.attributes.entityId)"))` on both lock screen and DI |
| Item count in DI | Done | `itemCount` in ContentState, fetched from `order_items`, shown in compact trailing and lock screen |
| GPS-derived progress | Done | Distance-based interpolation in `liveActivityMapper.ts` lines 75-80 |

Your assessment text may have been written before these changes were applied. The code now has all of these.

---

## What's Genuinely Still Missing

### Gap 1: APNs Push-to-Live-Activity (Critical)

**What it means:** When iOS kills your app process (memory pressure, user swipe-kill), Live Activity updates stop completely. Blinkit's activities keep updating because their server sends APNs pushes directly to the Live Activity widget token.

**What's needed:**
- When starting a Live Activity, capture the `pushToken` from ActivityKit
- Send that token to your backend
- Create an edge function that sends APNs pushes with `apns-push-type: liveactivity` and the activity's push token
- The DB trigger (or a new one) sends Live Activity update pushes on each status change

**Scope:** New DB table for LA push tokens, new edge function, Swift changes to capture push token, trigger updates. This is an architecture change.

### Gap 2: Live Map / Real-Time Rider GPS (Large Feature)

**What it means:** Blinkit shows a real-time map with the rider's moving GPS dot. Your system shows static distance text only.

**What's needed:**
- Rider/delivery partner app that broadcasts GPS coordinates (separate app or feature)
- Real-time GPS storage (e.g., `rider_locations` table with Realtime enabled)
- Buyer-side map component (MapKit JS or Google Maps) on the order tracking page
- Note: Apple does NOT allow MapKit in Live Activity widgets. The map would only appear in the in-app order tracking screen, not on the lock screen.

**Scope:** This requires a rider-side app/feature that doesn't exist yet. This is a separate product workstream.

### Gap 3: Product Thumbnails in Lock Screen Widget (Apple Limitation)

**What it means:** Blinkit sometimes shows product images in the lock screen card.

**Reality:** Live Activity widgets can display images, but they must be bundled in the app or loaded from a URL. Apple limits the total Activity payload to 4KB, so images must be small or loaded asynchronously. The NSE approach won't help here — this is about the widget itself.

**What's needed:** Pass a small product thumbnail URL in the ContentState, download it in the widget using `AsyncImage`, and display it. However, SwiftUI `AsyncImage` is unreliable in widgets. The practical approach is to pass a small base64-encoded thumbnail or rely on the seller logo already available.

---

## Implementation Plan — 2 Phases

### Phase 1: APNs Push-to-Live-Activity (Server-Side Widget Updates)

This is the single most impactful gap. Without it, Live Activities are unreliable.

| # | Change | File(s) |
|---|--------|---------|
| 1 | Capture push token from `Activity.pushTokenUpdates` stream after starting activity | `LiveActivityPlugin.swift` — add async token observation, call back to JS |
| 2 | Send push token to backend when received | `LiveActivityManager.ts` — after `startLiveActivity`, listen for token callback, save to DB |
| 3 | New DB table `live_activity_tokens` (user_id, order_id, push_token, created_at) | New migration |
| 4 | New edge function `update-live-activity-apns` — sends APNs push with `content-state` payload to the activity push token | New edge function |
| 5 | Update the order status trigger to also invoke `update-live-activity-apns` when a Live Activity token exists for the order | Update `fn_enqueue_order_status_notification` or new trigger |
| 6 | Clean up tokens when activity ends | `LiveActivityPlugin.swift` — on `endLiveActivity`, `LiveActivityManager.ts` — delete from DB |

**Actor mapping:**
- Buyer app (iOS): Captures and sends push token
- Backend trigger: Sends APNs push on status change
- Lock screen widget: Receives update even when app is killed

### Phase 2: In-App Live Map with Rider GPS (Requires Rider Infrastructure)

This phase requires a rider/delivery partner capability. If riders already exist in the system:

| # | Change | File(s) |
|---|--------|---------|
| 1 | New DB table `rider_locations` (rider_id, order_id, lat, lng, updated_at) with Realtime enabled | New migration |
| 2 | Rider-side location broadcasting (if rider app exists) | Rider app or seller dashboard integration |
| 3 | Buyer-side map component on order tracking page showing rider position | New React component using Google Maps or Mapbox |
| 4 | Realtime subscription to `rider_locations` for the active order | Order tracking page hook |

**Actor mapping:**
- Rider/delivery partner: Broadcasts GPS
- Buyer in-app (order tracking screen): Shows live map
- Lock screen widget: Cannot show map (Apple limitation) — continues showing distance text

**Note:** Phase 2 is blocked if there is no rider-side app or GPS broadcasting mechanism. The `delivery_assignments.distance_meters` field suggests some distance tracking exists, but real-time GPS streaming is a separate system.

### What About Product Thumbnails in Widget?

This is low-impact and technically fragile (4KB payload limit, unreliable `AsyncImage` in widgets). Recommend deferring. The seller logo via rich push notifications (already implemented) provides similar visual identity for push notifications. The lock screen widget already shows the seller name and branded Sociva icon.

---

## Summary

| Gap | Phase | Blocked? | Impact |
|-----|-------|----------|--------|
| APNs Push-to-Live-Activity | Phase 1 | No | Critical — activities die when app is killed |
| Live map with rider GPS | Phase 2 | Yes — needs rider GPS infrastructure | High — Blinkit's signature feature |
| Product thumbnails in widget | Deferred | No | Low — Apple limitations make it fragile |

**Recommendation:** Implement Phase 1 now. Phase 2 depends on whether rider GPS broadcasting exists or needs to be built from scratch.

