

## Root Cause Confirmed

The banner calls `requestFullPermission()` (line 70 of `EnableNotificationsBanner.tsx`), which at line 1171 wraps all logic in:

```typescript
await Promise.race([doRegister(), timeout]);
```

Inside `doRegister()`, the actual `PN.requestPermissions()` call is buried behind:
1. `await getPushNotificationsPlugin()` (dynamic import)
2. `await PN.checkPermissions()`
3. Then finally `await PN.requestPermissions()`

iOS loses the user-gesture context through these async layers + the `Promise.race` wrapper. The prompt is silently suppressed, the function hangs for 20 seconds, and the UI stays stuck on "Enabling...".

**Diagnostics works** because `runPushDiagnostics` (line 51 of `pushDiagnostics.ts`) calls `PN.requestPermissions()` directly without any `Promise.race` or nested async wrappers.

---

## Fix Plan

### Change 1: `EnableNotificationsBanner.tsx` — Direct native calls in click handler

Rewrite `handleTurnOn` to call `PushNotifications.requestPermissions()` and `PushNotifications.register()` **directly** in the tap handler, preserving iOS gesture context. Only call `requestFullPermission()` afterward for token reconciliation (permission already granted at that point).

```typescript
const handleTurnOn = async () => {
  setLoading(true);
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    
    // Direct call — maintains iOS gesture context
    const permResult = await PushNotifications.requestPermissions();
    
    if (permResult.receive !== 'granted') {
      setFailedSilently(true);
      return;
    }
    
    // Trigger APNs registration event
    await PushNotifications.register();
    
    // Now safe to call complex async logic — permission already granted
    await requestFullPermission();
  } catch {
    setFailedSilently(true);
  } finally {
    setLoading(false);
  }
};
```

### Change 2: `NotificationsPage.tsx` — Same direct-call pattern

Apply identical fix to the "Enable push notifications" button (around line 189).

### Change 3: `usePushNotifications.ts` — Remove `Promise.race` from `requestFullPermission`

Remove the 20-second timeout race (lines 1095-1097, 1170-1188). When iOS shows the permission prompt, the user decides when to tap — racing against a timeout causes premature rejection and stuck UI. The function should just `await doRegister()` directly.

Also add a guard: if permission is already `'granted'` at entry (because the banner already called `requestPermissions()`), skip the permission request and go straight to `register()` + token reconciliation.

### No other changes needed

- Main registration listener already captures APNs token (Bug #1 fix is in place at line 650)
- `claim_device_token` RPC handles atomic token ownership (Bug #3 fix is in place)
- Diagnostics validate APNs token presence (Bug #4 fix is in place)
- Backend pipeline is healthy

