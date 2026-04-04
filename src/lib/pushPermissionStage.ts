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

let _prefs: typeof import('@capacitor/preferences').Preferences | null = null;
let _prefsLoaded = false;

async function ensurePrefsLoaded(): Promise<void> {
  if (_prefsLoaded) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    _prefs = Preferences;
  } catch {
    _prefs = null;
  }
  _prefsLoaded = true;
}

export async function getPushStage(): Promise<PushStage> {
  if (!Capacitor.isNativePlatform()) return 'none';
  try {
    await ensurePrefsLoaded();
    if (!_prefs) return 'none';
    const { value } = await _prefs.get({ key: KEY });
    if (value === 'deferred' || value === 'full') return value;
    return 'none';
  } catch (e) {
    pushLog('error', 'PREFERENCES_GET_ERROR', { ts: Date.now(), error: String(e) });
    return 'none';
  }
}

export async function setPushStage(stage: PushStage): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensurePrefsLoaded();
    if (!_prefs) return;
    await _prefs.set({ key: KEY, value: stage });
  } catch (e) {
    console.warn('[PushStage] Failed to save stage:', e);
  }
}

const BUILD_ID_KEY = 'push_last_build_id';

/** Get the last-seen build ID from Preferences. */
export async function getLastBuildId(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    await ensurePrefsLoaded();
    if (!_prefs) return null;
    const { value } = await _prefs.get({ key: BUILD_ID_KEY });
    return value;
  } catch (e) {
    console.warn('[PushStage] Failed to read build ID:', e);
    return null;
  }
}

/** Save the current build ID to Preferences. */
export async function setLastBuildId(buildId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensurePrefsLoaded();
    if (!_prefs) return;
    await _prefs.set({ key: BUILD_ID_KEY, value: buildId });
  } catch (e) {
    console.warn('[PushStage] Failed to save build ID:', e);
  }
}
