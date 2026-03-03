

## BUILD 2026-03-03-H — Import-Level Proof Instrumentation

Two files changed. Zero logic changes. Pure instrumentation.

### File 1: `src/lib/pushPermissionStage.ts`

Inline the dynamic import directly into `getPushStage()` (bypass `getPrefs()` wrapper) with four ordered probes:

```ts
export async function getPushStage(): Promise<PushStage> {
  if (!Capacitor.isNativePlatform()) return 'none';
  try {
    // Probe 1
    console.log("PREFERENCES_IMPORT_CALLING", Date.now());
    pushLog('info', 'PREFERENCES_IMPORT_CALLING', { ts: Date.now() });

    const prefsModule = await import('@capacitor/preferences');

    // Probe 2
    console.log("PREFERENCES_IMPORT_RESOLVED", Date.now());
    pushLog('info', 'PREFERENCES_IMPORT_RESOLVED', { ts: Date.now() });

    const prefs = prefsModule.Preferences;
    if (!prefs) {
      console.log("PREFERENCES_PLUGIN_NULL", Date.now());
      pushLog('warn', 'PREFERENCES_PLUGIN_NULL', { ts: Date.now() });
      return 'none';
    }

    // Probe 3
    console.log("PREFERENCES_GET_CALLING", Date.now());
    pushLog('info', 'PREFERENCES_GET_CALLING', { ts: Date.now() });

    const { value } = await prefs.get({ key: KEY });

    // Probe 4
    console.log("PREFERENCES_GET_RESOLVED", Date.now());
    pushLog('info', 'PREFERENCES_GET_RESOLVED', { ts: Date.now(), value });

    if (value === 'deferred' || value === 'full') return value;
    return 'none';
  } catch (e) {
    console.log("PREFERENCES_GET_ERROR", Date.now(), e);
    pushLog('error', 'PREFERENCES_GET_ERROR', { ts: Date.now(), error: String(e) });
    return 'none';
  }
}
```

The `getPrefs()` helper and `setPushStage()` remain unchanged — only `getPushStage()` is modified.

### File 2: `src/hooks/usePushNotifications.ts`

Bump `PUSH_BUILD_ID` from `'2026-03-03-G'` to `'2026-03-03-H'`.

### After rebuild + cold start + login, I will query `push_logs` and deliver:

1. Ordered log sequence by `metadata.ts`
2. Explicit statement: import resolved / did not resolve
3. Explicit statement: `get()` reached / did not reach
4. Effect mount state confirmation
5. Conclusion: proven / not proven

