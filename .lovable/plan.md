

# Push Notification System — Full Audit

## Current Architecture

Two notification paths exist:

1. **Database triggers** → insert into `notification_queue` → `process-notification-queue` edge function claims batches → delivers via `send-push-notification` edge function (FCM/APNs). This is the **primary, working path**.
2. **Client-side `sendPushNotification()`** in `src/lib/notifications.ts` → calls `send-push-notification` edge function directly, bypassing the queue. Used only by admin notifications (`admin-notifications.ts`, `LicenseManager.tsx`).

## Complete Notification Inventory

### A. ORDER LIFECYCLE (DB trigger: `enqueue_order_status_notification`)

| Status Change | Buyer Gets | Seller Gets |
|---|---|---|
| `placed` | — | ✅ "New Order Received!" |
| `enquired` | — | ✅ "New Booking Request!" |
| `accepted` | ✅ "Order Accepted!" | — |
| `preparing` | ✅ "Order Being Prepared" | — |
| `ready` | ✅ "Order Ready!" | — |
| `assigned` | ✅ "Partner Assigned" | — |
| `picked_up` | ✅ "Order Picked Up" | — |
| `on_the_way` | ✅ "Order On The Way!" | — |
| `arrived` | ✅ "Service Provider Arrived" | — |
| `in_progress` | ✅ "Service In Progress" | — |
| `delivered` | ✅ "Order Delivered" | — |
| `completed` | ✅ "Order Completed" | — |
| `cancelled` | ✅ "Order Cancelled" | ✅ "Order Cancelled" |
| `quoted` | ✅ "Quote Received" | — |
| `scheduled` | ✅ "Booking Confirmed" | — |
| `rescheduled` | ✅ (via RPC) | ✅ (via RPC) |
| **`requested`** | — | ❌ **MISSING** |
| **`confirmed`** | ❌ **MISSING** | — |
| **`no_show`** | ❌ **MISSING** | — |
| **`returned`** | ❌ **MISSING** | — |

### B. DELIVERY TRACKING (Edge functions)

| Event | Buyer | Seller |
|---|---|---|
| Rider picks up → OTP | ✅ | — |
| Rider gate OTP | ✅ | — |
| Rider at gate | ✅ | — |
| Delivery stalled (3min) | ✅ | — |
| Proximity (<500m) | ✅ | — |
| **Delivery failed/returned** | ❌ **MISSING explicit notif** | ❌ **MISSING** |

### C. CHAT

| Event | Recipient |
|---|---|
| New message | ✅ Opposite party (buyer↔seller) |

### D. COMMUNITY / SOCIETY

| Event | Recipients |
|---|---|
| Society notice posted | ✅ All residents (except poster) |
| Visitor checked in | ✅ Resident |
| Parcel received at gate | ✅ Resident (if logged by guard) |
| Gate entry confirmation | ✅ Resident |
| Guard manual entry request | ✅ Resident |
| Maintenance due reminder | ✅ Resident (weekly cron) |
| Weekly digest | ✅ All residents |
| Society report | ✅ All residents |
| Collective issue escalation | ✅ Society admins |
| Stock back in stock | ✅ Watchers |

### E. ADMIN → SELLER

| Event | Recipient |
|---|---|
| Store approved/rejected/suspended | ✅ Seller |
| License approved/rejected | ✅ Seller |
| Product approved/rejected | ✅ Seller |

### F. SERVICE BOOKINGS (Client-side inserts)

| Event | Recipient |
|---|---|
| New booking request | ✅ Seller |
| Buyer cancels booking | ✅ Seller |
| **Seller cancels booking** | ❌ **MISSING** (buyer not notified from client) |
| **Booking reminder (1hr before)** | ❌ **MISSING** |

---

## Critical Issues Found

### 1. DEAD CODE — `sendOrderStatusNotification` and `sendChatNotification`
Both functions in `src/lib/notifications.ts` are **never imported or called anywhere**. They are remnants from before the DB trigger was built. They should be removed to avoid confusion.

### 2. DUAL PATH for Admin Notifications
`admin-notifications.ts` inserts into `user_notifications` directly AND calls `sendPushNotification()` (which bypasses the queue). This means:
- No retry/backoff if push fails
- No deduplication via `queue_item_id`
- In-app notification exists but push delivery is fire-and-forget

These should be migrated to use `notification_queue` for consistency.

