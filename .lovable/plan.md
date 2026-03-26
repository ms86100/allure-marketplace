

# Fix: Premature Session Expiration & Auto-Logout

## Root Cause Analysis

There are **three compounding issues** causing users to get logged out prematurely:

### Issue 1: `isAuthSessionError` matches ALL 403 responses
**`App.tsx` line 164** — `if ((error as any)?.status === 401 || (error as any)?.status === 403) return true;`

Any PostgREST 403 (e.g. an RLS policy denial on a valid session) triggers `handleAuthError()`, which calls `signOut()` and redirects to `/auth`. A simple permissions error on one table wipes the entire session.

### Issue 2: Proactive health check force-clears on null session
**`useAuthState.ts` line 194-198** — The 5-minute health check calls `getSession()` which reads from localStorage. If localStorage is transiently unavailable (iOS WebView purge, private browsing quota), it returns `null` even though the server session is still valid. The code immediately calls `clearAuthState()`, logging the user out.

### Issue 3: Failed `refreshSession()` triggers SIGNED_OUT cascade
**`useAuthState.ts` line 206** — If the proactive refresh fails (network blip, temporary server issue), the Supabase client emits a `SIGNED_OUT` event. The `onAuthStateChange` listener on line 163-170 then redirects to `/auth` and clears state — even though the JWT may still have minutes of validity left.

## The Fix

### Change 1: `App.tsx` — Remove 403 from auth error detection
Only 401 is a definitive auth failure. 403 can mean RLS denial on a valid session.

```typescript
// Before
if ((error as any)?.status === 401 || (error as any)?.status === 403) return true;

// After
if ((error as any)?.status === 401) return true;
```

### Change 2: `useAuthState.ts` — Make health check resilient
Instead of clearing auth state when `getSession()` returns null, attempt a server-side `getUser()` call first. Only clear if the server confirms no valid session.

```typescript
const { data: { session }, error } = await supabase.auth.getSession();
if (error || !session) {
  // Don't immediately clear — verify with server
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[Auth] Session truly expired, clearing state');
    clearAuthState();
  }
  return;
}
```

### Change 3: `useAuthState.ts` — Wrap refreshSession in error handling
If `refreshSession()` fails, don't let it cascade into a logout. The existing JWT is still valid until its expiry.

```typescript
if (expiresIn < 10 * 60 * 1000) {
  console.log('[Auth] Proactively refreshing session');
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.warn('[Auth] Proactive refresh failed, will retry next interval:', refreshError.message);
    // Do NOT clear state — the current JWT is still valid
  }
}
```

## Impact Analysis

| Component | Impact | Risk |
|-----------|--------|------|
| RLS-denied queries | No longer trigger logout — **correct behavior** | Zero |
| Actual expired JWTs | Still detected via 401 status and JWT error patterns | Zero |
| Health check | More resilient — verifies server-side before clearing | Zero |
| Proactive refresh | Graceful failure — retries next interval instead of crashing | Zero |
| Explicit signOut | Unchanged — `isExplicitSignOut` ref still works | Zero |

## Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Remove `403` from `isAuthSessionError` status check |
| `src/contexts/auth/useAuthState.ts` | Add `getUser()` fallback in health check; wrap `refreshSession()` in error handling |

