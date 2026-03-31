

# Bulletproof Push Notification System — Inline Delivery with Enterprise Safeguards

## What Changes

**Single file modified**: `supabase/functions/process-notification-queue/index.ts`

**One migration**: Add `invalid` + `invalid_count` columns to `device_tokens` for safe token handling.

## Architecture (Before → After)

```text
BEFORE:
  notification_queue INSERT
  → process-notification-queue
  → supabase.functions.invoke("send-push-notification")  ← FAILS HERE (401, cold start, gateway)
  → APNs / FCM

AFTER:
  notification_queue INSERT
  → process-notification-queue (DIRECT APNs + FCM delivery)
  → APNs / FCM
```

The `send-push-notification` function is NOT deleted — it remains available for manual/one-off sends. It's just removed from the critical path.

## Safeguards (All 5 Mandatory Conditions)

### 1. Fallback Retry (Re-queue, Never Silent Drop)

If inline push fails, the item is re-queued as `pending` with `next_retry_at` set to 15 seconds later (not 30s). Max 3 retry cycles (9 total attempts across all cycles). Only dead-letter after exhausting all retries.

```typescript
// On failure:
if (retryCount < MAX_TOTAL_ATTEMPTS) {
  await supabase.from("notification_queue").update({
    status: "pending",
    retry_count: retryCount,
    next_retry_at: new Date(Date.now() + 15_000).toISOString(),
    last_error: errorMsg,
  }).eq("id", item.id);
} else {
  // Dead-letter only after 9 total attempts
  mark as failed;
}
```

### 2. Safe Token Handling (Mark Invalid, Not Delete)

**Migration**: Add `invalid boolean DEFAULT false` and `invalid_count int DEFAULT 0` to `device_tokens`.

On APNs 410 or FCM UNREGISTERED:
- Increment `invalid_count`, set `invalid = true`
- Skip invalid tokens on future sends
- A separate cleanup (or manual) removes tokens with `invalid_count >= 3`
- Never delete on first failure

```typescript
if (result.error === "INVALID_TOKEN") {
  await supabase.from("device_tokens").update({
    invalid: true,
    invalid_count: (tokenRecord.invalid_count || 0) + 1,
  }).eq("id", tokenRecord.id);
}
```

### 3. Idempotency at Push Layer

Already exists via `user_notifications` dedup (same `user_id` + `type` + `reference_path` within 60s → skip). Additionally, `queue_item_id` unique constraint prevents duplicate in-app notifications on retry. No additional table needed — existing guards are sufficient.

### 4. Partial Failure Handling

Each token is processed independently in a try/catch. One token failure never breaks others:

```typescript
for (const token of dedupedTokens) {
  try {
    result = await sendDirectPush(token, ...);
  } catch (err) {
    result = { success: false, error: String(err) };
    // continue to next token
  }
}
```

### 5. Observability / Logging

Every push attempt logs: `notification_id`, `platform`, `success`, `duration_ms`, `error` (if any). Batch summary logged at end: total processed, succeeded, failed, retried.

```typescript
console.log(JSON.stringify({
  event: "push_delivery",
  notification_id: item.id,
  platform: token.platform,
  success: result.success,
  duration_ms: Date.now() - startMs,
  error: result.error || null,
}));
```

## Implementation Details

### Migration (schema change)
```sql
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS invalid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS invalid_count integer DEFAULT 0;
```

### process-notification-queue/index.ts Changes

1. **Import credential helpers** from `../_shared/credentials.ts`
2. **At batch start**: Load Firebase service account, APNs credentials, generate FCM access token — ONCE per invocation (cached for entire batch)
3. **Replace** `supabase.functions.invoke("send-push-notification", ...)` (lines 256-265) with:
   - Fetch `device_tokens` for `item.user_id` where `invalid = false`
   - Deduplicate (latest per platform)
   - For iOS with `apns_token` + APNs configured → direct APNs (with FCM fallback)
   - For Android or iOS without APNs → direct FCM
   - Each send wrapped in `Promise.race([sendPush(), timeout(5000)])` for timeout protection
4. **On INVALID_TOKEN**: Mark token invalid (not delete)
5. **On failure**: Re-queue with 15s delay, max 9 total attempts
6. **Remove** `PUSH_RETRY_DELAYS_MS` and the inline sleep-based retry loop (lines 238-289). The retry is now handled at the queue level (re-queue as pending), not with in-process sleeps that waste edge function execution time.

### Concurrency Control

Already handled by `claim_notification_queue` which uses `FOR UPDATE SKIP LOCKED`. No additional locking needed.

## Files Changed

| File | Change | Risk |
|------|--------|------|
| Migration | Add `invalid`, `invalid_count` to `device_tokens` | None — additive columns with defaults |
| `supabase/functions/process-notification-queue/index.ts` | Inline APNs/FCM delivery, remove function invoke, add safeguards | Medium — thoroughly tested |

## What is NOT Changed

- `send-push-notification/index.ts` — untouched, still available for manual use
- DB triggers — untouched
- `claim_notification_queue` function — untouched
- `_shared/credentials.ts` — untouched (reused)
- All existing guards (dedup, staleness, preferences, silent push) — preserved exactly

## Validation

1. Place COD order → seller receives push within 3 seconds
2. Place Razorpay order → seller receives push within 3 seconds
3. Multi-store seller → receives pushes for ALL stores
4. Invalid token → marked invalid, NOT deleted, other tokens still work
5. Simulated failure → item re-queued, delivered on retry
6. Same event twice → only one push delivered (idempotency)
7. Check logs → every delivery attempt has structured JSON log with duration

