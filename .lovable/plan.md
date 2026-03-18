
Audit result: the buyer Live Activity failure is not caused by one simple status mismatch anymore. The JS trigger path is mostly in place, but there are still multiple gaps that can prevent the lock-screen activity from ever appearing.

What I verified
- The orchestrator is mounted globally in `App.tsx`; it is no longer tied to `OrderDetailPage`.
- Start statuses already include `accepted`, `preparing`, `ready`, `picked_up`, `on_the_way`, `confirmed` in the manager.
- Realtime publication is enabled for both `orders` and `delivery_assignments`.
- The latest real order `6abd8547-...` is in `preparing`, so if the start path were working end-to-end, Live Activity should already exist.
- `delivery_assignments` currently has no rows for recent orders, which explains missing ETA/tracking enrichment later, but should not block a basic Live Activity from starting.

Why it is still failing
1. Native bridge reliability is still unproven
- The app has no runtime diagnostic for `LiveActivity.startLiveActivity()` success/failure.
- If iOS returns `Live Activities not enabled` or `plugin not implemented`, the app only logs to console; there is no surfaced failure state.

2. Realtime path is fragile
- `useLiveActivityOrchestrator` uses realtime only for order updates.
- It does not track subscription states (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`).
- It has no polling fallback, so if one realtime update is missed, the buyer gets no start/update until app resume.

3. Background/terminated behavior is still incomplete
- Current implementation is app-driven.
- If the buyer app is suspended/terminated when seller changes status, the JS listener cannot reliably start the activity.
- True Blinkit-style behavior still requires remote Live Activity push updates from backend/native.

4. Delivery tracking updates are incomplete
- The orchestrator listens only to `UPDATE` on `delivery_assignments`, not `INSERT`.
- So when the assignment is first created, buyer will miss the first ETA/rider payload unless another update happens later.

5. Persistence/hydration has a gap
- `LiveActivityManager` persists `live_activity_map`, but `restoreAppPreferences()` does not restore that key on native boot.
- That weakens restart recovery and makes hydration depend more heavily on native plugin state being correct.

6. Native packaging is still a probable blocker
- Android native Live Activity files exist only as reference files and are not wired into the Android build pipeline at all.
- iOS widget creation exists in CI, but the app still depends on external Apple capability/provisioning setup for the widget target and Live Activities support. If that is incomplete, `Activity.request(...)` will fail even with correct JS.

Most likely root-cause stack
- Immediate in-app misses: fragile realtime listener with no fallback.
- Silent native failures: no surfaced error path around `startLiveActivity`.
- Fully reliable lock-screen behavior: impossible with current local-only architecture when app is suspended/closed.
- Later-stage tracking gaps: no `delivery_assignments` insert handling and recent orders have no assignment rows.

Implementation plan
1. Add full runtime diagnostics for Live Activity
- Build a debug utility/page that checks:
  - native platform
  - plugin availability
  - iOS version support
  - `areActivitiesEnabled`
  - active native activities
  - direct test start/update/end with visible result
- Persist these results so failures are inspectable without Xcode logs.

2. Harden the orchestrator
- Add subscription status callbacks and explicit logs for realtime channels.
- Add polling fallback for buyer active orders using `updated_at` backoff logic.
- Deduplicate by order id + status timestamp to avoid duplicate starts.

3. Fix delivery assignment bridging
- Listen to both `INSERT` and `UPDATE` on `delivery_assignments`.
- On insert, immediately enrich the existing activity with ETA/rider data.

4. Strengthen cold-start/resume recovery
- Extract a shared `syncActiveOrders()` function.
- Run it on mount, on app resume, and from fallback polling.
- Restore `live_activity_map` from native persistent storage during app boot.

5. Surface native failures to the app
- In `LiveActivityManager`, capture and expose start/update/end errors instead of console-only logging.
- Log exact plugin responses and reject reasons for each order id.

6. Verify iOS delivery prerequisites
- Confirm device is on iOS 16.2+.
- Confirm Live Activities are enabled in app/system settings.
- Confirm widget target bundle/capability/provisioning are correctly configured for production builds.
- Add a visible checklist in the debug screen so this is testable on-device.

7. Phase 2 for true production behavior
- Add backend-driven remote ActivityKit updates for accepted/preparing/ready/picked_up/on_the_way.
- Trigger those from order-status events so Live Activity can start/update even when the buyer app is suspended or closed.

Recommended outcome order
- First: diagnostic tooling + surfaced native errors.
- Second: realtime hardening + polling fallback + delivery assignment insert handling.
- Third: boot persistence fix.
- Fourth: remote push-driven Live Activity updates.

Bottom line
- The global JS architecture is now present, so the old page-coupling bug is not the main reason anymore.
- The remaining blockers are: silent native failures, fragile realtime delivery, missing fallback sync, incomplete assignment event handling, and no remote Live Activity push path for suspended/closed app behavior.
- Because your latest order is already in `preparing`, the next implementation should focus first on proving whether `startLiveActivity()` is actually being called and what native iOS is returning on the device.
