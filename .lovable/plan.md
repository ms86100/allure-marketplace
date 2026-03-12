

# Push Notification Regression — Root Cause Analysis

## What Changed (Backup vs Current)

I compared all 5 files from your backup drive against the current codebase. Here are the **exact differences**:

### Files that are IDENTICAL (no changes)
- `capacitor.ts` — identical
- `PushNotificationContext.tsx` — identical  
- `EnableNotificationsBanner.tsx` — identical

### Files that were modified (2 files, 3 changes total)

**1. `src/hooks/usePushNotifications.ts`** — Two changes:

| Change | Backup (working) | Current (broken) |
|--------|------------------|-------------------|
| **Plugin loaders** (lines 62-129) | Simple functions: call `import()` every time with timeout | Module-level cached singletons with pre-warming at module load time. Adds `_cachedPN`, `_cachedPNPromise`, `_cachedFCM`, `_cachedFCMPromise` variables and runs `getPushNotificationsPlugin()` + `getFcmPlugin()` eagerly when module loads |
| **Staleness guard** (lines 169, 570-589) | Simple: if state is `'registering'`, skip immediately | Added `registeringStartedAtRef`. If stuck in `'registering'` for >30s, force-resets to `'idle'` and retries |

**2. `src/components/notifications/PushNotificationProvider.tsx`** — One change:

| Backup (working) | Current (broken) |
|------------------|-------------------|
| Watches `user` via `IdentityContext`. When user transitions non-null → null, calls `removeTokenFromDatabase()` | Removed `IdentityContext` dependency entirely. Instead listens for `window` custom event `app:explicit-signout` |

A corresponding change was made in `src/contexts/auth/useAuthState.ts` to dispatch `app:explicit-signout` before `signOut()`.

---

## Root Cause

The **module-level pre-warming** is the likely culprit:

```typescript
// This runs at JS module load time — BEFORE React mounts
if (Capacitor.isNativePlatform()) {
  getPushNotificationsPlugin();  // fires import() immediately
  if (Capacitor.getPlatform() === 'ios') {
    getFcmPlugin();              // fires import() immediately
  }
}
```

On iOS, this triggers native bridge calls to Firebase **before the app is fully initialized** (before `SplashScreen.hide()`, before auth state resolves). The cached promise then resolves with a plugin handle that may be in a broken state, and since it's cached as a singleton, **every subsequent call reuses the broken handle** — the original backup retries a fresh `import()` each time, which works because by the time registration actually runs, the native bridge is ready.

The staleness guard and Provider changes are secondary — they don't cause the failure but change recovery behavior.

---

## Fix Plan

**Revert the 3 changes to restore the exact backup code:**

1. **`src/hooks/usePushNotifications.ts`**: Remove module-level caching (lines 62-129). Restore the simple `getPushNotificationsPlugin()` and `getFcmPlugin()` functions that do a fresh `import()` with timeout each call. Remove `registeringStartedAtRef` and the staleness guard block — restore simple "skip if registering" logic.

2. **`src/components/notifications/PushNotificationProvider.tsx`**: Restore `IdentityContext` user-watching pattern with `prevUserRef` for token cleanup on user→null transition. Remove the `app:explicit-signout` event listener.

3. **`src/contexts/auth/useAuthState.ts`**: Remove the `app:explicit-signout` dispatch line (line 139) and `isExplicitSignOut` ref if it was added by the same change. (Need to verify if `isExplicitSignOut` existed in the original — it handles session-expired toast logic, so it may have been pre-existing.)

No database or backend changes needed.

