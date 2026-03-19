

# Verification: What's Actually Implemented vs. Claimed

After reading every affected file and querying the database, here is the honest status of all 20 bugs:

## ACTUALLY FIXED (verified in code + DB):

| Bug | Claim | Verified |
|-----|-------|----------|
| **1** | `failed` removed + `22P02` error handling | Yes — `statusFlowCache.ts` line 41 has no `failed`, `ActiveOrderStrip` line 53 handles `22P02` |
| **2** | DB update `is_terminal=true` for seller_delivery `delivered` | Yes — DB query confirms both rows now have `is_terminal: true` |
| **3** | Color dot uses `className` instead of `style` | Yes — line 118 uses `className={...order.color.split(' ')[0]}` |
| **4** | `profile_image_url` in edge function | Yes — line 500 uses `profile_image_url` |
| **5** | `stalled_notified` reset on movement >100m | Yes — lines 256-268 implement `resetStalled` logic |
| **6** | Proximity includes `at_gate` | Yes — line 386: `['picked_up', 'on_the_way', 'at_gate']` |
| **7** | Delay detection includes `on_the_way` | Yes — line 340: `['picked_up', 'on_the_way', 'at_gate']` |
| **8** | `doUpdate` guard check | Yes — line 485: `if (!this.active.has(data.entity_id)) return;` |
| **9** | `at_gate` in `transit_statuses_la` defaults | Yes — line 45: `['on_the_way', 'picked_up', 'at_gate']` |
| **10** | `en_route` removed from defaults | Yes — no longer in `transit_statuses_la` |
| **11** | Realtime filter on delivery channel | Partially — line 253-254: applies `eq` filter only when exactly 1 active order; falls back to no filter for 2+ orders |
| **12** | Sync uses terminal-exclusion | Yes — `liveActivitySync.ts` line 49 uses `getTerminalStatuses()` and `.not('status', 'in', ...)` |
| **15** | APNs priority `5` for updates, `10` for terminal | Yes — line 259: `isTerminal ? "10" : "5"` |
| **18** | `delivered` excluded from `getStartStatuses` | Yes — line 52: `e.status_key !== 'delivered'` |
| **19** | Dynamic MAX_ETA from `initialEtaMinutes` | Yes — line 117: uses `initialEtaMinutes` param with 15m default |
| **20** | Quoted terminal statuses in `ActiveOrderStrip` | Yes — line 47: `.map(s => \`"${s}"\`)` |

## NOT FULLY FIXED — still has gaps:

| Bug | Issue | Detail |
|-----|-------|--------|
| **11** | Realtime filter only works for 1 order | When 2+ orders are active, `filter` is `undefined` (line 255), so it falls back to **no server-side filter** — the original scalability problem. Supabase Realtime `in` filters are not supported on channels, so the fix only helps single-order scenarios. This was honestly acknowledged in the code comment but the previous summary claimed it was fully fixed. |
| **13** | AnimatePresence ref warning | Marked as "not fixed" in the plan and accepted. No code change was ever made. The previous summaries did not claim it was fixed, so this is fine. |
| **16** | `order_number` not fetched | `liveActivitySync.ts` line 59 still selects `'id, status, seller_id'` without `order_number`. The orchestrator's `doSync` (line 52) also doesn't fetch it. The previous summary said "skipped as column doesn't exist" — but this was never verified by querying the DB schema. |

## ACCEPTED AS-IS (correctly not fixed per plan):
- **Bug 14** — Polling `lastKnownRef` cold start (harmless extra sync)
- **Bug 17** — `delivery_en_route` dedup (more conservative approach is fine)

## Summary: What was hallucinated

Only **Bug 11** was overstated. The fix is real but partial — it only applies a Postgres filter when exactly 1 active order exists. For 2+ concurrent orders, every buyer still receives all global `delivery_assignments` events. The Supabase Realtime API does not support `in` filters on channels, so there is no clean server-side fix for the multi-order case. The client-side filtering (line 207: `activeOrderIdsRef.current.has(row.order_id)`) remains the actual mitigation.

Everything else (Bugs 1-10, 12, 15, 18-20) is genuinely implemented and verified in the current codebase. Bug 2's DB update was also confirmed executed.

