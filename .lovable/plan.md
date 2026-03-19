

# Production Audit: 20 Bugs Found

## BUG 1: ActiveOrderStrip query still includes `failed` — 400 error (CRITICAL)
**Today:** The network logs show `status=not.in.(delivered,completed,cancelled,no_show,failed)` returning `22P02: invalid input value for enum order_status: "failed"`. The `ActiveOrderStrip` query uses `getTerminalStatuses()` which no longer includes `failed` in `statusFlowCache.ts` — but the **DB response** from `category_status_flows` returns duplicate rows (both `cart_purchase` and `seller_delivery` transaction types), and `delivered` has conflicting `is_terminal` values (`true` for one, `false` for the other). The `getTerminalStatuses()` function deduplicates by using a Set, so `delivered` IS included. However, the 400 error persists in the network logs, meaning the deployed code still has `failed`.

**Root cause:** The code change to remove `failed` from `statusFlowCache.ts` was made but the **client is still running the old cached version**. The network request at `05:11:30Z` includes `failed`, but the later request at `05:12:30Z` does NOT include `failed` and returns 200. This is a **hot-reload race** — the fix IS deployed but earlier cached queries still fail.

**Should be:** No issue once the client fully refreshes. However, the `staleTime: jitteredStaleTime(30_000)` means the old failing query result is cached for 30 seconds. The query should handle 400 errors gracefully instead of silently returning `[]`.

**Fix:** Add error handling in `ActiveOrderStrip` queryFn — if the query returns a 400, invalidate `statusFlowCache` and retry without `failed`.

**Severity:** High (self-healing but produces 30s of broken state on each app load)

---

## BUG 2: `delivered` has conflicting `is_terminal` values in DB (CRITICAL)
**Today:** The `category_status_flows` response shows `delivered` with `is_terminal: true` (sort_order 70) AND `is_terminal: false` (sort_order 70) — one from `cart_purchase`, one from `seller_delivery`. The `getTerminalStatuses()` function iterates all entries and adds to a Set, so `delivered` IS in the terminal set. But `isTerminalStatus()` in `useCategoryStatusFlow.ts` checks a flow-specific array — if the seller_delivery flow has `is_terminal: false` for `delivered`, then `isTerminalStatus(sellerDeliveryFlow, 'delivered')` returns `false`.

**Should be:** For seller_delivery, `delivered` is intentionally non-terminal (because `completed` follows). But for Live Activities, `delivered` MUST end the activity. The Live Activity system correctly handles this because `getTerminalStatuses()` unions across all flows AND adds `delivered` as a safety net. However, the `OrderDetailPage` OTP fix relies on the hardcoded `['delivered', 'completed'].includes(order.status)` — this is correct but fragile.

**Fix:** The `seller_delivery` flow should mark `delivered` as `is_terminal = true` in the DB, or the system should have a separate concept of "delivery-complete" vs "order-terminal."

**Severity:** High (architectural inconsistency causing confusion across subsystems)

---

## BUG 3: `ActiveOrderStrip` color dot renders Tailwind class string as inline `backgroundColor` (Medium)
**Today:** `order.color` is set from `category_status_flows.color` which contains values like `"bg-yellow-100 text-yellow-700"` (Tailwind classes). The template renders `style={{ backgroundColor: order.color }}` — this sets `background-color: "bg-yellow-100 text-yellow-700"` which is invalid CSS. The dot is invisible.

**Should be:** Either parse the Tailwind color class to extract an actual color, or use `className` instead of `style`.

**Fix:** Change to `className={cn("w-2 h-2 rounded-full shrink-0", order.color?.split(' ')[0])}` or extract a hex color from a mapping.

**Severity:** Medium (cosmetic — dot never renders)

---

## BUG 4: `update-delivery-location` queries `seller_profiles.logo_url` — column is `profile_image_url` (High)
**Today:** At line 491, the edge function selects `business_name, logo_url` from `seller_profiles`. The orchestrator and sync code use `profile_image_url`. If the actual column is `profile_image_url`, the edge function query silently returns `null` for the logo, and the APNs Live Activity push never includes the seller logo.

**Should be:** Use the correct column name consistently.

**Fix:** Change `logo_url` to `profile_image_url` in `update-delivery-location/index.ts` line 491.

**Severity:** High (branded seller logos never appear on the Dynamic Island via APNs push)

---

## BUG 5: `stalled_notified` flag never resets — stale detection is one-shot (Medium)
**Today:** In `update-delivery-location`, once `stalled_notified` is set to `true` (line 325), it never resets. If the rider starts moving again and then stalls a second time, no new stall notification is sent.

