

## Why the Seller Didn't Get the In-App Notification

### Root Cause

The seller notification system (`useNewOrderAlert`) relies **exclusively** on Supabase Realtime subscriptions to detect new orders. There is no fallback. Realtime can silently fail due to:

1. **RLS + filter complexity**: The `orders` table SELECT policy uses a subquery (`EXISTS (SELECT 1 FROM seller_profiles WHERE ...)`) to authorize sellers. Realtime with row-level filters combined with subquery-based RLS policies is known to be unreliable — events can be silently dropped.
2. **Channel subscription timing**: If the WebSocket connection drops momentarily or the subscription hasn't fully established, INSERT events are lost forever.
3. **No recovery mechanism**: Once a Realtime event is missed, the seller never learns about it until they manually refresh or navigate to the orders page.

### Fix Plan

**Add a polling fallback** to `useNewOrderAlert.ts` that runs alongside the Realtime subscription, ensuring no order is ever missed.

#### Changes to `src/hooks/useNewOrderAlert.ts`:

1. Add a polling loop that checks for new orders created after the hook initialized
2. Use exponential backoff (2s → 30s) to minimize server load when idle
3. Reset backoff to 2s whenever a new order arrives (via Realtime or polling)
4. Deduplicate: track the last seen order timestamp to avoid re-alerting
5. Keep the existing Realtime subscription as the primary fast path

```text
Architecture:
┌─────────────────────────┐
│  useNewOrderAlert hook  │
├─────────────────────────┤
│ Primary: Realtime sub   │──→ Instant alert
│ Fallback: Smart polling │──→ Catches missed events
│ Dedup: lastSeenAt track │──→ No duplicate alerts
└─────────────────────────┘
```

#### Implementation details:

- Poll query: `SELECT id, status, total_amount, created_at FROM orders WHERE seller_id = $sellerId AND created_at > $lastSeenAt ORDER BY created_at DESC LIMIT 1`
- On mount, set `lastSeenAt` to current time (don't alert for old orders)
- When Realtime fires, update `lastSeenAt` to skip that order in polling
- When polling finds a new order, trigger the same `setPendingAlert` + update `lastSeenAt`
- Backoff: start at 3s, multiply by 1.5 each empty poll, cap at 30s, reset on new order

No database changes needed. Single file edit to `src/hooks/useNewOrderAlert.ts`.

