

# Round 5 (Revised): 5 Critical Notification Bugs — Going to Production

## Bug 1: ORDER STATUS TRIGGER IS COMPLETELY BROKEN — Zero buyer notifications for order lifecycle

**Severity: CATASTROPHIC — the entire notification system's core is non-functional**

**What happens:** The `fn_enqueue_order_status_notification()` trigger fires on every `orders.status` change. It builds the correct title/body from `category_status_flows`, then attempts to INSERT into `notification_queue` using columns that **do not exist on the table**:

```sql
-- Trigger inserts into these columns:
INSERT INTO notification_queue (user_id, title, body, type, reference_id, reference_type, priority, data, silent)
```

**Actual table columns:** `id, user_id, title, body, type, reference_path, payload, status, created_at, processed_at, next_retry_at, retry_count, last_error`

**Missing columns:** `reference_id`, `reference_type`, `priority`, `data`, `silent` — none of these exist. The INSERT fails every time. The `EXCEPTION WHEN OTHERS THEN RETURN NEW` handler silently swallows the error, so the order update succeeds but **no notification is ever enqueued**.

**Proof from production data:**
- `notification_queue` has **zero** rows with `type = 'order_update'` in the last 7 days
- `user_notifications` has **zero** entries titled "Order Accepted", "Being Prepared", "Order Ready", "On The Way", or "Order Delivered" — ever
- The only notifications that work are client-side inserts (booking reminders, delivery proximity, settlements, seller approvals)

**Who is affected:**
- **Every buyer** — never receives push notifications for: accepted, preparing, ready, picked_up, on_the_way, delivered, completed, cancelled
- **Every seller** — never receives push notification for new orders placed via the trigger (only works because `useCartPage.ts` calls `process-notification-queue` after order creation, but that just processes existing queue items — of which there are none from the trigger)

Wait — sellers DO get "New Order Received!" (101 count in DB). That's because the client-side code in `useCartPage.ts` invokes `process-notification-queue` after placing an order, and the `placed` status change fires the trigger... but the trigger FAILS. So how are sellers getting notified?

Looking more carefully: the seller "New Order Received!" notifications come from **other client-side paths** (ServiceBookingFlow, ProductEnquirySheet) that insert directly into `notification_queue` with correct column names — not from the trigger.

**Fix (DB migration):** Rewrite the INSERT statements in `fn_enqueue_order_status_notification` to use the correct column names:
- `reference_id` → store in `payload` jsonb as `orderId` (already there via the `data` field)
- `reference_type` → drop (not needed)  
- `data` → `payload`
- `silent` → store in `payload` as `silent_push`
- `priority` → drop (not a column)
- Add `reference_path` with the correct order URL (`/orders/` + order_id)
- Also fix the dedup query which uses `reference_id` (nonexistent) — use `payload->>'orderId'` or just `title` + `user_id` + time window

This is a single SQL migration that rewrites the function body.

---

## Bug 2: Chat messages never create a notification_queue entry — invoking process-notification-queue does nothing

**What happens:** In `OrderChat.tsx` line 122, after a successful message insert:
```typescript
supabase.functions.invoke('process-notification-queue').catch(() => {});
```

This invokes the edge function, which calls `claim_notification_queue(batch_size: 50)` — atomically claims pending items. But **no code anywhere inserts a chat notification into `notification_queue`**. There is no trigger on `chat_messages`. The invoke just processes whatever happens to be pending (usually nothing chat-related).

**Who is confused:**
- **Buyer** sends "I'm running late" → seller never gets a push notification
- **Seller** replies "No problem" → buyer never gets a push notification
- Both parties believe the chat system notifies the other person. It doesn't.

**Fix:** Before invoking `process-notification-queue` in `OrderChat.tsx`, insert a row into `notification_queue` with the correct columns (`user_id: otherUserId`, `title: "New message from {senderName}"`, `body: message preview`, `type: 'chat'`, `reference_path: /orders/{orderId}`, `payload: { orderId, type: 'chat' }`). Then the existing invoke will pick it up and deliver it.

---

## Bug 3: "Sounds" preference toggle has no effect — beeps always play regardless of setting

