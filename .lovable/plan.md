

## P0 Fix: Navigation Deadlock on Live Activity → Order Summary

### Root Causes Found

**Bug A — Double history push (back button loops to same page):**
`useDeepLinks.ts` line 100-101 does TWO things: stores the path as pending AND calls `navigate(path)` immediately. Then `AppRoutes` line 324-333 consumes the pending deep link and calls `navigate(pendingPath)` AGAIN after auth hydration. Result: history stack = `[/orders/123, /orders/123]`. When user taps back, `navigate(-1)` pops to the first duplicate — same page reloads.

**Bug B — BottomNav hidden with no escape (the actual trap):**
`OrderDetailPage.tsx` line 190:
```tsx
showNav={!hasSellerActionBar && !hasBuyerActionBar && (isTerminalStatus(...) || (isBuyerView && isFirstFlowStep(...)))}
```
For a buyer viewing "preparing" status: no action bar exists (buyer has no actions), not terminal, not first step → `showNav=false`. The nav is hidden precisely when there's nothing else to navigate with. This is a dead end **even without deep links** — the only exit is the back button, which is broken by Bug A.

**Bug C — Flow loading race hides everything:**
While `isFlowLoading=true`, both `hasSellerActionBar` and `hasBuyerActionBar` are `false`, AND `isTerminalStatus`/`isFirstFlowStep` return `false` (empty flow array). So during flow loading, nav is hidden AND action bars are hidden. Combined with Bug A, the user sees a page with zero navigation for the first 1-2 seconds.

### Fix Plan

**1. Fix double navigation in deep links** (`src/hooks/useDeepLinks.ts`):
- Remove the immediate `navigate(path)` call on line 101. Only store as pending via `setPendingDeepLink(path)`.
- The deferred consumer in `AppRoutes` (line 324-333) already handles navigation after auth hydration — that's the single source of truth.
- For warm-start (app already open, `appUrlOpen` fires), check if current location already matches the deep link path before navigating to avoid duplicates.

**2. Fix BottomNav visibility logic** (`src/pages/OrderDetailPage.tsx` line 190):
- Change `showNav` to: show nav whenever there's no action bar. The action bar replaces the nav (they share the same bottom space). When no action bar is present, nav must always be visible as an escape route.
- Before: `showNav={!hasSellerActionBar && !hasBuyerActionBar && (isTerminalStatus(...) || isFirstFlowStep(...))}`
- After: `showNav={!hasSellerActionBar && !hasBuyerActionBar}`
- This guarantees a visible exit path for every order status where no action bar is rendered.

**3. Deduplicate deferred navigation** (`src/App.tsx` line 324-333):
- Before navigating to pending deep link, check if `window.location.hash` already contains the target path. Skip navigation if already there (handles warm-start case where immediate navigate already fired before this fix).

### Files Changed

| File | Change |
|---|---|
| `src/hooks/useDeepLinks.ts` | Remove immediate `navigate(path)`, keep only `setPendingDeepLink`. For warm-start, check current path before navigating. |
| `src/pages/OrderDetailPage.tsx` | Simplify `showNav` to `!hasSellerActionBar && !hasBuyerActionBar` |
| `src/App.tsx` | Add path dedup check in deferred deep link consumer |

### Expected Result
- Back button navigates to `/orders` (clean history, no duplicates)
- BottomNav always visible when no action bar is present
- No navigation dead ends from any entry point (Live Activity, push notification, direct deep link)