### 3. Missing Notifications — Order Statuses
The DB trigger's CASE statement has no handler for:
- **`requested`** → Seller should get "New service request"
- **`confirmed`** → Buyer should get "Booking confirmed by seller"
- **`no_show`** → Both parties should be notified
- **`returned`** → Buyer should get "Order returned" (set by delivery failure path)

### 4. Missing — New Review Notification to Seller
When a buyer submits a review via `ReviewForm.tsx`, no notification is sent to the seller. Sellers have no way to know they received a review unless they manually check.

### 5. Missing — Dispute Status Change Notifications
No notifications exist for dispute lifecycle events:
- Dispute assigned to committee member
- Dispute status changed (under_review, resolved, rejected)
- New comment on a dispute

### 6. Missing — Seller Booking Cancellation → Buyer
When a seller cancels a service booking, the `reschedule_service_booking` RPC notifies both parties, but a straight cancellation from the seller side has no client-side notification insert for the buyer.

### 7. Missing — Booking Reminders
No pre-appointment reminder exists. A "Your appointment is in 1 hour" notification would significantly reduce no-shows.

### 8. Missing — Payment/Settlement Notifications
When `create_settlement_on_delivery` fires, sellers are not notified that a settlement is pending or processed.

### 9. Group Buy Target — Notification Exists but No Trigger for Participants
When a group buy target is reached, only the seller is notified. Participating buyers are not told "Target reached — your order will proceed!"

---

## Frequency & Timing Assessment

| Notification Type | Trigger | Frequency | Assessment |
|---|---|---|---|
| Order status (13 statuses) | Real-time on status change | Per-event | **Appropriate** |
| Chat messages | Per message | Could be high | **Needs throttling** — rapid chat = notification spam |
| Maintenance reminders | Weekly cron | Once/week | **Appropriate** |
| Weekly digest | Weekly cron | Once/week | **Appropriate** |
| Society notices | Per notice | Variable | **Risk of spam** in active societies |
| Delivery tracking (OTP, gate, proximity) | Per delivery | 2-4 per delivery | **Appropriate** |
| Stock alerts | On restock | One-time per watcher | **Appropriate** |
| Collective escalation | Daily cron | Rare | **Appropriate** |

### Chat Throttling Gap
If buyer and seller exchange 20 messages in 5 minutes, that's 20 push notifications. There's no debounce or "typing" aggregation. Should batch to: "3 new messages from [Name]" if multiple arrive within 60 seconds.

---

## Recommended Changes

### Must Fix (Silent Failures / Missing Critical Alerts)

1. **Add `requested`, `confirmed`, `no_show`, `returned` to DB trigger** — These are real order statuses with no notifications
2. **Add review notification to seller** — Insert into `notification_queue` when a review is submitted
3. **Add dispute status change notifications** — Notify submitter when dispute status changes
4. **Remove dead code** — Delete `sendOrderStatusNotification` and `sendChatNotification` from `notifications.ts`
5. **Migrate admin notifications to queue** — Move `admin-notifications.ts` from direct `sendPushNotification` to `notification_queue` inserts

### Should Add (High Value)

6. **Booking reminder** — Cron job: notify buyer + seller 1 hour before appointment
7. **New review notification to seller** — "⭐ New Review! [BuyerName] rated you [X]/5"
8. **Group buy participant notification** — Notify all participants when target is reached
9. **Chat message throttling** — Aggregate rapid messages into single notification

### Nice to Have

10. **Settlement processed notification** — Notify seller when payment is settled
11. **Seller cancellation → buyer notification** — Ensure coverage for all cancellation paths
12. **Quiet hours** — Don't deliver push between 10PM-7AM (queue but delay delivery)

### Files to Change

- **1 migration**: Update `enqueue_order_status_notification` trigger for missing statuses + add review notification trigger + add dispute notification trigger + add booking reminder cron function
- **`src/components/review/ReviewForm.tsx`**: Add `notification_queue` insert after successful review
- **`src/lib/notifications.ts`**: Remove dead `sendOrderStatusNotification` and `sendChatNotification`
- **`src/lib/admin-notifications.ts`**: Switch from `sendPushNotification` + `user_notifications` insert to `notification_queue` insert only
- **`src/hooks/useSellerChat.ts`**: Add throttle logic (check if notification sent to same user in last 60s)
- **New edge function**: `send-booking-reminders` — cron-triggered, queries bookings starting within 1 hour