**What happens:** The NotificationsPage renders a "Notification Sounds" toggle that saves `sounds: true/false` to `notification_preferences`. But `usePushNotifications.ts` never reads this preference. The Web Audio API beep at lines 387-404 fires unconditionally for every foreground push notification. Similarly, `useBuyerOrderAlerts.ts` calls `hapticNotification()` without checking the sounds preference.

**Who is confused:**
- **Buyer** toggles "Notification Sounds" OFF → still hears beeps on every foreground push → thinks the toggle is broken → loses trust in all preference controls ("If sounds doesn't work, do the other toggles work either?")

**Fix:** In `usePushNotifications.ts`, before playing the Web Audio beep, query the user's `notification_preferences.sounds` setting (can be cached in a ref, refreshed on mount/resume). Skip the `AudioContext` block if `sounds === false`. Haptic feedback should remain (it's tactile, not audio) — only the audible beep should be gated.

---

## Bug 4: App resume doesn't refresh notification inbox or home banner — stale data until next 30s poll

**What happens:** The `useAppLifecycle` `appStateChange` handler invalidates many query keys but is **missing** `['notifications']` and `['latest-action-notification']`. When a buyer backgrounds the app, receives push notifications, then returns:

- Badge count refreshes (✅ `unread-notifications` is invalidated)
- Order list refreshes (✅ `orders` is invalidated)
- Notification inbox does NOT refresh (❌ `notifications` missing)
- Home action banner does NOT refresh (❌ `latest-action-notification` missing)

The inbox and banner only update on the next 30-second poll cycle.

**Who is confused:**
- **Buyer** opens app after getting a push → badge shows "5" → opens inbox → sees 3 old notifications → waits 30 seconds → list jumps to 5. Same mismatch as Round 3 Bug 2, but triggered by app resume instead of staying on the page.

**Fix:** Add two lines to the `appStateChange` handler in `useAppLifecycle.ts`:
```typescript
queryClient.invalidateQueries({ queryKey: ['notifications'] });
queryClient.invalidateQueries({ queryKey: ['latest-action-notification'] });
```

---

## Bug 5: `process-notification-queue` preference check uses wrong type keys — never matches order notifications

**What happens:** The edge function at lines 80-85:
```typescript
const notifType = item.type || item.payload?.type || "order";
if ((notifType === "order" || notifType === "order_status") && userPrefs.orders === false) prefAllowed = false;
```

The trigger (once fixed) will insert with `type: 'order_update'`. Client-side inserts use `type: 'order'`. The preference check matches `"order"` and `"order_status"` but NOT `"order_update"`. So even when the trigger is fixed, if a buyer turns off order notifications, `order_update` type items will **bypass the preference check** and still deliver push notifications.

Similarly, the `type` field across the system is inconsistent:
- Trigger uses: `'order_update'`
- Client inserts use: `'order'`, `'settlement'`, `'chat'`, `'general'`
- Preference check matches: `'order'`, `'order_status'` (not `'order_update'`)

**Who is confused:**
- **Buyer** turns off "Order Updates" → still gets order status push notifications → "What's the point of these toggles?"

**Fix:** In `process-notification-queue`, expand the order type match to include `'order_update'`:
```typescript
if ((notifType === "order" || notifType === "order_status" || notifType === "order_update") && userPrefs.orders === false) prefAllowed = false;
```

---

## Summary

| # | Bug | Impact | Scope |
|---|-----|--------|-------|
| 1 | **Trigger uses nonexistent columns** — zero order status notifications ever delivered | Every buyer/seller since trigger was last updated | DB migration |
| 2 | **Chat has no queue entry** — invoke processes empty queue | Every chat message between buyer/seller | Client-side |
| 3 | **Sounds toggle ignored** — beeps always play | Every buyer who disabled sounds | Client-side |
| 4 | **App resume skips inbox/banner refresh** | Every buyer returning from background | Client-side |
| 5 | **Preference type mismatch** — `order_update` bypasses opt-out | Every buyer who disabled order notifications | Edge function |

**Bug 1 is the single most critical issue in the entire system.** It means the core value proposition of the notification system — "we'll tell you when your order status changes" — has never worked via the DB trigger path. All fixes are surgical: 1 DB migration, 1 edge function update, 2 client-side changes.

