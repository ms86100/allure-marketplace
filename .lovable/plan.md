

# Fix Plan: Live Tracking + Dynamic Island 404

## Issue 1: Live Tracking Not Updating Continuously

### Root Cause
`useDeliveryTracking.ts` relies **exclusively** on two Supabase Realtime channels:
1. `tracking-assignment-{id}` — listens for `delivery_assignments` UPDATE
2. `tracking-location-{id}` — listens for `delivery_locations` INSERT

There is **no polling fallback**. On iOS, when the app transitions between foreground/background states, Supabase Realtime WebSocket connections can silently drop without triggering `CHANNEL_ERROR`. The buyer sees stale location data until they re-mount the component (navigate away and back).

The Live Activity orchestrator has a 45-second polling heartbeat, but that only syncs **order status** for Dynamic Island — it does NOT update the in-app tracking map/location state.

### Fix
Add a polling fallback to `useDeliveryTracking.ts` with adaptive intervals:
- **Poll `delivery_assignments`** every 10 seconds when in transit, 30 seconds otherwise
- If a realtime event arrives, reset the poll timer (avoid redundant fetches)
- On each poll, compare `last_location_at` — only update state if newer data exists
- Add channel status monitoring: if `CHANNEL_ERROR` or `TIMED_OUT`, increase poll frequency
- Add `visibilitychange` listener to immediately poll when app returns to foreground

```text
Architecture:
┌─────────────────────────────────┐
│   useDeliveryTracking           │
│                                 │
│  Primary: Realtime channels ────┤──► location updates
│                                 │
│  Fallback: Adaptive polling ────┤──► every 10s (transit) / 30s (idle)
│                                 │
│  Resume: visibilitychange ──────┤──► immediate poll on foreground
│                                 │
│  Channel monitor ───────────────┤──► if degraded, poll at 5s
└─────────────────────────────────┘
```

### Files Changed
- `src/hooks/useDeliveryTracking.ts` — Add polling fallback + visibility listener + channel health monitoring

---

## Issue 2: Dynamic Island Tap → 404 Page

### Root Cause
Two compounding problems:

**Problem A: Deep link lost during auth hydration.**
When the app is cold-started from a Dynamic Island tap (`sociva://orders/{UUID}`), the sequence is:
1. `useDeepLinks` fires `navigate('/orders/UUID')` immediately
2. But `AuthProvider` hasn't hydrated yet — `user` is null
3. `ProtectedRoute` sees no user → redirects to `/landing`
4. Auth session restores from storage → user now exists, but the deep link path (`/orders/UUID`) is lost

**Problem B: NotFound page is a dead end on cold start.**
- "Go Back" uses `window.history.back()` — on cold start there's no history, so nothing happens
- "Home" uses `<Link to="/">` which should work, but if auth isn't ready it may redirect to `/landing` again

### Fix

1. **`useDeepLinks.ts`**: Store the pending deep link path in `sessionStorage` before calling `navigate()`. This creates a "deferred deep link" that survives auth hydration.

2. **`App.tsx` (AppRoutes or ProtectedRoute area)**: After auth hydration completes (user becomes non-null), check `sessionStorage` for a pending deep link and navigate to it.

3. **`NotFound.tsx`**: Fix the "Go Back" button to use `navigate('/')` when `window.history.length <= 1` (cold start). Fix "Home" to use `useNavigate` for programmatic navigation.

### Files Changed
- `src/hooks/useDeepLinks.ts` — Save pending path to sessionStorage + add deferred navigation
- `src/pages/NotFound.tsx` — Fix Go Back for cold-start scenarios
- `src/App.tsx` — Add pending deep link consumer after auth ready

---

## Summary

| Issue | Root Cause | Fix | Risk |
|-------|-----------|-----|------|
| Tracking stops updating | No polling fallback for Realtime | Adaptive polling + visibility listener | Low — additive |
| Dynamic Island → 404 | Deep link fires before auth ready | Deferred deep link via sessionStorage | Low — simple guard |
| 404 page dead end | `history.back()` fails on cold start | Fallback to `navigate('/')` | None |

