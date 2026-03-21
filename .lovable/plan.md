

# Duplicate Toast Analysis

## The Specific Bug in the Screenshot

The "Your session has expired" toast appears **twice** because the same session expiry event triggers **two independent handlers**:

1. **`src/App.tsx` (line 148)** — The React Query `QueryCache.onError` / `MutationCache.onError` detects auth errors (JWT expired, 401, etc.) and calls `handleAuthError()` which fires `toast.error('Your session has expired...')`
2. **`src/contexts/auth/useAuthState.ts` (line 166)** — The `onAuthStateChange` listener fires on `SIGNED_OUT` event and independently calls `toast.error('Your session has expired...')`

When a session expires: a query fails (triggering handler #1, which calls `signOut`), and then the sign-out event fires (triggering handler #2). Both fire within milliseconds, producing duplicate toasts.

## Fix for This Specific Issue

**Remove the toast from `useAuthState.ts` (line 166)** — let the App.tsx centralized handler be the single source of truth for session-expired toasts. The `useAuthState` handler should only do the redirect, not show a toast, since `handleAuthError` in App.tsx already covers it.

### File: `src/contexts/auth/useAuthState.ts`
- Line 166: Remove `toast.error('Your session has expired...')` from the `SIGNED_OUT` branch
- Keep the `window.location.hash = '#/auth'` redirect (though App.tsx also does this, it's a harmless safety net)

## Broader Duplicate Toast Patterns Found Across the Codebase

### Pattern A: `friendlyError` + QueryCache double-fire
When a query's `onError` callback calls `toast.error(friendlyError(err))` AND the error is an auth error, `friendlyError` returns "Your session has expired..." while the QueryCache `onError` in App.tsx ALSO fires `handleAuthError()` → another toast. This affects **every component** that uses `toast.error(friendlyError(error))` in a React Query `onError`:

- `src/pages/WorkerJobsPage.tsx`
- `src/pages/WorkerMyJobsPage.tsx`  
- `src/pages/BuilderInspectionsPage.tsx`
- `src/components/ui/image-upload.tsx`
- `src/components/ui/croppable-image-upload.tsx`
- `src/pages/SellerDashboardPage.tsx`
- `src/hooks/useVisitorManagement.ts`
- `src/components/admin/BuilderManagementSheet.tsx`
- ...and ~30+ more files

### Pattern B: `handleApiError` in `query-utils.ts` also fires toast
`handleApiError()` calls `toast.error(message)` internally. If a caller also shows a toast, it doubles. Any component using both `handleApiError` and its own toast on the same error path gets duplicates.

### Pattern C: Mixed toast libraries
`src/components/disputes/CreateDisputeSheet.tsx` and `src/components/bulletin/CreatePostSheet.tsx` use `toast()` from `@/hooks/use-toast` (shadcn toast), while most of the app uses `toast` from `sonner`. Both render independently, so an error could show in both toast systems.

## Recommended Fixes

| Change | File(s) | Description |
|--------|---------|-------------|
| Remove duplicate session toast | `useAuthState.ts` line 166 | Delete the `toast.error(...)` call; App.tsx handles it |
| Guard `friendlyError` auth errors | `App.tsx` QueryCache `onError` | If `handleAuthError()` fires, don't let individual query `onError` callbacks also toast. Add a flag or return early pattern |
| Remove toast from `handleApiError` | `src/lib/query-utils.ts` | Make it return the message only; let callers decide whether to toast (prevents silent double-toasts) |
| Standardize on sonner | `CreateDisputeSheet.tsx`, `CreatePostSheet.tsx` | Replace `@/hooks/use-toast` usage with `sonner` to avoid dual toast systems |

### Implementation Priority
1. **Fix the session-expired double toast** (useAuthState.ts) — immediate, 1-line change
2. **Remove auto-toast from `handleApiError`** — make it return-only, audit callers
3. **Standardize toast library** — migrate remaining shadcn toast usages to sonner

