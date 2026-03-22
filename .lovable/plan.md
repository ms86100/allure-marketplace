

## Fix: Live Activity Real-Time Sync + Location Tracking Failure (Revised)

### Issue 1: Live Activity Not Updating in Real Time

**Root Cause: 5-second throttle swallows status changes**

In `LiveActivityManager.ts`, ALL updates go through `throttledUpdate()` (line 465-477) which delays by up to 5 seconds. Status changes (e.g., "accepted" → "preparing" → "picked_up") are high-priority discrete events that should update the Dynamic Island instantly. The current code treats them identically to high-frequency location/ETA pings.

Additionally, both realtime channels in `useLiveActivityOrchestrator.ts` only handle `CHANNEL_ERROR` and `TIMED_OUT` but not `CLOSED`. After iOS background/foreground transitions, a WebSocket can close cleanly without triggering reconnect, leaving the Live Activity deaf to updates.

**Fix (2 files):**

**`src/services/LiveActivityManager.ts`:**
- Add `lastStatus` field to `ActiveEntry` interface to track the last-known workflow status per entity
- In `push()` method: when `workflow_status` differs from `lastStatus`, bypass `throttledUpdate()` and call `doUpdate()` directly — instant update for status changes
- Update `lastStatus` in `doUpdate()` after successful native call

**`src/hooks/useLiveActivityOrchestrator.ts`:**
- In both channel subscribe callbacks (order channel ~line 189, delivery channel ~line 306): also handle `CLOSED` status to trigger `attemptReconnect()`

---

### Issue 2: Location Tracking Failure ("Could not start location tracking")

**Root Cause: NOT a plugin/license issue** (confirmed working recently). The problem is in the error handling and diagnostic opacity.

The catch block at line 281-283 of `useBackgroundLocationTracking.ts` catches ALL errors from `startNativeTracking()` but shows only a generic "Could not start location tracking" toast. The actual error (which could be a permission timing issue, a config race, or a transient native bridge error) is logged to console but the seller sees no actionable information.

Since this was working before, the most likely causes are:
1. **Config race condition**: `configRef.current` is loaded async (line 50) but `startNativeTracking` can be called before it resolves (via auto-start in SellerGPSTracker). The `BackgroundGeolocation.ready()` config uses hardcoded values so this isn't blocking, but if the native bridge isn't fully ready when auto-start fires, it fails.
2. **Auto-start fires before component is fully mounted**: `SellerGPSTracker` auto-starts in a `useEffect` that depends on `startTracking` (which is recreated on every render due to its dependency chain). A stale closure or double-invocation could cause the native plugin to error.

**Fix (2 files):**

**`src/hooks/useBackgroundLocationTracking.ts`:**
- In `startNativeTracking` catch block (line 281-283): log the full error details AND include the error message in the toast so the seller sees what actually failed (e.g., "Location permission denied", "Plugin not ready")
- Add a retry mechanism: if `startNativeTracking` fails, automatically retry once after 1 second. This handles transient native bridge readiness issues on cold start.
- Guard `startTracking` with a `startingRef` flag to prevent double-invocation from React strict mode or rapid re-renders.

**`src/components/delivery/SellerGPSTracker.tsx`:**
- Add a small delay (500ms) before auto-start to ensure the native bridge is fully initialized after app launch. This prevents the cold-start race condition.

---

### Summary of Changes

| File | Change |
|---|---|
| `src/services/LiveActivityManager.ts` | Track `lastStatus` per entity; bypass throttle for status changes |
| `src/hooks/useLiveActivityOrchestrator.ts` | Handle `CLOSED` channel status for reconnect |
| `src/hooks/useBackgroundLocationTracking.ts` | Surface real error in toast; add single retry; prevent double-start |
| `src/components/delivery/SellerGPSTracker.tsx` | 500ms delay before auto-start for native bridge readiness |

