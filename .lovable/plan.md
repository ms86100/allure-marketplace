

# Push Token Registration Fix — Native Bridge Deadlock

## Root Cause (from push_logs evidence)

The database logs tell the full story. Here's the exact sequence happening on EVERY app launch:

```text
21:04:26  EFFECT_MOUNTED
21:04:26  RECONCILE_GET_FCM_PLUGIN_CALLING  (reason: app_resume_prelog)
21:04:27  RECONCILE_GET_FCM_PLUGIN_CALLING  (reason: login_always)
         ← NO "RECONCILE_GET_FCM_PLUGIN_RESULT" ever appears
21:04:29  Resume prelog reconcile crashed   (timed out after 5s)
21:04:32  RECONCILE_CRASHED_OR_TIMEOUT      (login reconcile timed out)
21:04:32  attemptRegistration — attempt 1/3
         ← NO "AR_PLUGIN_LOADED" ever appears — getPushNotificationsPlugin() also hangs
```

**Zero** `AR_PLUGIN_LOADED`, `PIPELINE_FAILED`, `PIPELINE_SUCCESS`, `CLAIM_DEVICE_TOKEN_RPC`, or `REGISTRATION_EVENT_RECEIVED` logs exist in the entire database. Every single launch follows this exact pattern — all plugin imports hang silently.

**Why the diagnostic page works fine**: It runs on user tap, minutes after boot, when no other plugin calls are in flight. The hook runs during the first 1-2 seconds when THREE concurrent plugin imports fight for the native bridge:

1. Main IIFE: `import('@capacitor/push-notifications')` (line 788)
2. iOS FCM IIFE: `import('@capacitor-community/fcm')` (line 935)
3. App resume handler: `reconcileRuntimeToken` → `import('@capacitor-community/fcm')` (fires immediately because TestFlight launch = "app resume")
4. Login handler (500ms later): `reconcileRuntimeToken` → `import('@capacitor-community/fcm')` again

The code already documents this exact bug pattern at line 1132: *"On iOS, calling Preferences.get() twice in rapid succession causes a native bridge deadlock where the second Promise never settles."* The same deadlock applies to concurrent plugin imports.

## Fix (3 changes to `usePushNotifications.ts`)

### Change 1: Deduplicate plugin imports with lazy promise cache
Replace the two plugin loader functions with versions that share a single in-flight promise. If the import fails/times out, the cache resets so retries work.

```typescript
let _pnPromise: Promise<any> | null = null;
async function getPushNotificationsPlugin() {
  if (!_pnPromise) {
    _pnPromise = withTimeout(
      import('@capacitor/push-notifications').then(m => m.PushNotifications),
      PLUGIN_IMPORT_TIMEOUT_MS,
      'getPushNotificationsPlugin import timed out'
    ).catch(e => { _pnPromise = null; return null; });
  }
  return _pnPromise;
}

let _fcmPromise: Promise<any> | null = null;
async function getFcmPlugin() {
  if (!_fcmPromise) {
    _fcmPromise = withTimeout(
      import('@capacitor-community/fcm').then(m => m.FCM),
      PLUGIN_IMPORT_TIMEOUT_MS,
      'getFcmPlugin import timed out'
    ).catch(e => { _fcmPromise = null; return null; });
  }
  return _fcmPromise;
}
```

No pre-warming at module load (that was the previous broken version). Just deduplication so concurrent callers share ONE import call.

### Change 2: Add boot-complete gate
Add a `bootCompleteRef` that becomes `true` after the listener gate resolves. The appStateChange handler skips `app_resume_prelog` reconcile if boot isn't complete (prevents the first concurrent import race).

### Change 3: Login reconcile waits for listener gate
Before the login block calls `reconcileRuntimeToken`, it waits for the listener gate. This ensures the main IIFE's PN import is complete before any reconcile tries a second plugin import.

## Why this is different from the previous broken version
- Previous: cached singletons + **pre-warming at module load** (fired before React mounted)
- This fix: lazy cache created on first call only + resets on failure + boot-complete gate prevents concurrent calls

## Files changed
- `src/hooks/usePushNotifications.ts` — the three changes above

No database, edge function, or provider changes needed.

