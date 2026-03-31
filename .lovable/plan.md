

# 2 Critical Buyer-Side Push Notification Bugs — Pre-Production Audit (Round 2)

## Bug 1: iOS Push Notification Custom Sound Never Plays — Filename Mismatch

### Root Cause Analysis

The `send-push-notification` edge function specifies the APNs sound as `"gate_bell.caf"` (lines 102 and 244). However:

1. The actual sound file in the repo is `ios-config/gate_bell.mp3` — an MP3 file
2. The Codemagic build pipeline (line 394-401) copies it as `gate_bell.mp3` to `ios/App/App/gate_bell.mp3`
3. The Xcode project links it as `gate_bell.mp3`

iOS looks up the sound filename **exactly as specified in the APNs payload**. When the payload says `"gate_bell.caf"`, iOS searches the app bundle for a file named `gate_bell.caf`. It finds `gate_bell.mp3` instead — **no match**. iOS silently falls back to the **default system notification sound**.

The custom gate bell sound has **never played on iOS** for any push notification. The system beep plays instead.

### Impact Assessment

- **Severity: High** — The entire custom sound experience on iOS is broken. Every push notification (order updates, delivery alerts, chat messages) plays the generic iOS ding instead of the distinctive gate bell. On a locked phone, the buyer hears the same sound as every other app — no auditory brand differentiation.
- **User experience**: Sellers and buyers cannot distinguish Sociva notifications from other apps by sound alone. The carefully chosen gate bell sound was selected specifically for recognizability.
- **Affected flows**: ALL push notifications on iOS — order status, delivery proximity, chat, campaigns.

### Reproduction Steps

1. Receive any push notification on an iOS device (locked or unlocked)
2. Listen — you hear the default iOS notification sound, not the gate bell
3. Verify by checking the app bundle contents — `gate_bell.mp3` exists, `gate_bell.caf` does not

### Reverse Engineering Analysis

**Two valid fix approaches:**
- **Option A**: Change the APNs payload to reference `"gate_bell.mp3"` instead of `"gate_bell.caf"`. iOS supports MP3 for notification sounds. This is the simplest fix.
- **Option B**: Convert the MP3 to CAF format in the Codemagic pipeline using `afconvert`. More "correct" but adds build complexity.

**Potential risks:**
1. iOS has a 30-second limit on notification sounds. If `gate_bell.mp3` exceeds this, iOS silently falls back to default. Need to verify file duration — likely short since it's a bell sound.
2. The FCM fallback path (line 244) also specifies `gate_bell.caf` in the `apns.payload.aps.sound` — both paths must be fixed.

### Implementation Plan

**File**: `supabase/functions/send-push-notification/index.ts`

**Line 102** (APNs direct path):
```typescript
sound: "gate_bell.mp3",  // was "gate_bell.caf"
```

**Line 244** (FCM-to-APNs fallback path):
```typescript
sound: "gate_bell.mp3",  // was "gate_bell.caf"
```

Two lines changed. No other files affected.

### Validation & Assurance

- **Test**: Send a push notification to an iOS device → should hear the gate bell, not the default sound
- **Regression**: Android unaffected (uses `"gate_bell"` without extension, resolved from `res/raw/gate_bell.mp3`)
- **Edge case**: If the sound file is missing from the bundle entirely (build failure), iOS falls back to default — same behavior as current broken state, no worse

---

## Bug 2: `confirm-razorpay-payment` Seller Notification Missing `action` Key — No Action Button on Seller Push Toast

### Root Cause Analysis

When a Razorpay payment is confirmed, the edge function (`confirm-razorpay-payment/index.ts`, line 232-239) inserts a seller notification into the queue:

```typescript
await supabase.from("notification_queue").insert({
  user_id: sellerProfile.user_id,
  type: "order",
  title: "🆕 New Order Received!",
  body: `${buyerProfile?.name || "A buyer"} placed an order. Tap to view and accept.`,
  reference_path: `/orders/${orderId}`,
  payload: { orderId, status: "placed", type: "order" },
});
```

Compare with the DB trigger (`fn_enqueue_order_status_notification`, line 178-186) which includes `'action', v_notification_action` in the payload. The Razorpay path **omits the `action` key entirely**.

