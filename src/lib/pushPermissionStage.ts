import { Capacitor } from '@capacitor/core';
import { pushLog } from './pushLogger';

/**
 * Two-stage push notification permission strategy:
 *
 * Stage 'none'     → App just installed, no permission requested yet.
 * Stage 'deferred' → User logged in; listeners active but no OS prompt shown.
 * Stage 'full'     → Full permission requested (after first login or manual tap).
 */
export type PushStage = 'none' | 'deferred' | 'full';

const KEY = 'push_permission_stage';

/** Dynamic import of @capacitor/preferences — avoids top-level import on web. */
async function getPrefs() {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    return Preferences;
  } catch {
    return null;
  }
}

export async function getPushStage(): Promise<PushStage> {
  if (!Capacitor.isNativePlatform()) return 'none';
  try {
    // Probe 1: About to call dynamic import
    console.log("PREFERENCES_IMPORT_CALLING", Date.now());
    pushLog('info', 'PREFERENCES_IMPORT_CALLING', { ts: Date.now() });

    const prefsModule = await import('@capacitor/preferences');

    // Probe 2: Dynamic import resolved
    console.log("PREFERENCES_IMPORT_RESOLVED", Date.now());
    pushLog('info', 'PREFERENCES_IMPORT_RESOLVED', { ts: Date.now() });

    const prefs = prefsModule.Preferences;
    if (!prefs) {
      console.log("PREFERENCES_PLUGIN_NULL", Date.now());
      pushLog('warn', 'PREFERENCES_PLUGIN_NULL', { ts: Date.now() });
      return 'none';
    }

    // Probe 3: About to call get()
    console.log("PREFERENCES_GET_CALLING", Date.now());
    pushLog('info', 'PREFERENCES_GET_CALLING', { ts: Date.now() });

    const { value } = await prefs.get({ key: KEY });

    // Probe 4: get() resolved
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

export async function setPushStage(stage: PushStage): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const prefs = await getPrefs();
    if (!prefs) return;
    await prefs.set({ key: KEY, value: stage });
  } catch (e) {
    console.warn('[PushStage] Failed to save stage:', e);
  }
}
