

## Diagnosis: Two Distinct Problems

### Problem 1: Hook Registration Silently Fails on First Login
The logs show `attemptRegistration` is called after "First login — auto-requesting" but **zero subsequent logs appear** (no `attemptRegistration — attempt 1/3`, no `REQUEST_PERMISSIONS_CALLING`, nothing). This means:
- `attemptRegistrationRef.current()` either throws before its first pushLog, or
- The `await setPushStage('full')` on line 989 returns but the subsequent `await attemptRegistrationRef.current()` silently swallows an error

The outer try/catch (line 994) should catch this, but its `pushLog('error', 'Login registration setTimeout CRASHED')` also never appears — suggesting the error happens **inside** `attemptRegistration` but is caught internally without logging, or the log buffer doesn't flush.

**Root cause**: The `attemptRegistration` function checks `registrationStateRef.current` — on line 990, it's explicitly set to `'idle'`, so it shouldn't skip. The issue is likely that `requestPermissions()` on line 395 triggers the iOS permission dialog, which is **async and suspends JS execution**. When the user grants permission, the flow resumes, but by then the log buffer may have flushed without the registration logs, and the registration event arrives but the `listenersReadyRef` promise might not resolve.

### Problem 2: FCM Returns 200 But No Notification Appears
The edge function logs confirm FCM accepted all diagnostic notifications (`FCM success (200)`), the token `fZYG2o...` is valid, and the queue shows `status: processed`. Yet no notification appears on the device.

This is almost certainly an **APNs environment mismatch**:
- The token in DB was created on `2026-03-02 20:13:56` — from a previous build
- The current BUILD J binary may have a different APNs environment (sandbox vs production)
- FCM returns 200 even when APNs silently drops the notification due to environment mismatch

### Fix Plan

#### 1. Add crash-proof logging to `attemptRegistration` call on first login
Wrap the `await attemptRegistrationRef.current()` call (line 992) with explicit pre/post logs and a `flushPushLogs()` call, so we can see exactly where it fails:
```
pushLog('info', 'FIRST_LOGIN_CALLING_ATTEMPT_REGISTRATION', { ts: Date.now() });
flushPushLogs();
try {
  await attemptRegistrationRef.current();
  pushLog('info', 'FIRST_LOGIN_ATTEMPT_REGISTRATION_RETURNED', { ts: Date.now() });
} catch (regErr) {
  pushLog('error', 'FIRST_LOGIN_ATTEMPT_REGISTRATION_THREW', { error: String(regErr), ts: Date.now() });
}
flushPushLogs();
```

#### 2. Force token refresh on cold start to fix stale/mismatched tokens
After successful registration or reconciliation, compare the runtime FCM token with the DB token. If they differ, update the DB. This solves the APNs environment mismatch issue where an old token from a different build is stuck in the database.

In `handleValidToken`, add a log showing whether the token being saved is new vs matching existing DB token.

#### 3. Clear stale token on new build detection
When `PUSH_BUILD_ID` changes between sessions, delete the old device token from DB and force a fresh registration. This ensures each new TestFlight build gets a fresh FCM token matched to its APNs environment.

Store the last-seen build ID in Preferences. On login, compare — if different, delete old token and re-register.

### Technical Changes
- **`src/hooks/usePushNotifications.ts`**: Add build-change detection, force token refresh logic, and crash-proof logging around first-login registration
- **`src/lib/pushPermissionStage.ts`**: Add `getBuildId`/`setBuildId` helpers using Preferences
- Bump `PUSH_BUILD_ID` to `2026-03-03-K-TOKEN-REFRESH`

### Why This Will Work
The diagnostic proves the entire backend chain works (queue → process → FCM → 200). The only broken link is either (a) stale token from wrong APNs environment, or (b) registration not completing on first login. Both are addressed by forcing a fresh token on build change and adding crash-proof logging to identify any remaining registration failures.

