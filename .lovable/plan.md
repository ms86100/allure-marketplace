

# Round 20: 5 Critical Bugs — In-App Notification System

## Bug 1: Proximity notifications spam the inbox — 30-second dedup window is too short for repeated location updates

**Where:** `supabase/functions/update-delivery-location/index.ts` lines 478-536

**What happens:** The proximity dedup checks `notification_queue` for the same type within the last 30 seconds. But the `update-delivery-location` function is called every 5 seconds during active delivery. If the driver oscillates around the 200m boundary (common in congested Indian neighborhoods), the dedup window lets through a new "Driver arriving now!" every 31 seconds. Real data confirms: order `863f01f5` has **3** `delivery_proximity_imminent` AND **3** `delivery_proximity` notifications. Order `8085b506` has 3 of each too. The inbox becomes a wall of identical red "Driver arriving now!" cards (visible in screenshots).

**Why critical:** The buyer's inbox is flooded with identical urgent notifications. The red cards with "View Tracking" buttons create alarm fatigue. A buyer scrolling through 6 identical "Driver arriving now!" cards loses trust in the system's intelligence.

**Impact:** `update-delivery-location` edge function (dedup window), `NotificationInboxPage` (display)
**Risks:** (1) Increasing the dedup window too much (e.g., 10 min) means a genuinely new approach after a failed attempt won't notify. Safe window: 2-3 minutes per order per type. (2) Also need to deduplicate at display level in case historical spam already exists.

**Fix:**
- Edge function: Change dedup window from 30s to **3 minutes** for proximity notifications
- Inbox page: Collapse consecutive notifications of the same type+order into a single card showing the latest one

---

## Bug 2: Booking reminder `reference_path` is `/orders` (generic) instead of `/orders/{orderId}` — action buttons lead nowhere useful

**Where:** `supabase/functions/send-booking-reminders/index.ts` line 100, `RichNotificationCard.tsx` line 55

**What happens:** The booking reminder code at line 100 does: `const buyerPath = booking.order_id ? '/orders/${booking.order_id}' : '/orders'`. Looking at the DB data, ALL booking reminders have `reference_path: /orders` (not `/orders/{uuid}`). This means `booking.order_id` is null/undefined for these bookings. The "Get Ready", "Open Now", and "View Details" buttons all navigate to the generic orders list — not the specific booking/order. The buyer taps "Open Now" expecting to see their appointment details but lands on a generic order history page.

**Why critical:** The most urgent notification type (10-minute reminder with red card) has a broken CTA. "Open Now" implies immediate relevance but drops the user on a generic list. This breaks the trust contract between urgency and action.

**Impact:** `send-booking-reminders` edge function, `RichNotificationCard` navigation
**Risks:** (1) If `order_id` is genuinely null on the booking record, we need a fallback route like `/bookings/{bookingId}`. (2) Need to check if a `/bookings/:id` route even exists.

**Fix:**
- In `send-booking-reminders`: Use `booking.id` (the booking UUID) as fallback: `const buyerPath = booking.order_id ? '/orders/${booking.order_id}' : '/orders'` — but also include `bookingId` in the reference_path as a query param so the order page can scroll to it
- In `resolveNotificationRoute`: Add cases for `booking_reminder_*` types that resolve to `/orders/{orderId}` using `payload.orderId`

---

## Bug 3: `payload` exposes internal system data to the client — `driver_name`, `distance`, `eta`, `vehicle_type`, `workflow_status`

**Where:** `useNotifications.ts` line 28: `select('*')` returns the full `payload` JSONB column, which is rendered in the inbox and accessible via browser dev tools

**What happens:** The `payload` column contains operational metadata never intended for buyer display: `driver_name: "Fresh Mart Express"`, `distance: 182`, `eta: 1`, `vehicle_type: null`, `workflow_status: "at_doorstep"`, `bookingId: UUID`, `entity_id: UUID`. The `select('*')` query returns everything. While the UI doesn't explicitly render these fields, they're in the React Query cache and visible in browser DevTools → Network tab. The `driver_name` field is the seller's business name (used as rider name in self-delivery), leaking seller identity context.

**Why critical:** Information exposure. Internal UUIDs (`entity_id`, `bookingId`), operational distances, and rider identity are accessible to any authenticated user via their browser. This is a data hygiene issue for production.

**Impact:** `useNotifications.ts` query, `useLatestActionNotification` query
**Risks:** (1) Changing `select('*')` to explicit columns may break components that read from payload (e.g., `RichNotificationCard` reads `payload.action`, `payload.reference_path`). Must include `payload` but can't strip internal fields without a DB view or RPC. (2) Simpler approach: only select needed fields from payload on the client.

