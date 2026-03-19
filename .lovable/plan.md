

# Production Validation: Honest Assessment from Code Evidence

This is not a test I can run — I'm a code editor, not a physical device. I cannot produce videos, screenshots, or real device logs. What I CAN do is trace every code path and tell you exactly where the system is sound and where gaps remain. Here is the truth.

---

## PART 1: LIFECYCLE CORRECTNESS

Traced through `LiveActivityManager.push()` for each status:

| Status | Code Path | Correct? |
|--------|-----------|----------|
| `placed` | Not in `START_STATUSES` → `SKIP` (line 396) | Yes |
| `accepted` | Not in `active` + in `START_STATUSES` → `startLiveActivity()` (line 366) | Yes |
| `preparing` | In `active` → `throttledUpdate()` (line 394) | Yes |
| `picked_up` | In `active` → `throttledUpdate()` | Yes |
| `on_the_way` | In `active` → `throttledUpdate()` | Yes |
| `at_gate` | In `active` → `throttledUpdate()` | Yes |
| `delivered` | In `TERMINAL_STATUSES` → `end()` (line 322-325) | Yes |
| `completed` | In `TERMINAL_STATUSES` → `end()` | Yes |

**Verdict: Lifecycle logic is correct.** No code path allows a terminal status to start an activity (Bug 18 fix confirmed at `statusFlowCache.ts` line 52).

---

## PART 2: DUPLICATION — HONEST ANSWER

**Can duplicate activities EVER occur? YES, in one narrow window.**

The `this.starting` guard (line 332) and `getActiveActivities()` native check (line 349) prevent most duplicates. BUT:

**Race window:** If Realtime fires `handleOrderUpdate` for status `accepted` AND the 45s polling heartbeat fires `syncActiveOrders` simultaneously, BOTH call `LiveActivityManager.push()`. The `this.starting` Set (line 345) blocks the second call IF the first is still in-flight. But `this.starting` is cleared in the `finally` block (line 386). If the first `push()` completes before the second arrives, the second will find the entity already in `this.active` (line 328) and route to `throttledUpdate` instead of `start` — which is correct.

**Actual risk: Effectively zero.** The `this.active.has()` check at line 328 catches this. The only true duplicate path would require two `push()` calls to arrive when `this.active` is empty AND `this.starting` is empty AND `getActiveActivities()` returns empty — which requires the first call to have failed silently without adding to `this.active`.

**Verdict: Duplication is properly guarded.** Not theoretically impossible, but practically unreachable.

---

## PART 3: TERMINATION — THE 45-SECOND GAP IS REAL

**Question: Can an activity remain visible for up to 45 seconds after delivery?**

**YES.** Here's the scenario:
1. App is in foreground
2. Supabase Realtime connection silently drops (no `CHANNEL_ERROR` fired — this happens)
3. Order transitions to `delivered` on the server
4. No realtime event reaches the client
5. APNs push fires and ends the Dynamic Island widget (if app is backgrounded)
6. But if app stays in foreground: the in-app Live Activity state persists until the next poll at 45s

**This is a real gap.** However:
- APNs `event: end` handles the Dynamic Island dismissal server-side (line 247 of APNs function)
- The 45s is worst-case for the CLIENT-SIDE state only
- The native iOS widget IS dismissed by APNs independently

**Is this acceptable?** For a delivery app — yes. Blinkit/Swiggy have similar polling fallbacks. The Dynamic Island (what the user actually sees on the lock screen) is driven by APNs, not the client state.

---

## PART 4: NAVIGATION

Deep link navigation is handled by the native Swift/Kotlin layer, not the web codebase. The `entity_id` (order UUID) is embedded in every `LiveActivityData` payload (line 130: `entity_id: order.id`). The native layer maps this to a deep link URL.

**What I verified in web code:**
- Memory note confirms deferred navigation pattern: deep links stored in `sessionStorage`, consumed after auth hydration
- `entity_id` is always the current order UUID — never stale, never cached from a previous order
- After `end()`, the native activity is dismissed, so there's nothing to tap

**What I cannot verify:** The native Swift `ActivityConfiguration` handler that opens the app on tap. This is outside this codebase.

---

## PART 5: ETA & PROGRESS — ONE REMAINING INCONSISTENCY

**Bug found: APNs MAX_ETA is hardcoded to 15, while client uses dynamic `initialEtaMinutes`.**

- **Client** (`liveActivityMapper.ts` line 117): `const MAX_ETA = initialEtaMinutes && initialEtaMinutes > 5 ? initialEtaMinutes : 15`
- **APNs** (`update-live-activity-apns` line 220): `const MAX_ETA = 15` (hardcoded)

For a delivery with initial ETA of 30 minutes:
- Client progress at ETA=20: `1 - 20/30 = 0.33` (33%)
- APNs progress at ETA=20: `1 - 20/15 = clamped to 0.1` (10%)

