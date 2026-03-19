

# Fix: Eliminate Foreground Stale State via Push-Driven Sync

## Gap Analysis

The `order-terminal-push` CustomEvent (dispatched by push notification handler on terminal status) is already consumed by:
- **LiveActivityOrchestrator** → ends Live Activity ✅
- **ActiveOrderStrip** → invalidates query ✅

But these surfaces do **NOT** listen for it:
1. **`useOrderDetail`** — the OrderDetailPage stays stale (shows tracking, delivery code, etc.)
2. **`useAppLifecycle`** — doesn't bridge push events to query invalidation for `orders`, `cart-items`, etc.

This means: if Realtime silently fails and a terminal push arrives, the Live Activity ends and the strip updates, but the **OrderDetailPage** (the most critical surface) remains stale showing active tracking UI.

## Fix (Minimal, 2 files)

### Fix 1: `src/hooks/useOrderDetail.ts`
Add `order-terminal-push` listener alongside existing `order-detail-refetch` listener. When received, trigger `setRefetchTick` to re-fetch the order from DB immediately. This is a 2-line addition to the existing useEffect.

### Fix 2: `src/hooks/useAppLifecycle.ts`
Add a global `order-terminal-push` listener that invalidates all critical queries (`orders`, `active-orders-strip`, `unread-notifications`, `seller-orders`) and dispatches `order-detail-refetch`. This ensures ALL query-based surfaces update immediately on terminal push, not just the ones with explicit listeners.

## Result: Multi-Channel Guarantee

| Channel | OrderDetail | ActiveOrderStrip | LiveActivity | All Queries |
|---------|-------------|------------------|--------------|-------------|
| Realtime | ✅ (channel) | ✅ (query refetch) | ✅ (orchestrator) | ❌ |
| Push (terminal) | ✅ **NEW** | ✅ (existing) | ✅ (existing) | ✅ **NEW** |
| Visibility | ✅ (existing) | ✅ (refetchOnWindowFocus) | ✅ (orchestrator) | ✅ (useAppLifecycle) |
| Polling | ✅ (15s orchestrator) | ✅ (60s refetchInterval) | ✅ (orchestrator) | ❌ |

After this fix, polling is **never required for correctness** — it's purely a safety net for the edge case where both Realtime AND push fail simultaneously.

## Files to Modify
1. `src/hooks/useOrderDetail.ts` — Add `order-terminal-push` listener
2. `src/hooks/useAppLifecycle.ts` — Add global push-driven query invalidation

