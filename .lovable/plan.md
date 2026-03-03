

# Bridge-Level Event Tracing — BUILD 2026-03-03-D

Pure instrumentation. Zero logic changes. Raw `console.log` at every decision point.

## Files to edit

### 1. `src/lib/pushLogger.ts`

Add at entry of `pushLog()`:
```
console.log("PUSHLOG_WRITE", { level, message, metadata });
```

Add inside `flushLogs()` at the early-return:
```
console.log("PUSHLOG_FLUSH_SKIPPED", { hasUserId: !!currentUserId, bufferLen: LOG_BUFFER.length });
```

Add after Supabase insert:
```
console.log("PUSHLOG_FLUSH_RESULT", { error: error?.message ?? null, rowCount: rows.length });
```

### 2. `src/hooks/usePushNotifications.ts`

**Bump BUILD_ID** to `2026-03-03-D` (line 15).

**Main effect (line 526–944)** — add these raw `console.log` traces:

| Location | Log |
|---|---|
| Line 527, after `myId` assignment | `console.log("EFFECT_MOUNTED", { myId, userId: user?.id, ts: Date.now() })` |
| Line 527, before async block | `console.log("EFFECT_RENDER", { userId: user?.id, permissionStatus, hasToken: !!tokenRef.current, regState: registrationStateRef.current, ts: Date.now() })` |
| Line 839, inside `if (user)` before setTimeout | `console.log("USER_BLOCK_ENTERED", { userId: user.id, ts: Date.now() })` |
| Line 842, first line inside setTimeout callback | `console.log("LOGIN_SETTIMEOUT_FIRED", { userId: user?.id, tornDown, ts: Date.now() })` |
| Before `getPushStage()` (line 844) | `console.log("GET_PUSH_STAGE_CALLING", { ts: Date.now() })` |
| After `getPushStage()` returns | `console.log("PUSH_STAGE_RESULT", { stage, ts: Date.now() })` |
| Before `requestPermissions()` in `attemptRegistration` (line 377) | `console.log("REQUEST_PERMISSIONS_CALLING", { ts: Date.now() })` |
| After `requestPermissions()` returns (line 378) | `console.log("REQUEST_PERMISSIONS_RESULT", { receive: permStatus.receive, ts: Date.now() })` |
| Before `register()` (line 407) | `console.log("REGISTER_CALLED_AT", { ts: Date.now() })` |
| **NEW**: Right before `register()`, add permission reality check | `const preRegPerm = await PN.checkPermissions(); console.log("PERMISSION_BEFORE_REGISTER", { receive: preRegPerm.receive, ts: Date.now() })` |
| Registration listener (line 546), first line | `console.log("REGISTRATION_EVENT_RECEIVED", { tokenPrefix: rawToken?.substring(0, 20), ts: Date.now() })` |
| **NEW**: Registration listener, before anything else | `console.log("REGISTRATION_EVENT_THREAD_CHECK", { isNative: Capacitor.isNativePlatform?.(), hasPlugin: !!(window as any).Capacitor?.Plugins?.PushNotifications, ts: Date.now() })` |
| Registration error listener (line 610) | `console.log("REGISTRATION_ERROR_EVENT", { error: JSON.stringify(error), ts: Date.now() })` |
| Cleanup (line 939) | `console.log("EFFECT_CLEANUP", { myId, regState: registrationStateRef.current, hasToken: !!tokenRef.current, ts: Date.now() })` |

**Teardown race detection** — add inside effect body:

```typescript
// At top of effect (after myId):
let tornDown = false;

// In cleanup (line 939), before other cleanup:
tornDown = true;
console.log("EFFECT_CLEANUP_STATE", { myId, regState: registrationStateRef.current, hasToken: !!tokenRef.current, ts: Date.now() });

// Inside setTimeout(500) callback, after the FIRED log:
if (tornDown) {
  console.log("EFFECT_TORN_DOWN_BEFORE_REGISTRATION", { myId, ts: Date.now() });
  return;
}
```

## Decision matrix

| Logs seen | Root cause |
|---|---|
| `EFFECT_MOUNTED` → `EFFECT_CLEANUP` → `EFFECT_TORN_DOWN_BEFORE_REGISTRATION` | Dependency array instability |
| `LOGIN_SETTIMEOUT_FIRED` → `GET_PUSH_STAGE_CALLING` → no `PUSH_STAGE_RESULT` | `getPushStage()` throws |
| `PUSH_STAGE_RESULT` + `REQUEST_PERMISSIONS_RESULT receive=prompt` | Permission not granted — expected if user never tapped Allow |
| `PERMISSION_BEFORE_REGISTER receive=prompt` | `register()` called without permission — logic bug |
| `REGISTER_CALLED_AT` + `PERMISSION_BEFORE_REGISTER receive=granted` → no `REGISTRATION_EVENT_*` | Native bridge dropped callback |
| `REGISTRATION_EVENT_THREAD_CHECK hasPlugin=false` | Bridge hydration failure |
| `PUSHLOG_FLUSH_SKIPPED` | Logger never had userId set |
| Only `EFFECT_MOUNTED` + `EFFECT_RENDER`, no `USER_BLOCK_ENTERED` | `user` is null when effect runs |

## Test protocol after D-build

**Test 1** — Cold start, no taps. Read raw console logs only.
**Test 2** — Tap "Request Permission", accept OS prompt. Read logs.
**Test 3** — Tap "Trigger Registration". Read logs.

Do not mix. Each test isolated.