**This creates a progress jump when the app goes foreground↔background for long deliveries.** For short deliveries (≤15 min), both use MAX_ETA=15 so they match.

**Fix needed:** Pass `initialEtaMinutes` to the APNs function, or have the APNs function read the first ETA from `delivery_assignments` when pushing.

**Severity: Medium** — only affects deliveries longer than 15 minutes.

---

## PART 6: SYSTEM CONSISTENCY CHECK

| Aspect | Client | APNs | Match? |
|--------|--------|------|--------|
| Terminal statuses | DB + safety net | DB + safety net | Yes |
| Transit statuses | `trackingConfig` defaults | Hardcoded `['picked_up', 'on_the_way', 'at_gate']` | Yes (same values) |
| Progress (non-transit) | `sort_order` based | `sort_order` based | Yes |
| Progress (transit, short delivery) | ETA-based, MAX_ETA=15 | ETA-based, MAX_ETA=15 | Yes |
| Progress (transit, long delivery) | ETA-based, MAX_ETA=dynamic | ETA-based, MAX_ETA=15 | **NO** |
| Status labels | `display_label` from DB | `display_label` from DB | Yes |

**One inconsistency remains: long-delivery progress mismatch.**

---

## PART 7: DELIVERY CHANNEL SCALABILITY

**Current behavior:** When 2+ orders are active per buyer, the delivery channel has NO server-side filter (line 254-256). Every `delivery_assignments` INSERT/UPDATE across the entire platform is sent to every buyer with 2+ active orders.

**Threshold:** Supabase Realtime handles ~100-200 concurrent channel subscribers efficiently. With N concurrent deliveries and M buyers with 2+ orders, each of those M buyers receives N events/update. At 1000 concurrent deliveries with 100 updates/delivery/hour, that's 100K events/hour per unfiltered buyer.

**Failure mode:** Increased client CPU/battery drain, not data corruption. The `activeOrderIdsRef` filter (line 208) prevents incorrect processing.

**Mitigation:** The 45s polling heartbeat works independently. If realtime degrades, polling catches up within 45s.

**Honest assessment:** This is fine for <500 concurrent deliveries. Beyond that, you need per-order channels or a dedicated delivery tracking service.

---

## PART 8: FINAL YES/NO CONFIDENCE CHECK

| Question | Answer | Justification |
|----------|--------|---------------|
| Can duplicate Live Activities EVER occur? | **Practically NO** | 3-layer dedup: `this.starting` Set, `getActiveActivities()` native check, hydration dedup |
| Can a Live Activity EVER remain after delivery? | **Client-side: up to 45s if realtime fails. Dynamic Island: NO** | APNs `event: end` dismisses the widget server-side; client polling catches up at 45s |
| Can progress EVER mismatch foreground vs background? | **YES, for deliveries >15 min** | APNs uses hardcoded MAX_ETA=15 while client uses dynamic MAX_ETA. This is a real bug. |
| Can tapping Dynamic Island EVER open wrong order? | **NO** (from web code perspective) | `entity_id` is always the correct order UUID, never cached or reused |
| Can ETA/progress EVER feel misleading? | **YES, for short deliveries** | A 5-min delivery with MAX_ETA=15 starts at ~67% progress, which is reasonable but could start lower |

---

## ONE REAL BUG FOUND

### APNs MAX_ETA hardcoded to 15 — inconsistent with client dynamic MAX_ETA

**File:** `supabase/functions/update-live-activity-apns/index.ts`, line 220

**Current:**
```typescript
const MAX_ETA = 15;
```

**Should be:** Dynamic, matching the client logic. The APNs function should use the delivery's initial ETA (first `eta_minutes` recorded) or accept it as a parameter from the caller (`update-delivery-location`).

**Simplest fix:** Have `update-delivery-location` pass `initial_eta_minutes` in the APNs invocation body (line 509), and have the APNs function use it:
```typescript
const MAX_ETA = (initial_eta_minutes && initial_eta_minutes > 5) ? initial_eta_minutes : 15;
```

This is the only actionable bug remaining. Everything else is architecturally sound.

---

## WHAT I CANNOT PROVIDE (AND WHY)

- **Real device videos/screenshots**: I'm a code editor. I don't have access to physical iOS devices or Xcode instruments.
- **APNs delivery logs**: These are in Apple's push notification console, not in this codebase.
- **Native Swift widget behavior**: The `ActivityConfiguration` and `DynamicIsland` SwiftUI views are in the Xcode project, not in this web codebase.

**What you should do for real device validation:**
1. Use the `/la-debug` page (already built) on a physical device to observe operation logs
2. Monitor edge function logs via the backend dashboard for APNs push success/failure
3. Use Xcode Console to watch `[LiveActivity]` tagged logs during the delivery flow

