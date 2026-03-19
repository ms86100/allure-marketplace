

# Fix Plan: Close the Two Product Gaps

## What's already solved (no work needed)
- **Progress consistency (APNs vs client):** Already fixed in the previous round. `update-live-activity-apns` line 221-224 uses `payload.initial_eta_minutes` with the same `(initialEta > 5) ? initialEta : 15` formula as the client mapper. `update-delivery-location` passes `initial_eta_minutes` to the APNs invocation. Verified in code — no mismatch remains.
- **App resume sync:** The orchestrator's resume handler (line 380) already calls `doSync()` → `syncActiveOrders()` which ends activities for terminal orders (liveActivitySync.ts line 74-93). Resume is covered.

## What needs fixing

### Gap: 45-second stale state window (foreground, realtime dropped)
**Scenario:** App stays in foreground, Supabase Realtime silently drops, order transitions to `delivered` server-side. The client's only safety net is the 45s polling heartbeat.

**Two changes, both minimal:**

#### Change 1: Reduce poll interval from 45s to 15s
**File:** `src/hooks/useLiveActivityOrchestrator.ts`, line 315

- Before: `const POLL_INTERVAL_MS = 45_000;`
- After: `const POLL_INTERVAL_MS = 15_000;`

**Why 15s:** This is a single lightweight query (`SELECT id, status FROM orders WHERE buyer_id = ?`). The cost is negligible — one small read every 15s. Blinkit polls at 10s. This closes the worst-case window from 45s to 15s.

#### Change 2: Add `visibilitychange` listener for immediate sync
**File:** `src/hooks/useLiveActivityOrchestrator.ts` — new effect

When the browser tab / webview regains visibility (user switches back to the app, or opens from multitasking), trigger an immediate poll instead of waiting for the next 15s tick. This is **different from** `appStateChange` (which fires on full background→foreground). `visibilitychange` also fires on tab focus, split-screen transitions, and notification shade dismissal.

```
useEffect — on visibilitychange:
  if document is visible AND userId exists:
    run doSync() immediately
```

This ensures: when the user is actually looking at the screen, stale state is caught within milliseconds, not seconds.

#### Change 3: Defensive guard on OrderDetailPage
**File:** `src/pages/OrderDetailPage.tsx`

Add a one-time check when the order detail page mounts or when order data refreshes: if the order status is terminal, call `LiveActivityManager.end(orderId)`. This is belt-and-suspenders — ensures that if a user navigates to a delivered order, any lingering activity is killed immediately.

```
useEffect — when order.status changes:
  if status is in terminal set:
    LiveActivityManager.end(orderId)
```

---

## Summary

| Change | File | Impact |
|--------|------|--------|
| Reduce poll to 15s | `useLiveActivityOrchestrator.ts` | Max stale window: 45s → 15s |
| Add `visibilitychange` sync | `useLiveActivityOrchestrator.ts` | Instant sync on tab/app focus |
| Defensive guard on order detail | `OrderDetailPage.tsx` | Belt-and-suspenders kill on mount |

**Total: 3 small, surgical changes. No new features. No architectural changes.**

