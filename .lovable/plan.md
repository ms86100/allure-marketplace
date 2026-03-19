

# Remaining Unfixed Bugs from the 20-Bug Audit

## FIXED (confirmed in code):
- **Bug 1** — `failed` removed from terminal statuses + error handling with `invalidateStatusFlowCache()` on `22P02`
- **Bug 3** — Color dot now uses `className` with Tailwind class splitting
- **Bug 4** — `profile_image_url` is now used correctly in `update-delivery-location`
- **Bug 5** — `stalled_notified` reset logic added (movement > 100m)
- **Bug 8** — `doUpdate` guard: `if (!this.active.has(data.entity_id)) return;`
- **Bug 9** — `at_gate` added to `transit_statuses_la` defaults
- **Bug 10** — `en_route` removed from `transit_statuses_la` defaults
- **Bug 15** — APNs priority now uses `isTerminal ? "10" : "5"`
- **Bug 18** — `delivered` excluded from `getStartStatuses()` alongside `placed`
- **Bug 19** — Dynamic `MAX_ETA` using `initialEtaMinutes` with 15min default
- **Bug 20** — Quoted terminal statuses in `ActiveOrderStrip`

## STILL UNFIXED:

| # | Bug | Status | Why |
|---|-----|--------|-----|
| **2** | `delivered` has `is_terminal: false` in `seller_delivery` flow | **NOT FIXED** | Requires DB data update to `category_status_flows`. No migration was run. The conflicting values are still visible in the network response. |
| **6** | Proximity notification misses `at_gate` status | **NEEDS VERIFICATION** | The edge function was edited but needs confirmation the deployed version includes `at_gate` in the proximity block. |
| **7** | Delay detection misses `on_the_way` status | **NEEDS VERIFICATION** | Same — edge function was edited but needs deployment confirmation. |
| **11** | Realtime delivery channel has no filter | **NOT FIXED** | Channel still subscribes to ALL `delivery_assignments` globally with no Postgres filter. |
| **12** | Sync/heartbeat active set divergence | **NOT FIXED** | `liveActivitySync.ts` still uses `getStartStatuses()` (inclusion-based) while `doSync` in orchestrator uses terminal exclusion. The two definitions differ. |
| **13** | AnimatePresence ref warning | **NOT FIXED** | Low priority, cosmetic. No code change made. |
| **14** | Polling `lastKnownRef` cold start | **ACCEPTED AS-IS** | Per plan — harmless extra sync. |
| **16** | `order_number` not fetched | **NOT FIXED** | `liveActivitySync.ts` line 57 still selects `id, status, seller_id` without `order_number`. Skipped because column may not exist. |
| **17** | `delivery_en_route` dedup inconsistency | **ACCEPTED AS-IS** | Per plan — more conservative approach is fine. |

## Summary: 5 bugs remain actionable

1. **Bug 2** (High) — DB update needed: set `is_terminal = true` for `delivered` in `seller_delivery` flow in `category_status_flows`
2. **Bug 6 + 7** (Medium/High) — Verify the deployed edge function includes the status list changes. If not redeployed, these are still broken.
3. **Bug 11** (High) — Realtime channel scalability: add a Postgres filter to `delivery_assignments` subscription
4. **Bug 12** (Medium) — Align sync and heartbeat active order definitions

### Recommended implementation order:
1. Bug 2 — DB data update via insert tool
2. Bug 6 + 7 — Verify/redeploy edge function
3. Bug 11 — Add filter to realtime channel (requires dynamic resubscription when active order IDs change)
4. Bug 12 — Change `liveActivitySync` to use terminal-exclusion like the heartbeat

