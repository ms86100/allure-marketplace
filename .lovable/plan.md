

# Degraded Mode + Final Hardening for Profile Load

## Problem
`ProtectedRoute` blocks forever on `!profile` when DB returns 544 timeouts. No failure signal, no escape hatch, no recovery path.

## Changes

### 1. `src/contexts/auth/types.ts` — Add `profileLoadFailed`
- Add `profileLoadFailed: boolean` to `AuthState` and `AuthContextType` (default `false`)

### 2. `src/contexts/auth/useAuthState.ts` — Failure signaling + hardened retry

**a) AbortController on RPC call (8s timeout)**
Wrap `supabase.rpc('get_user_auth_context')` — prevents indefinite hang.

**b) Set `profileLoadFailed: true`** when retries exhaust (after line 30) and in the catch block. Reset to `false` at the start of `fetchProfile`.

**c) In-flight dedup guard**
Add `isFetchingProfile` ref. Early-return if already in-flight — prevents parallel calls from auto-retry + manual retry + component mounts.

**d) Background auto-retry with exponential backoff**
New `useEffect` when `profileLoadFailed && user`:
```
15s → 30s → 60s (max)
```
Stops interval when profile loads successfully. Uses the same in-flight guard.

### 3. `src/contexts/auth/AuthProvider.tsx` — Expose flag
Add `profileLoadFailed` to `RoleContext` and legacy context value.

### 4. `src/App.tsx` — Degraded mode in `ProtectedRoute`

Replace the hard `!profile` spinner (lines 256-264):

```
if (!profile && !profileLoadFailed) → "Loading your profile..." spinner
if (profileLoadFailed) → render children + persistent top banner
if (profile) → normal
```

Banner: "Profile couldn't be loaded. Some features may be limited." + Retry button.
**Persistent until recovery** — not dismissible. Auto-hides when profile loads.

### No DB changes, no new dependencies

## Files changed

| File | Change |
|------|--------|
| `src/contexts/auth/types.ts` | Add `profileLoadFailed` flag |
| `src/contexts/auth/useAuthState.ts` | Failure flag, AbortController, in-flight guard, backoff auto-retry |
| `src/contexts/auth/AuthProvider.tsx` | Expose flag in contexts |
| `src/App.tsx` | Degraded mode in ProtectedRoute with persistent banner |