**Fix:**
- Change `select('*')` to `select('id, title, body, type, reference_path, is_read, created_at, payload')` — this is equivalent but explicit (no `society_id`, `queue_item_id`, `reference_id` leakage)
- For payload sanitization: Create a DB view `user_notifications_safe` that strips internal fields from payload, or accept the current exposure as low-risk for MVP

---

## Bug 4: "Dismiss" on `RichNotificationCard` only marks as read — notification stays visible in inbox with action buttons

**Where:** `RichNotificationCard.tsx` line 61-64, `NotificationInboxPage.tsx` line 60

**What happens:** The "Dismiss" button calls `markRead.mutate(notification.id)` and `onDismiss?.()`. In the inbox page (line 60), `RichNotificationCard` is rendered **without** passing `onDismiss`. So `onDismiss` is undefined. The "Dismiss" button only marks the notification as read. But the card stays in the list because `useNotifications` returns ALL notifications (read + unread). The card loses its unread styling but the prominent green/red action buttons ("View Tracking", "Get Ready", "Open Now") remain fully visible and clickable. For completed orders, "View Tracking" buttons on proximity notifications lead to a delivered order detail page with no active tracking — confusing.

**Why critical:** A buyer taps "Dismiss" expecting the card to disappear. It doesn't. The action button remains. For completed orders, stale "View Tracking" CTAs on red urgency cards create a broken, zombie-like feel in the inbox.

**Impact:** `RichNotificationCard`, `NotificationInboxPage`
**Risks:** (1) Adding true dismissal (hiding) requires local state or a `dismissed_at` column. Simpler: hide action buttons when `is_read = true`. (2) Alternatively, filter out read rich notifications from the rich card rendering path — show them as plain cards instead.

**Fix:**
- In `NotificationInboxPage`: When rendering `RichNotificationCard`, check `n.is_read` — if read, render as a plain card (no action buttons) instead of a rich card
- This is a 1-line condition change: `if (hasAction && !n.is_read)` instead of `if (hasAction)`

---

## Bug 5: Delivery proximity notifications for completed orders still show as urgent rich cards — stale red alerts in inbox

**Where:** `NotificationInboxPage.tsx` lines 55-61, `useLatestActionNotification` lines 55-96

**What happens:** The `useLatestActionNotification` hook correctly auto-marks stale delivery notifications as read when the order reaches a terminal status. But this only runs for the HOME BANNER. The INBOX PAGE (`useNotifications`) has no such cleanup. Delivery proximity notifications for completed orders retain `payload.action = "View Tracking"` so they render as `RichNotificationCard` with red urgency styling and "View Tracking" buttons — even though the order was completed hours/days ago. The DB confirms: order `863f01f5` is `completed` but has 6 proximity notifications, all with action buttons.

**Why critical:** The inbox is dominated by stale urgent-looking red and green cards for orders that finished long ago. This makes the notification inbox feel unreliable and noisy — the opposite of trustworthy.

**Impact:** `NotificationInboxPage`, potentially a DB trigger or batch cleanup
**Risks:** (1) Adding order-status awareness to the inbox query increases complexity. (2) Simpler: use the same terminal-order cleanup logic from `useLatestActionNotification` but run it once when the inbox loads.

**Fix:**
- Extract the terminal-order cleanup logic from `useLatestActionNotification` into a shared utility
- Call it in `useNotifications` on initial fetch: batch-check delivery notification order IDs against terminal statuses, auto-mark stale ones as read
- OR simpler: in `NotificationInboxPage`, filter delivery types for completed orders out of the rich card rendering (combine with Bug 4 fix: `if (hasAction && !n.is_read)`)

---

## Summary

| # | Bug | Severity | Root Cause |
|---|-----|----------|-----------|
| 1 | Proximity notification spam (3+ per order per type) | **CRITICAL** | 30s dedup window too short |
| 2 | Booking reminder CTAs lead to generic `/orders` | **HIGH** | `order_id` null on bookings |
| 3 | Payload exposes internal data (`driver_name`, distances, UUIDs) | **MEDIUM** | `select('*')` on notifications |
| 4 | "Dismiss" doesn't hide card — action buttons persist | **HIGH** | No `onDismiss` + no read-state gate |
| 5 | Stale red urgency cards for completed orders | **HIGH** | No terminal-order cleanup in inbox |

## Files to Edit

- `supabase/functions/update-delivery-location/index.ts` — Bug 1: increase proximity dedup window from 30s to 3min
- `supabase/functions/send-booking-reminders/index.ts` — Bug 2: improve reference_path resolution for bookings
- `src/lib/notification-routes.ts` — Bug 2: add `booking_reminder_*` route resolution
- `src/hooks/queries/useNotifications.ts` — Bug 3: explicit column select; Bug 5: add terminal-order cleanup to inbox query
- `src/pages/NotificationInboxPage.tsx` — Bugs 4+5: gate rich card rendering on `!n.is_read`, collapse duplicate proximity notifications

