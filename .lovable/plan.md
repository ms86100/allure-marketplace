

## Problem

Two of the five frozen push notification files were overwritten with older/broken versions:

| File | Current (broken) | Frozen backup (working) |
|------|------------------|------------------------|
| `src/hooks/usePushNotifications.ts` | BUILD_ID `2026-03-04-TIMEOUT-ALL-NATIVE`, 1394 lines, over-engineered with excessive timeouts, missing direct `saveTokenToDb` with fallback upsert | BUILD_ID `2026-03-07-DUAL-PLUGIN-V2-LISTENER-GATE`, 373 lines, clean dual-plugin architecture with RPC + upsert fallback |
| `src/components/notifications/EnableNotificationsBanner.tsx` | Imports `PushNotifications` at top-level (crashes on web), missing `DENIED_CONFIRMED_KEY` persistence, different `handleTurnOn` flow | Uses dynamic imports, has `confirmedDenied` state with localStorage, delegates to `requestFullPermission` cleanly |

The other 3 frozen files (`PushNotificationProvider.tsx`, `PushNotificationContext.tsx`, `capacitor.ts`) are unchanged and correct.

### Why tokens aren't being stored

The current broken `usePushNotifications.ts` has an overly complex finalization pipeline with multiple timeout gates (`waitForApnsToken`, `waitForListenersReady`, etc.). The `handleValidToken` function requires APNs token to be present before saving, and if timing is off, it calls `markFailed('apns_missing')` and never persists. The working backup has a simpler flow: the `registration` listener fires → gets APNs token → immediately calls `FCM.getToken()` → saves both tokens via `saveTokenToDb` with a fallback upsert.

## Plan

### 1. Restore `src/hooks/usePushNotifications.ts` from frozen backup
Replace the entire 1394-line file with the 373-line frozen backup version (BUILD_ID `2026-03-07-DUAL-PLUGIN-V2-LISTENER-GATE`).

### 2. Restore `src/components/notifications/EnableNotificationsBanner.tsx` from frozen backup
Replace the entire 154-line file with the 163-line frozen backup version that uses dynamic imports and has proper `DENIED_CONFIRMED_KEY` handling.

No other files need changes. The `pushPermissionStage` import used by the broken version can remain in the codebase (unused import won't cause runtime issues, and tree-shaking removes it from the bundle).

