

## Fix: Deterministic Back Navigation + Action Bar Overlap on OrderDetailPage

### Root Cause

**Back button**: The current logic uses `window.history.state?.idx` (React Router internal) to decide navigation. On cold starts from Live Activity/push notifications, this value is unreliable in Capacitor WebViews, causing `navigate(-1)` to go back to the WebView's initial blank entry (triggering a reload) or `replace: true` to destroy the history stack.

**Action bar overlap**: Buyer action bar at `bottom-16 z-[60]` with `pb-[env(safe-area-inset-bottom)]` extends into the BottomNav's safe-area zone, blocking touch targets on iOS devices.

### Solution: Deterministic Entry Source Tracking

Instead of guessing history state, **explicitly mark** how the user arrived at the page using React Router's `location.state`.

### Changes

**File: `src/App.tsx`** (deep link consumer, ~line 336)
- When navigating to a deep link path, pass `{ state: { from: 'deeplink' } }` so the destination page knows the entry source deterministically.

**File: `src/pages/OrderDetailPage.tsx`**

1. **Back button** (line 194): Replace the `idx`-based logic with deterministic check:
   - Read `location.state?.from`
   - If `from === 'deeplink'` → `navigate('/orders')` (push, not replace — preserves stack)
   - Otherwise → `navigate(-1)` (normal in-app back)
   - No `replace: true` anywhere — never destroy history

2. **Buyer Action Bar** (line 608): Change `bottom-16` to `bottom-[calc(4rem+env(safe-area-inset-bottom))]` and remove the redundant `pb-[env(safe-area-inset-bottom)]` so it sits above the full BottomNav including safe area.

3. **Seller Action Bar loading** (line 564): Same positioning fix — `bottom-[calc(4rem+env(safe-area-inset-bottom))]` and remove `pb-[env(safe-area-inset-bottom)]`.

4. **Seller Action Bar** (line 575): Same fix.

### Why This Is Bulletproof

- **Deterministic**: No heuristics. The deep link consumer explicitly tags navigation state at the source.
- **No `replace: true`**: History stack is never destroyed, so BottomNav tabs always work.
- **No browser API guessing**: Doesn't rely on `history.length`, `history.state.idx`, or any WebView-specific behavior.
- **Testable**: `location.state.from === 'deeplink'` is a simple, predictable condition.

### Files Changed

| File | Change |
|---|---|
| `src/App.tsx` | Pass `{ state: { from: 'deeplink' } }` when navigating to pending deep link |
| `src/pages/OrderDetailPage.tsx` | Deterministic back button using `location.state.from`; fix action bar positioning |

