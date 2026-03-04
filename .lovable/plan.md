

## Verified Finding: Listener Ordering Is NOT Guaranteed

The QA reviewer is correct. The `registration` listener can miss the APNs token event because **there is no synchronization gate** before `register()` is called.

### Evidence

**Listeners are attached** inside an async IIFE in the main `useEffect` (line 659-816):
```
useEffect → async IIFE → getPushNotificationsPlugin() → PN.addListener("registration", ...) → resolves listenersReadyRef
```

**But `register()` is called** in two places without awaiting the gate:
- `attemptRegistration` (line 433): `await PN.register()` — no `await listenersReadyRef.current` beforehand
- `requestFullPermission` (line 1181): `await PN.register()` — same problem

**The listener gate exists** (`listenersReadyRef`, lines 107-113) and is resolved at line 812, but it is **never awaited anywhere**. It's dead code.

### Race Condition

```text
Timeline A (works):
  useEffect IIFE runs → listeners attached → gate resolved
  ...later...
  user taps "Turn On" → requestFullPermission → register() → event fires → listener catches it ✓

Timeline B (fails — what happened to the seller):
  user taps "Turn On" → requestFullPermission → register() fires IMMEDIATELY
  useEffect IIFE still loading plugin...
  registration event fires → NO LISTENER ATTACHED → token lost forever ✗
```

This is especially likely on first launch when the user taps "Turn On" quickly — the effect's async IIFE may still be awaiting `getPushNotificationsPlugin()`.

### Fix Plan

**Change 1: `usePushNotifications.ts` — Await listener gate before `register()`**

In `attemptRegistration` (before line 433), add:
```typescript
await listenersReadyRef.current;
```

In `requestFullPermission` (before line 1181), add:
```typescript
await listenersReadyRef.current;
```

This ensures the `registration` listener is always attached before `register()` fires the APNs token event.

**Change 2: Remove `FCM.getAPNSToken()` fallbacks**

The three fallback blocks added in the last edit (lines 722-735, 335-349, 491-506) are unnecessary if the listener ordering is correct. `FCM.getAPNSToken()` is not a standard API across all `@capacitor-community/fcm` versions and adds fragile complexity. Remove all three blocks.

**Change 3: Keep the UI fire-and-forget pattern**

The `EnableNotificationsBanner.tsx` and `NotificationsPage.tsx` changes from the last edit (fire-and-forget `requestFullPermission()`) are correct and should stay as-is.

### No other changes needed

- The `registration` listener itself (line 666-749) correctly captures `apnsTokenRef.current` when the event fires
- The `claim_device_token` RPC correctly stores both tokens
- The edge function correctly uses APNs when the token is present

