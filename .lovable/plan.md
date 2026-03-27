

# Fix Cart Empty-Page Regression + System-Wide Performance Degradation

## Issue 1: Cart Page Shows Empty Despite Badge Showing Items

### Root Cause

The `onAuthStateChange` callback in `useAuthState.ts` (line 158) calls `setPartial({ session, user: session?.user ?? null, isLoading: false })` every time any auth event fires (TOKEN_REFRESHED, INITIAL_SESSION, etc.). Each call creates a **new `user` and `session` object reference** — even when the user ID hasn't changed.

This triggers:
1. `IdentityContext` re-emission (14 emissions observed in logs — should be 2-3 max)
2. `CartProvider` re-renders because it consumes `useAuth()` → `user` reference changes
3. The `cancelCartQueries` from a recent `addItem` mutation cancels the in-flight cart fetch
4. When CartPage mounts, the query data is temporarily empty → shows "Your cart is empty"
5. The recovery layer (Layer 3) fires but with staggered delays (0ms, 500ms, 1500ms), so there's a visible flash

### Fix

**File: `src/contexts/auth/useAuthState.ts`** (line 155-179)
- In the `onAuthStateChange` callback, **skip** `setPartial` if the user ID hasn't changed (same session refresh). Use `prevUserIdRef` to compare:
  ```
  if (session?.user?.id === prevUserIdRef.current) return; // skip redundant update
  ```
- For `TOKEN_REFRESHED` events where only the JWT changed (same user), update session **without creating a new user reference** — use `setPartial({ session })` only, preserving the existing `user` object.

**File: `src/hooks/useCart.tsx`** (line 152)
- Extract `user?.id` into a stable `userId` string and use that for query keys and callbacks instead of the `user` object. This prevents query key instability from object reference changes:
  ```typescript
  const userId = user?.id ?? null;
  // Use userId in queryKey, cartKey, countKey, and all mutations
  ```

## Issue 2: System-Wide Performance Degradation

### Root Cause

Every `onAuthStateChange` event (token refresh, visibility regain, etc.) creates new object references for `user` and `session`, causing:
1. **14+ IdentityContext emissions** per session → entire app tree re-renders each time
2. Every page component that calls `useAuth()` re-renders unnecessarily
3. All `useQuery` hooks with `user` in their enabled condition re-evaluate
4. `refetchOnMount: 'always'` on cart query causes unnecessary network requests on every re-render

### Fix — Stabilize Auth Object References

**File: `src/contexts/auth/useAuthState.ts`**

1. **Guard `onAuthStateChange` against redundant updates** (lines 156-179):
   - Track `prevSessionRef` — only call `setPartial` if the user ID actually changed or `isLoading` transition occurs
   - For TOKEN_REFRESHED: update session token in-place without re-rendering the tree
   - This cuts emissions from ~14 to ~2-3 (INITIAL_SESSION → session restored → profile loaded)

2. **Guard `getSession()` callback** (lines 192-206):
   - Skip `setPartial` for user if `onAuthStateChange` already set the same user ID
   - Only set `isSessionRestored: true` if not already set

**File: `src/contexts/auth/AuthProvider.tsx`**

3. **Remove verbose lifecycle logging** (lines 78-95):
   - The `console.log` in `identityValue` useMemo runs on every emission — this itself adds CPU overhead. Remove the entire audit block (it was diagnostic, not production code).

4. **Stabilize `identityValue` deps** — use `user?.id` and `session?.access_token` as primitive deps instead of object references:
   ```typescript
   const identityValue = useMemo<IdentityContextType>(() => 
     ({ user, session, isLoading, isSessionRestored, signOut, refreshProfile }),
     [user?.id, !!session, isLoading, isSessionRestored, signOut, refreshProfile]
   );
   ```

**File: `src/hooks/useCart.tsx`**

5. **Remove `refetchOnMount: 'always'`** (line 171):
   - Change to `refetchOnMount: true` (default behavior respects staleTime)
   - The cart already has `staleTime: 5s` — no need to force refetch on every mount

**File: `src/hooks/useAppLifecycle.ts`**

6. **Deduplicate invalidation calls** (lines 45-72):
   - The `appStateChange` handler invalidates 11 query keys. Batch these using `queryClient.invalidateQueries({ predicate })` to reduce overhead.

## Files Changed

| File | Change |
|------|--------|
| `src/contexts/auth/useAuthState.ts` | Guard `onAuthStateChange` and `getSession` against redundant `setPartial` calls using user ID comparison |
| `src/contexts/auth/AuthProvider.tsx` | Remove lifecycle audit logging; stabilize `identityValue` useMemo deps to use primitives |
| `src/hooks/useCart.tsx` | Use stable `userId` string instead of `user` object; change `refetchOnMount` to `true` |
| `src/hooks/useAppLifecycle.ts` | Batch query invalidations to reduce re-render cascades |

## Verification

- Add item to cart → navigate to cart page → items must be visible (never flash empty)
- Tab away and back → no visible re-render jank
- Navigate Home → Cart → Profile → Seller Dashboard: each transition < 500ms
- IdentityContext emissions should drop from ~14 to ~3 max per session

