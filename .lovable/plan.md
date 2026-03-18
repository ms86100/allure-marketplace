

## Verification Audit: Live Activity & Push Notification Fixes

### 1. Wording Consistency — PARTIALLY FIXED, STILL MISMATCHED

The `PROGRESS_DESCRIPTIONS` in `liveActivityMapper.ts` were updated to shorter forms, but they still **do not match** the push notification titles:

| Status | Live Activity (`liveActivityMapper.ts`) | Push Title (`order-notification-titles.ts`) | Match? |
|--------|---------------------------------------|---------------------------------------------|--------|
| accepted | "Order Accepted" | "✅ Order Accepted!" | Close but not identical (emoji + exclamation) |
| preparing | "Order Being Prepared" | "👨‍🍳 Order Being Prepared" | Close but emoji differs |
| ready | "Order Ready" | "🎉 Order Ready!" | Close but emoji + exclamation |
| picked_up | "Order Picked Up" | "📦 Order Picked Up" | Close but emoji |
| on_the_way | "Order On The Way" | "🛵 Order On The Way!" | Close but emoji + exclamation |

**Verdict**: The base text is now aligned, but push notifications include emojis and exclamation marks that Live Activity does not. This is acceptable — lock-screen widgets typically use plain text while notification banners use richer formatting. However, if strict parity is desired, this should be called out.

**Important caveat**: The push notification titles in `order-notification-titles.ts` are labeled as needing to stay in sync with the **DB trigger** (`enqueue_order_status_notification`). The actual push notification body text comes from `category_status_flows` table rows, not this file. The real wording comparison requires checking what the edge function sends as the notification body, which may differ from these title constants.

### 2. Duplicate Alert Suppression — IMPLEMENTED AND WORKING

Code at `usePushNotifications.ts` lines 313-319:
```typescript
const data = notification?.data as Record<string, string> | undefined;
const orderId = data?.order_id ?? data?.entity_id;
if (orderId && LiveActivityManager.isTracking(orderId)) {
  pushLog('info', 'FOREGROUND_SUPPRESSED_LA_ACTIVE', { orderId });
  return;  // Skips haptic, sound, and toast
}
```

This correctly suppresses the foreground toast, sound, and haptics when a Live Activity is already tracking the order. The `isTracking` method exists at `LiveActivityManager.ts` line 344 and checks the in-memory `active` map.

**One gap**: This suppression only works when the **app is in the foreground**. When the app is backgrounded, the OS delivers the push notification banner natively — the app code never runs, so suppression cannot happen. This is a platform limitation, not a bug.

### 3. Live Activity Tracking Check — IMPLEMENTED

`LiveActivityManager.isTracking(entityId)` exists at line 344, checks the `active` Map, and is actively used in the push notification handler. Working as designed.

### 4. Real Device Testing — CANNOT BE DONE IN THIS ENVIRONMENT

This audit environment is code-only. Actual device behavior (lock screen, background state, app-killed scenarios) must be tested on a physical iOS/Android device via TestFlight or debug build.

### 5. Remaining Gaps (Honest Assessment)

| Item | Status | Notes |
|------|--------|-------|
| Wording alignment (base text) | Done | Emoji/punctuation still differ — acceptable for different surfaces |
| Foreground duplicate suppression | Done | Works via `isTracking` check |
| Background duplicate suppression | Not possible | OS delivers push natively; app code doesn't execute |
| App-killed Live Activity divergence | Known gap | Deferred to server-side APNs phase |
| Push notification body vs title mismatch | Unknown | Need to check edge function + DB `category_status_flows` for actual body text sent |

### 6. Answer to Final Question

> "When an order status updates while the app is open, does the user see only one clean update, or still multiple signals?"

**If Live Activity is active**: User sees only the Live Activity widget update. Push toast/sound/haptics are suppressed. One clean signal.

**If Live Activity is NOT active** (e.g., non-trackable status, or web): User sees the push notification toast with sound. One signal.

**If app is backgrounded**: Both the OS-delivered push banner AND the Live Activity widget update will appear. Two signals — this cannot be suppressed client-side.

### No Code Changes Needed

All three planned fixes are implemented in the codebase. The remaining gaps are platform-level limitations that require server-side APNs integration (deferred).

