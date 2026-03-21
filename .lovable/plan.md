

# Round 6: 5 Critical Notification Bugs — Client-Side Type Gaps & Sync Holes

The Round 5 DB migration fixed the trigger's INSERT columns correctly. But the client code was written when all notifications used `type: 'order'`. The trigger now inserts `type: 'order_update'` — a value that **no client-side code recognizes**. The moment a real order status change fires in production, these bugs will all surface simultaneously.

---

## Bug 1: `RichNotificationCard` icon shows generic Bell for all order status notifications

**Where:** `src/components/notifications/RichNotificationCard.tsx` lines 11-13

**What happens:** The `getIcon()` switch matches `case 'order':` and `case 'order_status':` — but the DB trigger inserts with `type: 'order_update'`. Every order lifecycle notification (Accepted, Preparing, Ready, Delivered, Completed, Cancelled) falls through to `default: <Bell>`.

**The buyer sees:** Their inbox has a generic grey bell icon next to "✅ Order Accepted!" instead of the branded Package icon. Every order notification looks identical to a system announcement. The inbox feels like a dump of generic alerts rather than a curated order timeline.

**Why this breaks trust:** The buyer subconsciously uses icons to scan their inbox. Package = order. Calendar = booking. Truck = delivery. When all order notifications show Bell, the buyer can't distinguish order updates from system noise at a glance. The inbox feels unfinished.

**Fix:** Add `case 'order_update':` to the `getIcon()` switch, falling through to the same `<Package>` icon. One line.

---

## Bug 2: `resolveNotificationRoute` sends `order_update` taps to `/notifications` instead of the order page

**Where:** `src/lib/notification-routes.ts` lines 21-25

**What happens:** The fallback route resolver handles `case 'order_created':` and `case 'order_status':` — extracting `orderId` from payload and routing to `/orders/{id}`. But `order_update` hits `default:` → returns `/notifications`.

**When this fires:** Push notification tap when the app is closed. The `pushNotificationActionPerformed` handler tries `data?.route` first (which should be set by `process-notification-queue`). But if `route` is missing from the push data for any reason (FCM data field truncation, edge case), the fallback resolver kicks in and routes to `/notifications` instead of the specific order.

**Also fires:** In `NotificationInboxPage` line 21 — if `reference_path` is null on a `user_notifications` row (e.g., edge case from a migration), the fallback resolver routes `order_update` to `/notifications`.

**The buyer sees:** Taps "Order Delivered!" notification → lands on generic notification list instead of their order. They have to manually find and tap their order. The deep-link promise is broken.

**Why this breaks trust:** Push notification taps are a **moment of intent**. The buyer wants to see their order. Landing on the wrong page creates friction at the highest-engagement moment.

**Fix:** Add `case 'order_update':` to the switch, falling through to the same `order_created`/`order_status` handler. One line.

---

## Bug 3: Realtime status change triggers haptic but badge count stays stale for 30 seconds

**Where:** `src/hooks/useBuyerOrderAlerts.ts` line 55

**What happens:** When a realtime `postgres_changes` event arrives for a buyer's order:
1. Haptic fires immediately ✅
2. `['orders']` query invalidated ✅
3. Badge count (`['unread-notifications']`) NOT invalidated ❌
4. Inbox (`['notifications']`) NOT invalidated ❌

Meanwhile, the DB trigger has already enqueued + processed the notification → `user_notifications` has a new unread row. But the client won't know for up to 30 seconds (the polling interval).

**The buyer sees:** Phone vibrates → they glance at the app → badge still shows "3" (not "4") → they open inbox → still 3 notifications → 20 seconds later it jumps to 4. "Did I imagine that vibration?"

**Why this breaks trust:** Haptic feedback creates an expectation of new content. When the visual doesn't match the tactile signal, the buyer doubts the system's reliability. Every haptic-without-badge-update erodes confidence.

**Fix:** Add three query invalidations to `useBuyerOrderAlerts.ts` after the haptic:
```typescript
queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
queryClient.invalidateQueries({ queryKey: ['notifications'] });
queryClient.invalidateQueries({ queryKey: ['active-orders-strip'] });
```

---

## Bug 4: Chat notification says "New message from Someone" — sender name not resolved from profile

