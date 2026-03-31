# 🔔 Notification System — Stable Backup (2026-03-31)

## Status: WORKING & VERIFIED IN PRODUCTION

### Architecture Summary

```text
Order event (INSERT or UPDATE)
  → DB trigger: INSERT into notification_queue
  → notification_queue INSERT trigger: net.http_post → process-notification-queue
  → process-notification-queue: claims batch via claim_notification_queue (FOR UPDATE SKIP LOCKED)
  → DIRECT APNs / FCM delivery (inlined, no function-to-function hop)
  → Cron sweep every 60s picks up any missed items
```

### Key Design Decisions

1. **Inline Push Delivery**: APNs and FCM sending logic is directly inside `process-notification-queue/index.ts`. The old `send-push-notification` function is NOT called from the queue processor (eliminated the double-hop failure point).

2. **Credential Caching**: Firebase service account + APNs keys loaded ONCE per batch invocation, not per notification.

3. **Safe Token Handling**: Invalid tokens (APNs 410, FCM UNREGISTERED) are marked `invalid=true` with `invalid_count` incremented — never deleted on first failure.

4. **Queue-Level Retries**: Failed pushes re-queued as `pending` with 15s delay. Max 9 total attempts before dead-lettering.

5. **Partial Failure**: Each device token processed independently in try/catch. One failure never blocks others.

6. **Dual-Plugin iOS**: `@capacitor/push-notifications` for permissions + raw APNs token, `@capacitor-community/fcm` for FCM token on iOS.

7. **Listener Gate**: Listeners are set up before `register()` is called to prevent race conditions.

8. **Deduplication**: Same (user_id, type, reference_path) within 60s → skip. `queue_item_id` unique constraint prevents duplicate in-app notifications on retry.

9. **Guards**: Staleness (>5 min), terminal state, state-mismatch checks. Initial order alerts (placed/enquired/requested) are exempt.

10. **Sound**: iOS uses `gate_bell.mp3` in APNs payload. Android uses `gate_bell` sound + `orders_alert` channel.

### Files in This Backup

| File | Description |
|------|-------------|
| `process-notification-queue.ts` | Main queue processor with inlined APNs/FCM delivery |
| `send-push-notification.ts` | Standalone push function (still available for manual/one-off sends) |
| `credentials.ts` | Shared credential helper (DB-first, env fallback) |
| `usePushNotifications.ts` | Client-side hook with dual-plugin architecture |
| `PushNotificationContext.tsx` | React context for push state |
| `PushNotificationProvider.tsx` | Single provider that owns all push side effects |
| `EnableNotificationsBanner.tsx` | Permission prompt UI component |
| `useUnreadNotificationCount.ts` | Unread badge count hook |
| `pushLogger.ts` | Remote push log buffer |
| `notification-routes.ts` | Type → route resolver for notification taps |
| `capacitor.ts` | Capacitor initialization (status bar, keyboard, splash) |
| `NotificationDiagnostics.tsx` | Admin panel notification health widget |

### Database Schema (Relevant Tables)

- `device_tokens`: user_id, token, platform, apns_token, invalid (bool), invalid_count (int)
- `notification_queue`: user_id, title, body, type, reference_path, payload, status, retry_count, last_error
- `user_notifications`: user_id, title, body, type, reference_path, queue_item_id (unique), is_read
- `notification_preferences`: user_id, orders, chat, promotions, sounds
- `push_logs`: user_id, level, message, metadata

### DB Functions

- `claim_notification_queue(batch_size)`: Atomically claims pending items using FOR UPDATE SKIP LOCKED
- `claim_device_token(p_user_id, p_token, p_platform, p_apns_token)`: Atomic token registration with auto-purge of old entries

### Triggers

- `trg_enqueue_order_placed_notification`: Fires on INSERT to orders → enqueues seller notification
- `trg_enqueue_order_status_notification`: Fires on UPDATE to orders.status → enqueues buyer/seller notification based on category_status_flows
- `notification_queue INSERT trigger`: Fires net.http_post to invoke process-notification-queue

### Build ID
`2026-03-07-DUAL-PLUGIN-V2-LISTENER-GATE`

### Verified Behaviors
- ✅ COD order → seller receives push within 3 seconds
- ✅ Razorpay order → seller receives push within 3 seconds  
- ✅ Multi-store seller → receives pushes for ALL stores
- ✅ Invalid token → marked invalid, NOT deleted
- ✅ Failed delivery → item re-queued with 15s delay
- ✅ Same event twice → only one push delivered (idempotency)
- ✅ APNs direct delivery confirmed (HTTP 200, apns-id received)
- ✅ FCM delivery confirmed
- ✅ End-to-end push on physical iOS device