**Should be:** Reset `stalled_notified` to `false` when meaningful movement resumes (e.g., distance delta > 100m).

**Fix:** Add `stalled_notified: false` to the main update payload when the rider has moved significantly since the last location.

**Severity:** Medium (missed stall notifications on second occurrence)

---

## BUG 6: Proximity notification triggers at <500m but checks `['picked_up', 'on_the_way']` — misses `at_gate` (Medium)
**Today:** The proximity notification block (line 377) only fires for statuses `picked_up` and `on_the_way`. If the delivery assignment status is `at_gate` (rider is at the society gate), no proximity notification is sent even though the rider is physically close.

**Should be:** Include `at_gate` in the proximity check statuses.

**Fix:** Change `['picked_up', 'on_the_way']` to `['picked_up', 'on_the_way', 'at_gate']` at line 377.

**Severity:** Medium (missed "arriving now" notification when rider is at gate)

---

## BUG 7: Delivery delay detection only checks `['picked_up', 'at_gate']` — misses `on_the_way` (High)
**Today:** Smart delay detection (line 331) only triggers for `picked_up` and `at_gate`. But `on_the_way` is the primary transit status where delays matter most — ETA spikes and heading reversals during active transit are the exact scenario this was designed for.

**Should be:** Include `on_the_way` in delay detection statuses.

**Fix:** Change `['picked_up', 'at_gate']` to `['picked_up', 'on_the_way', 'at_gate']` at line 331.

**Severity:** High (delay notifications silently suppressed during the most important transit phase)

---

## BUG 8: Throttle can silently drop the final status update (High)
**Today:** `LiveActivityManager.throttledUpdate` schedules a delayed update if called within the 5s throttle window. If two rapid updates arrive (e.g., `on_the_way` then `delivered` within 5s), the first is throttled and the `delivered` goes through `push()` which calls `end()`. But the pending timer from the first update may still fire after `end()` has already removed the entry, causing a stale `doUpdate()` call on a nonexistent entry. The `doUpdate` method doesn't check if the entry still exists in `this.active`.

**Should be:** `doUpdate` should verify the entry is still active before calling `updateLiveActivity`.

**Fix:** Add `if (!this.active.has(data.entity_id)) return;` at the top of `doUpdate`.

**Severity:** High (can cause "activity not found" native errors after terminal transition)

---

## BUG 9: `transit_statuses_la` defaults don't include `at_gate` but `liveActivityMapper` hardcodes it (Medium)
**Today:** `trackingConfig.ts` defaults `transit_statuses_la` to `['en_route', 'on_the_way', 'picked_up']`. But in `liveActivityMapper.ts` line 110, `at_gate` is hardcoded into the transit set: `new Set([...config.transit_statuses_la, 'at_gate'])`. Meanwhile, `update-delivery-location` line 455 uses `['picked_up', 'on_the_way', 'at_gate']` for LA push eligibility. The transit status lists are inconsistent across client and server.

**Should be:** A single source of truth for transit statuses, ideally from the database.

**Fix:** Add `at_gate` to the `transit_statuses_la` default, or better, make the edge function read from `system_settings` too.

**Severity:** Medium (inconsistent ETA progress calculations between client and APNs)

---

## BUG 10: `en_route` is in `transit_statuses_la` but is not a valid `order_status` enum value (Medium)
**Today:** `transit_statuses_la` defaults include `en_route`, but the `order_status` enum doesn't have `en_route` — the actual status is `on_the_way`. The `en_route` value never matches any order status, making it dead code in the transit check.

**Should be:** Remove `en_route` from the default or map it correctly.

**Fix:** Remove `en_route` from `transit_statuses_la` defaults in `trackingConfig.ts`.

**Severity:** Medium (dead code, misleading)

---

## BUG 11: Realtime delivery channel has no filter — receives ALL delivery_assignments globally (High)
**Today:** The delivery assignment channel in `useLiveActivityOrchestrator.ts` (line 253-256) subscribes to ALL INSERT and UPDATE events on `delivery_assignments` without any filter. Every delivery assignment update from every seller/order in the system hits every buyer's client. The `handleDeliveryChange` function filters by `activeOrderIdsRef`, but the bandwidth and processing cost is proportional to total platform activity, not the user's orders.

**Should be:** Use a Postgres filter like `filter: order_id=in.(${activeOrderIds})` or at minimum filter by `order_id` on the channel subscription.