**Where:** `src/components/chat/OrderChat.tsx` line 125

**What happens:** 
```typescript
const senderName = user.user_metadata?.name || 'Someone';
```
The `user.user_metadata` object comes from Supabase Auth. Most users signed up with email/password — their `user_metadata.name` is undefined. The fallback is the literal string `"Someone"`.

Meanwhile, the `profiles` table has `full_name` and `username` for every user, populated during onboarding.

**The seller sees:** Push notification: "💬 New message from Someone". They think: "Who is this? Is this spam? Which order is this about?" They have to open the chat to find out.

**The buyer sees (when seller replies):** Same problem — "New message from Someone" instead of the business name.

**Why this breaks trust:** Notifications are the system's voice. When it says "Someone" instead of "Ravi" or "Fresh Bakes", it feels anonymous and impersonal. The seller can't prioritize messages because they all look the same. Chat notifications become noise rather than signal.

**Fix:** Before building the notification, query the sender's profile:
```typescript
const { data: senderProfile } = await supabase
  .from('profiles')
  .select('full_name, username')
  .eq('id', user.id)
  .maybeSingle();
const senderName = senderProfile?.full_name || senderProfile?.username || 'Someone';
```

---

## Bug 5: `is_terminal` stored as JSON boolean in payload but checked as string `'true'` in push handler

**Where:** 
- DB trigger (`fn_enqueue_order_status_notification`) line 145: `'is_terminal', v_is_terminal` — inserts a **boolean** into JSONB
- `process-notification-queue` line 154: `const pushData = { ...(item.payload || {}) }` — spreads JSONB payload into push data object
- FCM/APNs delivery: FCM `data` field only accepts **string** values — all values are stringified
- Client handler (`usePushNotifications.ts`) line 344: `data?.is_terminal === 'true'` — compares against string

**What happens:** The trigger stores `is_terminal: true` (boolean) in JSONB. When `process-notification-queue` spreads it into `pushData`, it becomes `is_terminal: true` (JS boolean). FCM's `data` field auto-coerces to `"true"` (string). So on Android/FCM path, the comparison `=== 'true'` works by accident.

But on the **direct APNs path** (iOS), `sendApnsDirectNotification` puts `data` directly into the APNs payload JSON — NOT as FCM data strings. The APNs payload preserves the original JS boolean. So on iOS, `data?.is_terminal` is `true` (boolean), and `=== 'true'` (string comparison) returns **false**.

**The buyer on iOS sees:** Terminal order push (delivered/completed/cancelled) arrives → the `isTerminalPush` flag is `false` → the async fallback path (`getTerminalStatuses().then(...)`) fires instead of the synchronous dispatch. This means the `order-terminal-push` event dispatches **asynchronously** — after a DB round-trip to fetch terminal statuses. During that delay, the foreground suppression check and LA check run with stale state.

Worse: if `getTerminalStatuses()` cache is cold (first terminal push after app launch), there's a visible flash — the foreground toast fires, THEN the terminal sync fires, causing a double UI update (toast appears → order list refreshes → active strip disappears → toast is stale).

**Why this breaks trust:** The "order delivered" moment should feel instant and clean on iOS. Instead, there's a visible stutter — toast appears, then a beat later the UI reshuffles. It's subtle but makes the app feel laggy at the most emotionally significant moment (delivery confirmation).

**Fix:** In `usePushNotifications.ts`, change the terminal check to handle both types:
```typescript
const isTerminalPush = data?.is_terminal === 'true' || data?.is_terminal === true;
```

---

## Summary

| # | Bug | Who sees it | When it surfaces |
|---|-----|------------|-----------------|
| 1 | Generic Bell icon for all order notifications | Every buyer checking inbox | First order status change post-fix |
| 2 | Push tap routes to `/notifications` instead of order | Buyer tapping order push | When `route` field missing from FCM data |
| 3 | Badge/inbox 30s stale after realtime haptic | Every buyer on every status change | Immediately — gap between haptic and badge |
| 4 | Chat notification says "from Someone" | Every seller/buyer in chat | Every chat message sent |
| 5 | iOS terminal push sync delayed by type mismatch | Every iOS buyer on delivery | Every terminal status push on iOS |

All fixes are surgical: 4 client-side file edits, 0 migrations, 0 edge function changes.

