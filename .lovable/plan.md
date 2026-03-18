

# Blinkit Gap-Fill: End-to-End Implementation Plan

## What We're Filling

| Gap | Blinkit Behavior | Current State | Feasibility |
|-----|-----------------|---------------|-------------|
| 1. Push notification deep-link routing | Tap notification → opens order tracking | Partial — only routes if `data.route` is set, but trigger doesn't set it | Easy fix |
| 2. iOS notification grouping (threadId) | Order notifications grouped per order | No grouping — each notification is standalone | Easy fix |
| 3. Rich push (image) | Notification shows product/seller image | No image support, no Notification Service Extension | Medium — requires NSE in CI |
| 4. Dynamic Island tap → order page | Tapping expanded DI opens order tracking | No `widgetURL` configured in SwiftUI | Easy fix (Swift) |
| 5. Item count in Dynamic Island compact | Shows "3 items" or similar | Only shows ETA or progress circle | Easy fix (Swift + data) |
| 6. APNs push-to-Live-Activity | Widget updates even when app is killed | App-driven only — stops when process dies | Hard — deferred (per memory) |
| 7. GPS-derived progress | Progress bar reflects real distance | Hardcoded per-status values | Medium — needs distance data |

**Gap 6 (APNs push-to-Live-Activity) is explicitly deferred per project strategy.** The remaining 6 gaps are implementable now.

---

## Change 1: Push Notification Deep-Link Routing

**Problem:** The DB trigger builds `reference_path: '/orders/' || NEW.id` and `payload.orderId`, but the push notification data doesn't include a `route` key. The tap handler in `usePushNotifications.ts` only navigates when `data.route` exists (line 362).

**Fix:**
- **`supabase/functions/process-notification-queue/index.ts`** (lines 107-110): When building `pushData`, add `route` from `item.reference_path`:
  ```
  pushData.route = item.reference_path || '';
  ```
- This makes every notification tappable → navigates to the order detail page.

---

## Change 2: iOS Notification Grouping (threadId)

**Problem:** Multiple notifications for the same order appear as separate items on the lock screen instead of being grouped.

**Fix:**
- **`supabase/functions/send-push-notification/index.ts`**: Accept optional `threadId` in the payload. Pass it to APNs as `apns-collapse-id` header and `aps.thread-id`, and to FCM as `android.notification.tag` + `apns.payload.aps.thread-id`.
- **`supabase/functions/process-notification-queue/index.ts`**: Set `threadId: item.payload?.orderId` when invoking send-push, so all notifications for the same order group together.

---

## Change 3: Rich Push Notifications (Image)

**Problem:** No notification images. Blinkit shows seller logos or product thumbnails.

**Approach:** This requires an iOS Notification Service Extension (NSE) to download and attach images before display. The NSE is a separate target in Xcode.

**Fix (3 parts):**

a. **Data pipeline:** Add `notification_image_url` column to `category_status_flows` (nullable). The trigger `fn_enqueue_order_status_notification` includes seller logo URL in the payload. The edge function passes `imageUrl` to `send-push-notification`.

b. **APNs payload:** In `send-push-notification`, set `mutable-content: 1` in `aps` and include `image_url` in the payload root. Set `apns-push-type: alert` (already set).

c. **Native iOS NSE:** Create `native/ios/NotificationServiceExtension.swift` — a standard `UNNotificationServiceExtension` that downloads the image from `userInfo["image_url"]` and attaches it as `UNNotificationAttachment`. Add CI configuration to create the NSE target (similar to widget extension setup).

d. **FCM (Android):** Add `notification.image` field in the FCM payload — Android handles rich images natively without extra code.

---

## Change 4: Dynamic Island Tap → Order Page

**Problem:** Tapping the Dynamic Island or lock screen widget does nothing (no `widgetURL`).

**Fix:**
- **`native/ios/LiveDeliveryAttributes.swift`**: No changes needed (entityId already available).
- **`native/ios/LiveDeliveryWidget.swift`**: Wrap the lock screen view and expanded DI region with `.widgetURL(URL(string: "sociva://orders/\(context.attributes.entityId)"))` so tapping opens the app at the order tracking page.
- The existing `useDeepLinks.ts` already handles `sociva://orders/{id}` → navigates to `/orders/{id}`.

---

## Change 5: Item Count in Dynamic Island

**Problem:** Compact trailing only shows ETA or a progress circle. Blinkit shows item count.

**Fix:**
- **`src/plugins/live-activity/definitions.ts`**: Add `item_count: number | null` to `LiveActivityData`.
- **`native/ios/LiveDeliveryAttributes.swift`**: Add `itemCount: Int?` to `ContentState`.
- **`native/ios/LiveActivityPlugin.swift`**: Read `call.getInt("item_count")` in `buildState`.
- **`native/ios/LiveDeliveryWidget.swift`**: In `compactTrailing`, when no ETA is available, show item count (e.g., "3 items") instead of the progress circle. In `DynamicIslandExpandedRegion(.leading)`, show item count below seller name.
- **`src/services/liveActivityMapper.ts`**: Accept `itemCount` parameter in `buildLiveActivityData`.
- **`src/hooks/useLiveActivityOrchestrator.ts`** + **`src/services/liveActivitySync.ts`**: Fetch `order_items` count when building activity data. Use `supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId)`.

---

## Change 7: Distance-Derived Progress

**Problem:** Progress is hardcoded per status. When `distance_meters` is available, we should use it for more accurate progress.

**Fix:**
- **`src/services/liveActivityMapper.ts`**: When status is `on_the_way`/`picked_up`/`en_route` and `distance_meters` is available, compute progress as `max(0.5, 1 - (distance_km / initial_distance_km))`. Since we don't have `initial_distance`, use a heuristic: cap at a reasonable max (e.g., 10km) and interpolate. Fallback to hardcoded value when no distance data.

---

## Implementation Order

1. **Change 1** (deep-link routing) — edge function only, instant impact
2. **Change 2** (threadId grouping) — edge function only
3. **Change 4** (DI tap) — Swift only, no data changes
4. **Change 5** (item count) — data pipeline + Swift + TS
5. **Change 7** (distance progress) — TS mapper only
6. **Change 3** (rich push images) — migration + edge fn + NSE + CI (most complex)

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/process-notification-queue/index.ts` | Add `route` and `threadId` to push data |
| `supabase/functions/send-push-notification/index.ts` | Accept `threadId`, `imageUrl`. Add `thread-id`, `mutable-content`, `image` to APNs/FCM payloads |
| `native/ios/LiveDeliveryWidget.swift` | Add `.widgetURL()`, show item count in compact/expanded |
| `native/ios/LiveDeliveryAttributes.swift` | Add `itemCount: Int?` to ContentState |
| `native/ios/LiveActivityPlugin.swift` | Read `item_count` in `buildState` |
| `native/ios/NotificationServiceExtension.swift` | New file — NSE for image attachment |
| `src/plugins/live-activity/definitions.ts` | Add `item_count` field |
| `src/services/liveActivityMapper.ts` | Accept item count, improve distance-based progress |
| `src/hooks/useLiveActivityOrchestrator.ts` | Fetch item count alongside delivery data |
| `src/services/liveActivitySync.ts` | Fetch item count in sync |
| New migration | Add `notification_image_url` to `category_status_flows`, update trigger to include seller logo |

