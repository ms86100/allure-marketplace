
Goal: keep the existing order/notification fixes, but replace the Live Activity plan with a mobile-first, event-driven architecture that does not depend on `OrderDetailPage`.

What I found in the code:
- Live Activity is still triggered only from `src/pages/OrderDetailPage.tsx` via `useLiveActivity(...)`.
- `src/hooks/useLiveActivity.ts` simply forwards page state to `LiveActivityManager.push(...)`.
- `src/services/LiveActivityManager.ts` already includes `accepted`, `ready`, `picked_up`, `preparing`, `en_route`, and `on_the_way`, so the status-list fix is mostly present.
- Buyer global listeners exist (`useBuyerOrderAlerts`, `useAppLifecycle`), but neither triggers Live Activity.
- Current implementation is app-local only. There is no server-driven Live Activity update path in the repo:
  - no backend function sending ActivityKit remote updates
  - no native push handler for Live Activity start/update
  - no `didReceiveRemoteNotification` / ActivityKit push bridge code
- Result: if the buyer is not on the order page, no Live Activity push happens; if the app is closed, current architecture cannot start/update the Live Activity at all.

Updated plan for Live Activity

1. Remove page-coupled triggering
- Remove `useLiveActivity` usage from `OrderDetailPage`.
- Keep `LiveActivityManager` as the single controller, but stop tying it to page lifecycle.

2. Add a global buyer order activity listener
- Create a new global hook/service mounted near `AppRoutes` / app shell.
- It should:
  - subscribe to buyer order updates on `orders`
  - detect status changes for the signed-in buyer
  - fetch any missing delivery assignment/tracking data needed for payloads
  - call `LiveActivityManager.push(...)` for every relevant status transition
  - call `LiveActivityManager.end(...)` on terminal statuses
- This becomes the primary in-app trigger for foreground/background-active cases.

3. Start explicitly at `accepted`
- In the global listener, force a push when an order first becomes `accepted`.
- Treat `accepted` as the guaranteed start point, even if ETA/driver info is still null.
- Then keep updating on:
  - `preparing`
  - `ready`
  - `picked_up`
  - `on_the_way`
  - `en_route`
  - terminal states (`delivered`, `completed`, `cancelled`, etc.)

4. Strengthen `LiveActivityManager` logging
- Add mandatory logs around:
  - trigger source
  - platform / `isNativePlatform()`
  - status + orderId
  - hydrate result
  - start/update/end requests
  - native plugin responses
  - failures and skipped cases
- Example log points:
  - `LIVE ACTIVITY TRIGGER`
  - `LIVE ACTIVITY START`
  - `LIVE ACTIVITY UPDATE`
  - `LIVE ACTIVITY END`
  - `LIVE ACTIVITY SKIP`
  - `LIVE ACTIVITY ERROR`

5. Enrich payload construction outside the page
- Build a shared mapper from order + delivery assignment/tracking → `LiveActivityData`.
- Use order status immediately, then progressively enhance with:
  - ETA
  - rider distance
  - rider name
  - vehicle label
  - progress label
- This avoids depending on `useDeliveryTracking` inside the order page.

6. Add native-safe hydration on app resume/relaunch
- On app launch and on `appStateChange(isActive=true)`, reconcile current active buyer orders and re-push them into `LiveActivityManager`.
- This covers:
  - app reopened after backgrounding
  - missed realtime event while app was suspended
  - restoring visible activity after cold launch

7. Add delivery-tracking update bridge
- Extend the global system so Live Activity also updates when `delivery_assignments` changes for tracked buyer orders.
- For active in-transit orders, subscribe to assignment updates and feed ETA / distance / rider changes into `LiveActivityManager.push(...)`.
- Keep throttling in `LiveActivityManager`.

8. Important production gap: closed-app behavior
- A React/global listener alone cannot start or update Live Activity when the app is fully terminated.
- To satisfy “Blinkit-like” behavior with the app closed, add a second phase:
  - backend-triggered ActivityKit remote updates for iOS
  - push payloads dedicated to Live Activity start/update
  - native handler wiring for notification-driven activity updates
- This is the missing piece in the current architecture and explains why testing on a real mobile device still fails when the app is not actively running.

9. Native implementation review items
- Verify the iOS widget/native target is complete in the actual native project, not just reference files:
  - Live Activities capability enabled
  - widget extension included and signed correctly
  - required plist/support keys present
- The repo contains Swift reference files, but no proof in this code snapshot that full native project config is wired.

10. Test plan this implementation must pass
- Buyer places order, seller accepts, buyer app not on `OrderDetailPage`:
  - Live Activity starts at `accepted`
- Seller moves order through `preparing` / `ready` / `picked_up` / `on_the_way`:
  - Live Activity updates each time
- Buyer backgrounds app and locks phone:
  - activity remains visible and updates while app is still alive/backgrounded
- Buyer relaunches app after suspension:
  - hydration restores/update path
- Final phase after remote-update work:
  - app fully closed, seller accepts order
  - lock screen activity appears via push-driven start/update

Files likely involved
- `src/pages/OrderDetailPage.tsx` — remove page hook usage
- `src/hooks/useLiveActivity.ts` — likely replace/remove
- `src/services/LiveActivityManager.ts` — logging + source-aware push behavior
- new global hook/service near app shell — buyer order live-activity orchestration
- `src/App.tsx` — mount the global orchestrator
- possibly `src/hooks/useAppLifecycle.ts` — trigger re-sync on resume
- backend/native mobile pieces for true closed-app Live Activity phase

Recommended implementation order
1. Decouple from `OrderDetailPage`
2. Add global buyer order listener
3. Add explicit `accepted` start + logging
4. Add resume/relaunch hydration
5. Add delivery assignment update feed
6. Then implement push-driven/native remote Live Activity updates for fully closed-app support

Bottom line:
- The current bug is architectural, not just a status mismatch.
- The immediate fix is to move Live Activity orchestration out of the order screen and into a global buyer order event layer.
- The full “works even when closed” requirement needs backend/native push-driven Live Activity updates, which do not exist yet in this codebase.
