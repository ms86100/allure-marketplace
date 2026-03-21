

# Audit: Navigation Trap Fix — Gap Found

## What's Already Fixed ✅

**`src/pages/OrderDetailPage.tsx` (line 191):** The back button now correctly uses `window.history.state.idx` instead of `window.history.length`. If `idx` is 0 or undefined (deep-link cold start), it navigates to `/orders` with `replace: true` instead of `navigate(-1)`.

**`src/App.tsx` (line 330):** The deferred deep link consumer already uses `{ replace: true }`, so it doesn't add an extra history entry.

## Remaining Gap ⚠️

**`src/hooks/useDeepLinks.ts` (line 101):** The immediate navigation call uses `navigate(path)` — a **push**, not a replace. On cold start, this creates the following history stack:

```text
idx 0: / (initial blank route from HashRouter startup)
idx 1: /orders/{id} (pushed by deep link handler)
```

Because `idx` is `1` (which is `> 0`), the back button in `OrderDetailPage` fires `navigate(-1)`, which goes back to `idx 0` — the **blank initial route** (`/`). This redirects the user to the home page, which is functional but not ideal. However, if the initial route also triggers a redirect back to the order page (depending on auth state or other logic), it could still cause a loop.

The deferred consumer (App.tsx line 330) fires 300ms later with `replace: true`, but by then the immediate `navigate(path)` has already pushed. If both fire, there are **two navigations** — the push and then the replace — creating a messy history.

## Fix

### File: `src/hooks/useDeepLinks.ts`
**Line 101:** Change `navigate(path)` to `navigate(path, { replace: true })` — this replaces the initial blank route instead of pushing on top of it, keeping the deep-linked page at `idx 0`.

**Line 107 (error fallback):** Same change — `navigate('/orders', { replace: true })`.

This ensures that on cold start via Live Activity tap:
- History has only one entry: `/orders/{id}` at `idx 0`
- The back button in OrderDetailPage sees `idx === 0`, falls through to `navigate('/orders', { replace: true })`
- No loop, no blank route, clean exit to orders list

### Summary

| Location | Status | Issue |
|----------|--------|-------|
| `OrderDetailPage.tsx` back button | ✅ Fixed | Uses `idx` check correctly |
| `App.tsx` deferred consumer | ✅ Fixed | Uses `replace: true` |
| `useDeepLinks.ts` immediate navigate | ❌ **Gap** | Uses push instead of replace — creates extra history entry |

One-line fix in `useDeepLinks.ts`: add `{ replace: true }` to both `navigate()` calls.