**Fix:** Add a filter to the channel subscription, or accept the current client-side filtering with a note that this won't scale past ~100 concurrent deliveries.

**Severity:** High (scalability — every buyer processes every delivery update)

---

## BUG 12: `syncActiveOrders` uses `getStartStatuses()` which excludes `placed` — misses placed orders (Medium)
**Today:** `liveActivitySync.ts` line 49 uses `getStartStatuses()` which explicitly excludes `placed`. If an order is in `placed` status, it won't be synced. This is intentional for Live Activities (don't start until accepted), but the `activeOrderIdsRef` in the orchestrator is populated from a different query (polling heartbeat uses terminal exclusion, not start inclusion). This means the two sets can diverge.

**Should be:** Both sync and polling should use the same definition of "active order."

**Severity:** Medium (potential state desync between sync and heartbeat)

---

## BUG 13: `AnimatePresence` wraps function components without `forwardRef` (Low)
**Today:** Console log shows "Function components cannot be given refs" warning from `AnimatePresence` in `ActiveOrderStrip`. `motion.div` inside `AnimatePresence` needs the component to forward refs for exit animations to work. Without it, exit animations silently fail — orders disappear instantly instead of animating out.

**Should be:** No functional breakage but exit animations don't work.

**Fix:** This is actually a framer-motion version issue. The `motion.div` elements ARE native HTML, so they do support refs. The warning is likely from a sibling component. Investigate the exact component tree.

**Severity:** Low (cosmetic — no exit animation)

---

## BUG 14: Polling heartbeat `lastKnownRef` is local to the effect — resets on every `userId` change (Medium)
**Today:** The polling heartbeat (line 303) creates `lastKnownRef` as a local `new Map()` inside the effect. If `userId` changes (logout/login), a new interval starts with an empty map, which is correct. But if the component re-renders without `userId` changing, the effect doesn't re-run (stable dep), so the map persists correctly. However, the map is never seeded — on the first poll, ALL orders appear as "changed" triggering a sync. This is a wasted sync on every app load + 45 seconds.

**Should be:** Pre-seed `lastKnownRef` from the initial `doSync` call, or accept the one extra sync as a safety net.

**Severity:** Low (one redundant sync, not harmful)

---

## BUG 15: APNs push uses hardcoded `apns-priority: "10"` — drains battery (Medium)
**Today:** Every Live Activity update push is sent with `apns-priority: 10` (immediate delivery). Apple recommends priority `5` for content updates that can be coalesced.

**Should be:** Use priority `10` only for terminal states (end events) and priority `5` for routine updates.

**Fix:** Set `"apns-priority": isTerminal ? "10" : "5"` in the APNs push headers.

**Severity:** Medium (battery drain, Apple may throttle high-priority pushes)

---

## BUG 16: `order_number` field not fetched in orchestrator queries — short ID always derived from UUID (Low)
**Today:** The orchestrator fetches `orders.select('id, status, seller_id')` without `order_number`. The `buildLiveActivityData` function calls `deriveOrderShortId(order.id, order.order_number)` — but `order_number` is always undefined, so it falls back to the last 4 hex chars of the UUID. If the `orders` table has an `order_number` column with human-friendly values, they're never used on the Dynamic Island.

**Should be:** Include `order_number` in the select query.

**Fix:** Add `order_number` to the select in `useLiveActivityOrchestrator.ts` line 36 and `liveActivitySync.ts` line 58.

**Severity:** Low (cosmetic — UUID-based short IDs work but are less recognizable)

---

## BUG 17: `delivery_en_route` notification dedup checks count but doesn't use 30s cooldown (Medium)
**Today:** The en_route notification (line 273-296) only checks if ANY previous `delivery_en_route` notification exists for this order — ever. It doesn't use the 30s cooldown that proximity and delay notifications use. This means if the first insert fails or is deleted, no retry is possible.

**Should be:** Consistent dedup strategy. Either all use cooldowns or all use existence checks.

**Severity:** Low (edge case — the existence check is actually more conservative)

---

## BUG 18: `delivered` in `seller_delivery` flow has `is_terminal: false` — Live Activity won't start on `delivered` (Medium)
**Today:** `getStartStatuses()` returns all non-terminal, non-placed statuses. For `seller_delivery`, `delivered` has `is_terminal: false`, so it's included in START_STATUSES. This means if an order jumps directly to `delivered` (edge case), the Live Activity system would try to START a new activity for a semantically terminal state, then immediately end it when `getTerminalStatuses()` (which includes `delivered` as a safety net) processes it. This creates a start→immediate end race.

