

# Fix: Seller Push Notifications for New Orders + iOS Media Control Bug

## Evidence from Production Database

**Smoking gun**: Every "New Order Received!" seller notification with `type: order_status` (created by the DB trigger) has **status: `failed`** with error `"Edge Function returned a non-2xx status code"`. Meanwhile, the same seller's notifications with `type: order` (created by `confirm-razorpay-payment`) succeed. This pattern is 100% consistent across March 27–31.

```text
type: order_status (DB trigger)  → ALWAYS FAILS  (6/6 entries)
type: order (edge function)      → ALWAYS SUCCEEDS (5/5 entries)
```

## Root Cause Analysis

### Issue 1: Seller push notifications fail due to race condition

The failure chain:

1. `confirm-razorpay-payment` updates order status to `placed`
2. The DB trigger `fn_enqueue_order_status_notification` fires **synchronously** during the transaction, inserting a `notification_queue` row
3. The `trigger_process_notification_queue` trigger fires on that INSERT, calling `net.http_post` to invoke `process-notification-queue`
4. `process-notification-queue` claims the item and calls `send-push-notification`
5. But `confirm-razorpay-payment` is **still executing** — it hasn't committed yet, and the edge function platform throttles/rejects concurrent invocations of `send-push-notification`
6. All 3 retry attempts fail within the same execution window (retries at 2s and 5s aren't enough to clear the contention)
7. The notification is dead-lettered

Then `confirm-razorpay-payment` finishes, inserts its own `type: order` notification, and calls `process-notification-queue` again. This time, the edge function platform is free, and the push succeeds — but this second notification goes to the **same seller** as a duplicate in-app notification, while the first one (the one that should have produced the push) is already dead.

**For COD orders**: The same race exists but is less severe because there's no long-running edge function holding resources.

### Issue 2: iOS media controls appear for the bell sound

`useNewOrderAlert.ts` line 93-97 uses `new Audio()` with `audio.loop = true`. On iOS, any `<audio>` element played via the HTML5 Audio API is treated as **media playback**, which:
- Shows in the iOS Control Center as a media track
- Displays play/pause controls on the lock screen
- Can be paused by the user via AirPods or Control Center

The `mediaSession` workaround (lines 100-104) attempts to prevent this by setting `pause` handler to `null`, but iOS ignores `null` handlers — it still shows the media widget.

## Fix Plan

### Fix 1: Eliminate duplicate seller notification paths + fix delivery reliability

**Problem**: Two sources create seller "New Order" notifications — the DB trigger AND the `confirm-razorpay-payment` edge function. The trigger path always fails due to the race condition.

**Solution**: Remove the manual seller notification insert from `confirm-razorpay-payment` (it's now redundant since the DB trigger handles it). Then fix the timing issue by ensuring `process-notification-queue` doesn't get invoked during a competing edge function's execution.

The reliable fix: Instead of the DB trigger's `net.http_post` firing immediately (racing with the parent transaction), add a small delay via the cron job (already runs every minute). For urgent order notifications, we keep the trigger but make it more resilient:

**File: `supabase/functions/confirm-razorpay-payment/index.ts`**
- Remove lines 231-247 (the manual seller notification insert). The DB trigger already creates the seller notification with `target_role: 'seller'` when the order status changes to `placed`.
- Keep the `process-notification-queue` invocation at line 258 but add a 2-second delay so the transaction has time to commit and the trigger-created notification is available.

**File: `supabase/functions/process-notification-queue/index.ts`**
- Add a safety check: if `send-push-notification` returns a non-2xx error, re-queue the item as `pending` with a `next_retry_at` of 30 seconds in the future instead of dead-lettering immediately. This gives the cron job a chance to retry after the contention clears.

### Fix 2: Replace HTML5 Audio with Web Audio API for in-app bell sound

**File: `src/hooks/useNewOrderAlert.ts`**

Replace the `new Audio()` approach with `AudioContext` (same pattern already used in `useUrgentOrderSound.ts`). The Web Audio API:
- Does NOT register as media playback on iOS
- Does NOT show in Control Center
- Plays as a programmatic sound effect, not a media track
- Is the correct API for short notification sounds

Changes:
- Replace `audioRef` (HTMLAudioElement) with `audioContextRef` + `audioBufferRef`
- Load and decode `gate_bell.mp3` via `fetch` + `AudioContext.decodeAudioData`
- Play via `AudioBufferSourceNode` (short play, schedule next after duration + gap)
- Remove `mediaSession` workaround (no longer needed)
- Keep haptic vibration fallback

### Fix 3: Ensure COD orders also trigger seller push reliably

For COD orders, the flow is: `create_multi_vendor_orders` RPC → order INSERT with `status = 'placed'` → DB trigger fires. The same race condition applies but is mitigated because there's no competing edge function. However, the `trigger_process_notification_queue` still fires via `net.http_post` during the RPC transaction.

**Solution**: The `process-notification-queue` retry fix (Fix 1) handles this. Dead-lettered items get re-queued instead of permanently failed.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/confirm-razorpay-payment/index.ts` | Remove duplicate seller notification insert (lines 231-247) |
| `supabase/functions/process-notification-queue/index.ts` | Change dead-letter to re-queue with delay for transient push failures |
| `src/hooks/useNewOrderAlert.ts` | Replace HTML5 Audio with Web Audio API to fix iOS media controls |

## Validation

1. Place a new order → seller receives push notification with gate bell sound
2. Verify `notification_queue` shows `status: processed` for seller notifications
3. On iOS: verify no media controls appear when the in-app bell sounds
4. COD and Razorpay order flows both produce seller push notifications
5. No duplicate in-app notifications for the seller

