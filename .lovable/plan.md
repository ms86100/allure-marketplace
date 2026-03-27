

# iOS Live Activity & Dynamic Island — 5 Critical Bugs

## Bug 1: Delivery Channel Subscription Captures Stale Filter — New Orders Never Get Live Activity Updates

**What:** The delivery assignment realtime channel (line 305-310 of `useLiveActivityOrchestrator.ts`) reads `activeOrderIdsRef.current` at `subscribe()` time and, when there's exactly one active order, locks the Postgres filter to `order_id=eq.{that_id}`. This channel is only re-subscribed on `userId` change — it is NOT re-subscribed when a new order is placed. If a buyer places a second order while the first is still active, delivery events for the second order are silently dropped by the server-side filter.

**Where:** `useLiveActivityOrchestrator.ts` lines 305-310 — the delivery channel `useEffect` has `[userId, doSync]` deps. Since `doSync` is a stable `useCallback`, the channel effectively only re-subscribes on user change.

**Why critical:** The Dynamic Island shows stale "Preparing" status for the second order because delivery assignment inserts (rider assigned, ETA updates, distance changes) never reach the client. The buyer sees the island but it appears frozen. This is the exact scenario that destroys trust — a live indicator that isn't live.

**Gap it creates:** The order status channel works fine (it filters by `buyer_id`, not per-order), so the status dot updates. But delivery-specific data (ETA countdown, rider name, distance) stays blank or stale on the Dynamic Island while the order detail page (which has its own queries) shows correct data. The inconsistency between what the island shows and what the detail page shows makes the system feel unreliable.

**Fix:** Remove the `eq` filter optimization entirely. The client-side guard (`activeOrderIdsRef.current.has(row.order_id)`) already filters events. The delivery table typically has very low event volume per buyer, so the server-side filter saves negligible load but creates a correctness gap. Alternatively, resubscribe the channel whenever `activeOrderIdsRef` changes — but this is more complex and fragile.

