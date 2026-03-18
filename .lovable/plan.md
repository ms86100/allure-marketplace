

# Fix Plan: Live Tracking + Live Activity + Deep Links

## Issue 1: Dynamic Island tap → 404

**Root cause confirmed:** `new URL('sociva://orders/UUID')` parses as:
- `protocol`: `sociva:`
- `hostname`: `orders` (treated as host, NOT path)
- `pathname`: `/UUID`

The deep link handler uses `url.pathname` → navigates to `/UUID` → 404.

**Fix:** In `useDeepLinks.ts`, for `sociva:` protocol, combine `url.hostname + url.pathname` to reconstruct the full path:
```
path = `/${url.hostname}${url.pathname}` → `/orders/UUID` ✓
```

Also add a fallback: if the resolved path doesn't match any known route pattern, navigate to `/orders` instead of the 404.

---

## Issue 2: Duplicate Live Activity Cards (Screenshot shows 3× "Your Order is Ready" + 1× "Preparing")

**Root cause:** Two interacting bugs:

**Bug A — Sync races hydration:** `syncActiveOrders` is called on mount and runs `LiveActivityManager.push()` for each active order. `push()` calls `hydrate()` internally, but the sync fetches orders in parallel. If the first `push()` is still hydrating, subsequent `push()` calls wait on the same hydration promise — but each then calls `startLiveActivity` because the first start hasn't completed yet. The `starting` Set guards against this per entity, but if two different code paths (order channel + sync) both call `push()` for the same order near-simultaneously, they can both pass the `starting` check.

**Bug B — Native duplicates not cleaned on update:** When `syncActiveOrders` runs after app resume, it may call `startLiveActivity` for an order that already has a native activity (from before app kill). The native side creates a NEW activity instead of updating the existing one. The `cleanupStaleActivities` only removes activities NOT in the valid list — it doesn't deduplicate multiple activities for the SAME entity.

**Fix (LiveActivityManager.ts):**
1. After `hydrate()` completes in `push()`, re-check `this.active.has(entity_id)` before starting — the hydration may have populated it.
2. In `_doHydrate()`, when native reports multiple activities for the same entityId, keep the latest and end the others.
3. Add a native-layer dedup: before `startLiveActivity`, call `getActiveActivities()` and check if one already exists for this entityId. If so, update instead of start.

---

## Issue 3: Map Rider Not Moving Smoothly

**Root cause analysis:** The `AnimatedRiderMarker` code is correct (2s ease-out animation with `requestAnimationFrame`). The real issue is **update frequency** — the GPS filter in `useDeliveryTracking` rejects points that are <3m apart (micro-jitter), which means at low speeds the marker stays still. Also, the assignment channel overwrites filtered positions with raw ones (Gap E from previous audit — the fix applied `filterGPSPoint` but may have been incomplete).

**Fix:**
1. In `useDeliveryTracking.ts`, verify the assignment channel handler applies `filterGPSPoint` correctly (check the actual code state after previous edits).
2. Lower the micro-jitter threshold from 3m to 1m for delivery tracking context — 3m is too aggressive for a moving scooter.
3. Ensure `speed_kmh` and `heading` from `delivery_locations` INSERT events are propagated through to `AnimatedRiderMarker` (currently they flow through but verify).

---

## Implementation Steps

| # | Task | File(s) |
|---|------|---------|
| 1 | Fix deep link URL parsing for `sociva://` scheme + add fallback | `src/hooks/useDeepLinks.ts` |
| 2 | Add native dedup guard in `push()` — check native activities before starting | `src/services/LiveActivityManager.ts` |
| 3 | Deduplicate same-entity activities during hydration | `src/services/LiveActivityManager.ts` |
| 4 | Add `await` guard in `syncActiveOrders` to serialize `push()` calls | `src/services/liveActivitySync.ts` |
| 5 | Lower GPS jitter threshold + verify assignment channel filtering | `src/lib/gps-filter.ts`, `src/hooks/useDeliveryTracking.ts` |

All changes are frontend/service-layer only — no database migrations needed.