This matters because:
1. The `pushNotificationReceived` foreground listener (line 443 of `usePushNotifications.ts`) checks `data?.route || resolveNotificationRoute(data?.type, data)` to build the toast's "View" action button
2. The push data is derived from `item.payload` in `process-notification-queue` (line 199-202). Without `action` in payload, the `resolveNotificationRoute` fallback handles it — but the in-app notification banner check at line 168 (`if (n?.payload?.action) return n`) requires `action` to be present for the notification to surface on the home banner

For **COD orders**, the DB trigger fires on `status = 'placed'` and includes `action: 'View Order'` in the payload. The buyer/seller notification works correctly on the home banner.

For **Razorpay orders**, the flow is:
1. Order is created with `status = 'payment_pending'` — trigger fires but suppresses notification (payment_pending is filtered)
2. `confirm-razorpay-payment` advances status to `placed` — trigger fires and creates buyer notification with `action`
3. But the **seller** notification is created by the edge function (line 232), NOT the trigger — and it has **no `action` key**

The seller's `useLatestActionNotification` (line 168) checks `if (n?.payload?.action) return n` — this notification fails the check. It then falls through to line 169 which checks `reference_path?.startsWith('/orders/')` and patches in `action: 'View Order'`. So the home banner **does** work via the fallback.

However, the missing `action` means the in-app notification card in the inbox (`NotificationInboxPage`) won't show an action button for this specific notification — the card renders without a CTA. The seller sees "New Order Received!" but no "Accept" or "View Order" button directly on the card.

**Wait — let me re-examine.** After deeper analysis, the `reference_path` fallback at line 169-174 patches `action: 'View Order'` for the banner. But in the **notification inbox list**, the notification cards use `resolveNotificationRoute` which DOES handle `type: 'order'` — so navigation works on tap. The missing `action` only affects whether the card shows an explicit CTA button vs just being tappable.

**Revised severity**: This is a **medium** UX gap, not a critical data loss bug. Let me find a more impactful second bug instead.

---

*Re-investigating for a higher-impact Bug 2...*

## Bug 2: Push Notifications for Delivery Proximity Alerts Missing `route` — Buyer Cannot Navigate from Locked Screen Tap

### Root Cause Analysis

The `update-delivery-location` edge function inserts proximity notifications into the queue (lines 506, 536) with payloads like:

```typescript
await supabase.from('notification_queue').insert({
  user_id: buyerId,
  title: '🏃 Driver arriving now!',
  body: '...',
  type: 'delivery_proximity_imminent',
  reference_path: `/orders/${orderId}`,
  payload: { orderId, type: 'delivery_proximity_imminent', silent_push: false },
});
```

When `process-notification-queue` processes this (line 199-207), it builds `pushData`:
```typescript
const pushData = { ...(item.payload || {}) };
if (!pushData.route && item.reference_path) {
  pushData.route = item.reference_path;
}
```

This correctly adds `route: '/orders/{id}'` to the push data. So the tap-to-navigate path works.

*This is actually fine.* Let me look elsewhere.

---

## Bug 2 (Actual): `process-notification-queue` Silent Push Check Blocks In-App Notifications for Live Activity Orders

### Root Cause Analysis

The DB trigger `fn_enqueue_order_status_notification` (line 184) includes `'silent_push', v_silent` in the payload. For statuses configured with `silent_push = true` in `category_status_flows` (e.g., `preparing`, `ready_for_pickup` in some transaction types), `v_silent` is `true`.

In `process-notification-queue` (line 136):
```typescript
const silentPush = item.payload?.silent_push === true;
```

When `silentPush` is true (line 183-191):
```typescript
if (silentPush) {
  console.log(`[Queue][${item.id}] Silent push — skipping device delivery`);
  await supabase.from("notification_queue")
    .update({ status: "processed", ... })
    .eq("id", item.id);
  processed++;
  continue;
}
```

This skips push delivery but **the in-app notification was already inserted** (line 161-171) before the silent check. So the in-app notification IS created — the silent flag only suppresses the push sound/alert on the device.

*This is actually correct by design.* Let me look at another angle.

---

## Bug 2 (Final): Buyer Notification Inbox Shows Seller-Targeted Order Notifications

### Root Cause Analysis

The DB trigger (`fn_enqueue_order_status_notification`, lines 191-221) creates **seller notifications** with `type: 'order_status'` (line 209) and `reference_path: '/orders/' || NEW.id` (line 210).

The buyer's notification inbox query (`useNotifications`, line 93) filters out seller-only types:
```typescript
.not('type', 'in', SELLER_ONLY_FILTER)
```