**Risk from fix:** Slightly more delivery events reach the client (those for other buyers' orders on the same Postgres publication), but the client-side filter on line 262 drops them immediately. Zero functional risk.

**Files:** `src/hooks/useLiveActivityOrchestrator.ts` — remove lines 306-310 filter logic, always pass `undefined` filter.

---

## Bug 2: `end()` Silently Fails When Persisted Map Is Out of Sync with Native Activities

**What:** `LiveActivityManager.end(entityId)` (line 410-434) looks up the `activityId` from its in-memory `active` Map. The iOS plugin's `endLiveActivity` then matches by `activity.id == activityId`. But after an app kill + cold restart, the persisted map may contain a stale `activityId` that no longer matches any native Activity (iOS assigns new IDs on restart). Hydration (line 202) reconciles this, but `end()` can be called BEFORE hydration completes — specifically from the `order-terminal-push` event handler (line 446-451), which fires immediately on push receipt without awaiting hydration.

**Where:** `LiveActivityManager.end()` → `LiveActivity.endLiveActivity({ activityId })` → Swift `endLiveActivity` matches by `activity.id`. The push handler at line 446-451 calls `LiveActivityManager.end(orderId)` directly.

**Why critical:** The buyer's order gets delivered, the push notification arrives, but the Dynamic Island stays visible showing the old status. The buyer sees "On the way" on their lock screen even after delivery. This is the worst trust violation for a delivery app — a phantom live activity that contradicts reality. The buyer may think the delivery hasn't actually happened.

**Gap:** The 15-second polling heartbeat will eventually catch this, but 15 seconds of contradictory information on the lock screen is unacceptable for a production app. The buyer sees "Delivered" toast notification while the Dynamic Island still shows "On the way."

**Fix:** In `end()`, after the `this.active.get(entityId)` lookup fails (entry is null), fall back to calling `LiveActivity.getActiveActivities()` and end any native activity matching the `entityId` directly. This is a 5-line addition.

```typescript
// In end(), after "no active entry" check:
if (!entry) {
  // Fallback: try ending directly from native layer
  try {
    const { activities } = await LiveActivity.getActiveActivities();
    const match = activities.find(a => a.entityId === entityId);
    if (match) {
      await LiveActivity.endLiveActivity({ activityId: match.activityId });
    }
  } catch { /* best-effort */ }
  return;
}
```

**Risk from fix:** One extra native call on `end()` for entries not in the map. This is rare (only after cold restarts) and the call is lightweight.

**Files:** `src/services/LiveActivityManager.ts` — modify `end()` method.

---

## Bug 3: `tokenSaved` Set Is Never Cleared on Logout — Push Tokens Leak Between Users

**What:** `LiveActivityManager` is a singleton (`new _LiveActivityManager()`). The `tokenSaved` Set (line 84) tracks which entity IDs have had their push token saved to avoid duplicate upserts. But `endAll()` (line 437-442) clears the `active` map and persisted storage, but does NOT clear `tokenSaved`. When a different user logs in on the same device, if they happen to have an order with the same entity ID (unlikely but possible in testing/dev), the token save is skipped. More critically, `resetHydration()` (called on app resume and user change) also doesn't clear `tokenSaved`, so after logout → login, any new Live Activity for the same order ID won't register its push token.

**Where:** `LiveActivityManager.ts` line 84 (`tokenSaved`), line 437-442 (`endAll`), line 444-451 (`resetHydration`).

**Why critical:** Without a valid push token registered in `live_activity_tokens`, the server-side APNs push path cannot send updates to the Dynamic Island when the app is backgrounded. The Dynamic Island works while the app is in foreground (via realtime), but goes stale the moment the buyer locks their screen or switches apps. This is exactly when the Dynamic Island is most valuable.

**Gap:** Foreground experience is fine. Background experience (the primary use case for Dynamic Island) silently degrades. The buyer thinks the island is live but it's frozen. No error is visible anywhere.

**Fix:** Clear `tokenSaved` in `endAll()` and `resetHydration()`.

**Risk from fix:** Push tokens may be re-upserted on next activity start. This is a single lightweight DB call and is the correct behavior.

**Files:** `src/services/LiveActivityManager.ts` — add `this.tokenSaved.clear()` to `endAll()` and `resetHydration()`.

---

## Bug 4: Delivery Channel Passes Hardcoded `vehicle_type: null` — Dynamic Island Never Shows Vehicle Info

**What:** In the delivery assignment handler (line 295-300 of `useLiveActivityOrchestrator.ts`), the `buildLiveActivityData` call passes `vehicle_type: null` hardcoded. The `delivery_assignments` table likely has a `vehicle_type` column (or it's on a related table), but the realtime payload `row` never reads it. The `select` query for delivery assignments in `liveActivitySync.ts` (line 115) also only selects `order_id, eta_minutes, distance_meters, rider_name` — no `vehicle_type`.

**Where:** 
- `useLiveActivityOrchestrator.ts` line 299: `vehicle_type: null`
- `liveActivitySync.ts` line 115: `.select('order_id, eta_minutes, distance_meters, rider_name')`

**Why critical:** The iOS `LiveDeliveryAttributes.ContentState` has a `vehicleType` field. The Dynamic Island and Live Activity UI are designed to show whether delivery is by bike, car, etc. This field is always null, so the island shows a generic delivery indicator instead of the actual vehicle. For a buyer watching their delivery approach, knowing if it's a bike or car helps them visually identify the rider. It's a trust and completeness signal — the app "knows" the details but doesn't show them.

**Gap:** The `LiveActivityData` interface defines `vehicle_type`, the iOS widget reads it, the seller/admin may have configured it, but it's hardcoded to null in every code path. The entire pipeline exists but the data never flows through.

**Fix:** Add `vehicle_type` to both select queries and pass `row.vehicle_type ?? null` instead of hardcoded `null`.

**Risk from fix:** If `vehicle_type` doesn't exist on `delivery_assignments`, the query will fail. Need to verify column existence first. If absent, skip this fix — it's a schema gap, not a code fix.

**Files:** `src/hooks/useLiveActivityOrchestrator.ts` line 299, `src/services/liveActivitySync.ts` line 115.

---

## Bug 5: Polling Heartbeat's `lastKnownRef` Map Is Local to the Effect — Never Reconciles with Orchestrator State

**What:** The polling heartbeat (line 365-424) maintains its own `lastKnownRef` Map to track order statuses. But this map starts empty on every mount and is populated only from poll results. If the buyer has 3 active orders and the realtime channel handles the terminal transition for 2 of them (calling `LiveActivityManager.end()`), the polling heartbeat doesn't know about those terminations. On the next poll, it sees 1 active order, compares against its own `lastKnownRef` (which has all 3), and calls `LiveActivityManager.end()` for the 2 already-ended orders.

This triggers `end()` on already-ended entities. The `end()` method's `active.get(entityId)` returns undefined (already cleaned up), so it logs "END SKIP" and returns. **Functionally harmless** — but the real bug is the inverse case: if `lastKnownRef` starts empty and the first poll returns 3 orders, `hasMismatch` is true (all are new to the map), triggering a full `syncActiveOrders`. This happens EVERY time the effect remounts (which happens on `userId` change). Combined with the initial sync in the mount effect, this means the first poll cycle (15s after mount) triggers a redundant full sync that re-pushes all Live Activities.

**Where:** `useLiveActivityOrchestrator.ts` lines 372, 406-417 — `lastKnownRef` is scoped to the effect closure and initialized empty.

**Why critical:** The redundant sync at 15 seconds causes a visible "flash" on the Dynamic Island — the Live Activity is ended and re-started (or updated) with the same data, causing the progress bar and ETA to visually reset momentarily. On iOS, this manifests as the Dynamic Island briefly collapsing and re-expanding. For the buyer, it looks like a glitch — like the tracking restarted.

**Gap:** The initial mount sync provides correct state. The 15-second redundant sync then re-pushes the same state, causing a visible artifact. The system feels unstable — "why did my tracking restart?"

**Fix:** Seed `lastKnownRef` from the initial sync result. After `doSync()` in the mount effect, populate `lastKnownRef` with the current active order statuses so the first poll cycle doesn't treat everything as "changed." Implementation: export the last-synced order statuses from `syncActiveOrders` (return the Map), or initialize `lastKnownRef` from a query in the poll effect's setup phase (before starting the interval).

**Risk from fix:** Minimal. The seed query is the same query the poll already runs. Adding it once at interval setup doesn't change the steady-state behavior.

**Files:** `src/hooks/useLiveActivityOrchestrator.ts` — seed `lastKnownRef` before first interval tick.

---

## Implementation Order

| Priority | Bug | Impact | Effort |
|----------|-----|--------|--------|
| 1 | Bug 2 — `end()` fails after cold restart | Phantom Dynamic Islands after delivery | 5 min |
| 2 | Bug 3 — `tokenSaved` not cleared on logout | Background updates stop working | 2 min |
| 3 | Bug 1 — Delivery channel stale filter | Second order's island shows stale data | 3 min |
| 4 | Bug 5 — Polling seeds redundant sync | 15s Dynamic Island flash/glitch | 10 min |
| 5 | Bug 4 — `vehicle_type` always null | Missing vehicle info on island | 5 min (pending schema check) |

## Impact Analysis — What Gets Affected If All 5 Are Fixed

| Module | Impact | Risk |
|--------|--------|------|
| `LiveActivityManager.end()` | Now has native fallback — always ends the island | None |
| `LiveActivityManager.endAll()` / `resetHydration()` | Clears token tracking — correct for user switch | None |
| Delivery realtime channel | Broader event intake, client-side filtered | Negligible network |
| Polling heartbeat | No more redundant first-tick sync | None |
| `buildLiveActivityData` calls | May include vehicle_type | Schema-dependent |
| Push token registration flow | Tokens re-registered correctly after login | One extra upsert |

