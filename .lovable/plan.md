

# Plan: Stateful, Bounded Push Token Registration

## Single file change: `src/hooks/usePushNotifications.ts`

### What changes

**1. Add registration state machine (in-memory only)**

```typescript
type RegistrationState = 'idle' | 'registering' | 'registered' | 'permission_denied' | 'failed';
```

Track via `useRef<RegistrationState>('idle')` — no re-renders, no persistence, purely internal.

**2. Replace `registerPushNotifications` with sequential, verifiable flow**

New `attemptRegistration()` function:
- If state is `registered` or `failed` or `permission_denied` → return immediately (no-op)
- Set state → `registering`
- Check permission → if denied, set state → `permission_denied`, return
- If granted, call `PushNotifications.register()`
- Start a **watchdog timer** (5 seconds)
- If `registration` event fires before timer → cancel timer, set state → `registered`
- If timer expires and no token → increment retry counter, retry (up to 3)
- After 3 retries with no token → set state → `failed`, emit diagnostic log, stop

**3. Watchdog timer mechanics**

- The `registration` listener already exists and calls `setToken()`
- Add a ref `watchdogTimerRef` — after each `register()` call, set a 5s timeout
- In the `registration` listener callback: clear the watchdog, set state → `registered`
- In the `registrationError` listener: clear the watchdog, set state → `failed` immediately (no retries for hard errors)
- On watchdog expiry: if `retryCount < 3`, call `attemptRegistration()` again; else mark `failed`

**4. Foreground resume retry — conditional only**

Add `App.addListener('appStateChange')`:
- On `isActive === true`:
  - If `state === 'failed'` → do nothing (hard stop respected)
  - If `state === 'permission_denied'` → re-check permission (user may have toggled in Settings), if now granted → reset state to `idle`, attempt registration
  - If `state === 'idle'` or `state === 'registering'` and `token` is null and `user` exists → call `attemptRegistration()`

**5. Terminal diagnostic log**

When state transitions to `failed`, emit one structured log:

```typescript
console.error('[Push][DIAG] Registration permanently failed', {
  userId: userRef.current?.id ?? 'unknown',
  platform: Capacitor.getPlatform(),
  permissionStatus: permissionStatus,
  retriesAttempted: retryCountRef.current,
  lastError: lastErrorRef.current,
  timestamp: new Date().toISOString(),
});
```

Also capture the `registrationError` event payload in `lastErrorRef` so the diagnostic includes APNs/FCM error details if available.

### What does NOT change

- `saveTokenToDatabase` — untouched
- `removeTokenFromDatabase` — untouched
- Foreground notification handler (toast + haptic + sound) — untouched
- `pushNotificationActionPerformed` handler — untouched
- Retry-on-user-available effect (`user && token` → save) — untouched
- Diagnostic query effect — untouched
- No backend, RLS, schema, or UI changes

### Cleanup

- Remove the current bare `registerPushNotifications()` call in the main effect
- Replace with `attemptRegistration()` guarded by state checks
- `App` listener cleanup added to the effect's return function

