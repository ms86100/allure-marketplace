# Smart Phone-Native Capabilities — Final Audit Status

## Status: COMPLETE (All Phases A–I + Blinkit Gap-Fill Phase 1)

All 9 original phases plus Blinkit parity Phase 1 (APNs Push-to-Live-Activity) are fully implemented.

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

#### APNs Push Format

```json
{
  "aps": {
    "timestamp": 1710764400,
    "event": "update",
    "content-state": {
      "workflowStatus": "on_the_way",
      "etaMinutes": 5,
      "driverDistance": 1.2,
      "driverName": "Ravi",
      "progressPercent": 0.7,
      "sellerName": "Fresh Bakes",
      "itemCount": 3
    }
  }
}
```

### Previously Completed Blinkit Gaps

| Feature | Status |
|---------|--------|
| Push deep-link routing | ✅ Done |
| Notification grouping (threadId) | ✅ Done |
| Rich push images (NSE) | ✅ Done |
| Dynamic Island tap → order page | ✅ Done |
| Item count in DI | ✅ Done |
| GPS-derived progress | ✅ Done |

### Phase 2: Live Map / Rider GPS — DEFERRED

Requires rider-side GPS broadcasting infrastructure (separate product workstream).

### Product Thumbnails in Widget — DEFERRED

Low impact due to Apple's 4KB payload limit and unreliable `AsyncImage` in widgets.

## Silent Push Optimization: COMPLETE

### What It Does
Reduces push notification noise for mid-flow order statuses when Live Activity is already tracking the order on the lock screen. In-app notification history and badge counts are always preserved.

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

### Implementation

1. **DB column**: `category_status_flows.silent_push` (boolean, default false)
2. **DB trigger**: `fn_enqueue_order_status_notification` includes `silent_push` in notification payload
3. **Edge function**: `process-notification-queue` skips APNs/FCM delivery when `silent_push = true`, but still inserts `user_notifications` for in-app history

## Phase I Live Activities — CI Pipeline Status

### Codemagic Build Pipeline: COMPLETE

Both `ios-release` and `release-all` workflows now include:

| Step | Description |
|---|---|
| Copy native plugin files | Copies `LiveActivityPlugin.swift` + `LiveDeliveryActivity.swift` into `ios/App/App/` and adds to App target via xcodeproj |
| Create Widget Extension | Programmatically creates `LiveDeliveryWidgetExtension` target using Ruby xcodeproj gem |
| ActivityKit entitlements | Adds `com.apple.developer.activitykit` to both App and widget extension entitlements |
| NSSupportsLiveActivities | Sets `NSSupportsLiveActivities = true` in Info.plist |
| Deployment target 16.1 | All targets set to iOS 16.1 (required for ActivityKit) |
| Widget signing | Fetches signing files for `app.sociva.community.LiveDeliveryWidget` |
| Plugin registration | AppDelegate registers `LiveActivityPlugin` with `#available(iOS 16.1, *)` guard |
| IPA validation | Verifies widget extension `.appex` exists in final IPA |

### Codemagic Requirements (User Action)

In App Store Connect, register the widget extension bundle ID:
- `app.sociva.community.LiveDeliveryWidget`

### Runtime Call Chain (Verified)

```
Order status change → useLiveActivity hook → LiveActivityManager.push()
  → LiveActivity.startLiveActivity/update/end → Native Plugin Bridge → iOS ActivityKit
  → On web: silent no-op
```

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

## Reality-Check Audit Fixes (Round 4)

### Fix 1: Live Activity Deduplication — COMPLETE

| Layer | Fix |
|-------|-----|
| **Swift native** | `startLiveActivity` now checks for existing activity with same `entityId` before `Activity.request()`. If found, updates it and returns existing `activity.id` instead of creating a duplicate. |
| **LiveActivityManager** | Added `hydrating` flag; `resetHydration()` is now a no-op while hydration is actively running, preventing the poll timer from racing with app-resume sync. |
| **liveActivitySync** | Added `syncing` mutex flag to prevent concurrent `syncActiveOrders` calls from overlapping. |
| **Orchestrator** | App-resume handler now pauses the poll timer before syncing, then resumes it after sync completes. |

### Fix 2: Toast Conflict Prevention — COMPLETE

| Layer | Fix |
|-------|-----|
| **useCartPage** | Added `upiCompletionRef` guard — only ONE of `handleUpiDeepLinkSuccess` / `handleUpiDeepLinkFailed` can execute per payment session. Both use the same toast ID `'upi-confirmed'` for dedup. Ref resets when a new UPI session starts. |
| **UpiDeepLinkCheckout** | `handleSystemClose` now skips `onPaymentFailed` when `completionTriggeredRef.current` is true, preventing the sheet unmount from firing a conflicting handler after success. |
