

## Finding: Two Unguarded `register()` Calls Remain

The hook (`usePushNotifications.ts`) is now correctly guarded — both `attemptRegistration` (line 418) and `requestFullPermission` (line 1137) await `listenersReadyRef.current` before calling `register()`.

**However**, both UI components bypass the hook and call `PushNotifications.register()` directly — without the gate:

| File | Line | Guarded? |
|------|------|----------|
| `EnableNotificationsBanner.tsx` | 80 | **No** |
| `NotificationsPage.tsx` | 201 | **No** |

These direct calls fire the `registration` event before listeners may be attached, which is the exact race condition we just fixed inside the hook.

### Why These Direct Calls Exist

They were added to "preserve iOS user-gesture context." But `register()` does **not** require gesture context — only `requestPermissions()` does. The `requestPermissions()` call on the line above (72/193) correctly preserves the gesture chain. The `register()` call is a separate native bridge operation that doesn't need to be in the same synchronous frame.

### Fix

**Remove the direct `PushNotifications.register()` calls** from both UI components. The fire-and-forget `requestFullPermission()` already calls `register()` with the listener gate (line 1137-1138). Let it handle registration.

**`EnableNotificationsBanner.tsx`** — Remove lines 79-80:
```typescript
const handleTurnOn = async () => {
  setLoading(true);
  try {
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      setFailedSilently(true);
      return;
    }
    // Let requestFullPermission handle register() with listener gate
    requestFullPermission().catch(e => console.warn('[Push] Background reconciliation:', e));
  } catch {
    setFailedSilently(true);
  } finally {
    setLoading(false);
  }
};
```

**`NotificationsPage.tsx`** — Remove lines 200-201, same pattern:
```typescript
const permResult = await PushNotifications.requestPermissions();
if (permResult.receive !== 'granted') {
  setOsPermission(permResult.receive as 'granted' | 'denied' | 'prompt');
  return;
}
// Let requestFullPermission handle register() with listener gate
requestFullPermission().catch(e => console.warn('[Push] Background reconciliation:', e));
setOsPermission('granted');
toast.success('Notifications enabled!');
```

Since the static `import { PushNotifications }` is still used for `requestPermissions()`, the import stays. No other files call `register()`.