**Should be:** `delivered` should never be a start status. Add `delivered` to the exclusion list in `getStartStatuses()` alongside `placed`.

**Fix:** Change line 52 of `statusFlowCache.ts` to: `if (!e.is_terminal && e.status_key !== 'placed' && e.status_key !== 'delivered')`.

**Severity:** Medium (race condition — brief phantom Live Activity for delivered orders)

---

## BUG 19: `ETA` progress uses hardcoded `MAX_ETA = 45` minutes — inaccurate for short deliveries (Medium)
**Today:** `liveActivityMapper.ts` line 115 uses `MAX_ETA = 45` minutes. For intra-society deliveries that take 5-10 minutes, an ETA of 5 minutes maps to `1 - 5/45 = 0.89` — the progress bar shows 89% from the moment transit starts. This is misleading.

**Should be:** `MAX_ETA` should be derived from the initial ETA or `delivery_time_stats` for the seller/society pair. A 10-minute max for short deliveries would produce `1 - 5/10 = 0.5` — much more meaningful.

**Fix:** Pass initial ETA or a max-ETA parameter, or use the seller's historical avg delivery time.

**Severity:** Medium (misleading progress bar, undermines user trust)

---

## BUG 20: `doSync` in orchestrator uses quoted terminal statuses but `ActiveOrderStrip` doesn't (High)
**Today:** The orchestrator's `doSync` (line 54) builds the terminal filter as `(${terminalArr.map(s => `"${s}"`).join(',')})` — with quotes around each status. The `ActiveOrderStrip` (line 47) builds it as `(${terminalArr.join(',')})` — without quotes. PostgREST's `not.in.()` filter accepts both forms, but the inconsistency suggests copy-paste divergence. More critically, if any status contains a comma or special character, the unquoted version would break.

**Should be:** Both should use the same quoting strategy. The quoted version is safer.

**Fix:** Update `ActiveOrderStrip` to use quoted values: `(${terminalArr.map(s => `"${s}"`).join(',')})`.

**Severity:** Low (works today but fragile)

---

## Implementation Plan

| # | Bug | Fix | File(s) |
|---|-----|-----|---------|
| 1 | `failed` cached query race | Add error retry in queryFn | `ActiveOrderStrip.tsx` |
| 2 | `delivered` is_terminal conflict | DB migration to set `is_terminal = true` for seller_delivery delivered | Migration |
| 3 | Color dot invalid CSS | Use className instead of style | `ActiveOrderStrip.tsx` |
| 4 | Wrong column `logo_url` | Change to `profile_image_url` | `update-delivery-location/index.ts` |
| 5 | `stalled_notified` never resets | Reset on significant movement | `update-delivery-location/index.ts` |
| 6 | Proximity misses `at_gate` | Add `at_gate` to status list | `update-delivery-location/index.ts` |
| 7 | Delay detection misses `on_the_way` | Add `on_the_way` to status list | `update-delivery-location/index.ts` |
| 8 | Throttle drops final update | Guard `doUpdate` with active check | `LiveActivityManager.ts` |
| 9 | Inconsistent transit status lists | Unify defaults | `trackingConfig.ts` |
| 10 | `en_route` is dead code | Remove from defaults | `trackingConfig.ts` |
| 11 | Global delivery channel | Add filter or document scalability limit | `useLiveActivityOrchestrator.ts` |
| 12 | Sync/heartbeat active set divergence | Align definitions | `liveActivitySync.ts` |
| 13 | AnimatePresence ref warning | Investigate component tree | `ActiveOrderStrip.tsx` |
| 14 | Polling `lastKnownRef` cold start | Accept as-is (harmless extra sync) | N/A |
| 15 | APNs priority always 10 | Use priority 5 for updates | `update-live-activity-apns/index.ts` |
| 16 | `order_number` not fetched | Add to select queries | Orchestrator + Sync |
| 17 | en_route dedup inconsistency | Accept as-is (more conservative) | N/A |
| 18 | `delivered` in START_STATUSES | Exclude from getStartStatuses | `statusFlowCache.ts` |
| 19 | Hardcoded MAX_ETA = 45 | Use dynamic max from delivery stats | `liveActivityMapper.ts` |
| 20 | Inconsistent quoting in filters | Standardize quoting | `ActiveOrderStrip.tsx` |

**Priority order for fixes:** 4 → 7 → 8 → 18 → 2 → 3 → 5 → 6 → 9 → 10 → 15 → 16 → 11 → 19 → 20 → 1 → 12 → 13 → 14 → 17