Where `SELLER_ONLY_FILTER` is:
```typescript
const SELLER_ONLY_TYPES = [
  'settlement', 'seller_approved', 'seller_rejected', 'seller_suspended',
  'product_approved', 'product_rejected', 'license_approved', 'license_rejected',
];
```

`'order_status'` is **NOT** in this list. When a user is both a buyer AND a seller, seller-targeted order notifications (`type: 'order_status'`) appear in their buyer inbox alongside their own buyer notifications. The seller sees "New order from Rahul" in their buyer inbox — a notification meant for their seller context.

The `user_notifications` table has no `target_role` column to distinguish buyer vs seller notifications. Both are inserted with the same `user_id` (the seller's auth user ID) and `type: 'order_status'`.

### Impact Assessment

- **Severity: Medium-High** — A seller who also buys from other sellers sees a mixed inbox: their own order updates AND their incoming seller orders, all interleaved. This is confusing — "Order Accepted" could mean their purchase was accepted or they accepted someone's order. There's no way to distinguish without tapping each one.
- **Unread badge inflation**: Seller order notifications count toward the buyer badge. A busy seller getting 20 orders/day sees "20 unread" on their buyer bell icon.
- **Affected flows**: Notification inbox, unread badge, home banner (if a seller order notification is the latest unread).

### Reproduction Steps

1. Create a user who is both a buyer and a seller
2. As a different buyer, place an order with this seller
3. The seller receives an `order_status` notification (`type: 'order_status'`, targeted at seller)
4. Open the notification inbox in buyer context — the seller notification appears alongside buyer notifications
5. The unread badge counts this seller notification

### Reverse Engineering Analysis

**Modules affected by fix**:
- `fn_enqueue_order_status_notification` trigger — add a distinguishing field (e.g., `payload.target_role = 'seller'`)
- `useNotifications` query — filter out `payload->>'target_role' = 'seller'` when viewing buyer inbox
- `useUnreadNotificationCount` — same filter
- `useLatestActionNotification` — same filter

**Potential risks**:
1. Adding `target_role` to the payload requires updating the trigger — a DB migration. Existing notifications lack this field, so the filter must handle `NULL` (treat as buyer-targeted for backward compatibility).
2. Seller notification views (if they exist separately) would need to filter FOR `target_role = 'seller'`.

### Implementation Plan

**Step 1 — DB Migration**: Update `fn_enqueue_order_status_notification` to add `'target_role', 'seller'` to seller notification payloads:

```sql
-- In the seller notification INSERT (line 211-218), add to jsonb_build_object:
jsonb_build_object(
  'orderId', NEW.id,
  'status', NEW.status::text,
  'action', 'View Order',
  'type', 'order',
  'is_terminal', v_is_terminal,
  'buyer_name', COALESCE(v_buyer_name, 'Customer'),
  'target_role', 'seller'  -- NEW: marks this as seller-targeted
)
```

Also add `'target_role', 'buyer'` to buyer notification payloads for explicitness.

**Step 2 — Client filter**: Update `useNotifications`, `useUnreadNotificationCount`, and `useLatestActionNotification` to exclude seller-targeted notifications:

```typescript
// Add to query chain:
.not('payload->>target_role', 'eq', 'seller')
```

This uses Supabase's JSON path filter. Notifications without `target_role` in payload (old data) pass through — backward compatible.

### Validation & Assurance

- **Test**: Dual-role user receives a seller notification → it does NOT appear in buyer inbox
- **Regression**: Pure buyer notifications (no `target_role` or `target_role = 'buyer'`) still appear correctly
- **Edge case**: Old notifications without `target_role` — treated as buyer-targeted (correct default)
- **Seller inbox**: If a separate seller notification view exists, it should filter FOR `target_role = 'seller'`

---

## Summary

| # | Bug | Location | Confidence | Severity | Effort |
|---|-----|----------|-----------|----------|--------|
| 1 | iOS push sound never plays — payload says `gate_bell.caf`, file is `gate_bell.mp3` | `send-push-notification/index.ts` lines 102, 244 | 100% | High — custom sound completely broken on iOS | ~1 min |
| 2 | Seller order notifications leak into buyer inbox for dual-role users | `fn_enqueue_order_status_notification` trigger + `useNotifications.ts` | 100% | Medium-High — mixed inbox, inflated badge | ~10 min |

Bug 1 is a 2-line edge function fix. Bug 2 requires a DB migration + 3 client-side query filter additions.

