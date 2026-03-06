/**
 * Storage adapter for Supabase Auth.
 *
 * Web: plain localStorage (zero overhead).
 * Native (Capacitor): localStorage as primary, with a non-blocking
 * async mirror to @capacitor/preferences for persistence.
 */
import { Capacitor } from '@capacitor/core';

interface SupportedStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

let _prefs: typeof import('@capacitor/preferences').Preferences | null = null;
let _prefsLoaded = false;

async function getPrefs() {
  if (_prefsLoaded) return _prefs;
  try {
    const m = await import('@capacitor/preferences');
    _prefs = m.Preferences;
  } catch {
    _prefs = null;
  }
  _prefsLoaded = true;
  return _prefs;
}

/** Fire-and-forget native mirror — never blocks the caller */
function mirrorToNative(action: 'set' | 'remove', key: string, value?: string) {
  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const p = await getPrefs();
      if (!p) return;
      if (action === 'set' && value !== undefined) {
        await p.set({ key, value });
      } else {
        await p.remove({ key });
      }
    } catch {
      // Silently ignore — localStorage is the source of truth at runtime
    }
  })();
}

class CapacitorStorage implements SupportedStorage {
  getItem(key: string): string | null {
    // Synchronous localStorage read — never blocks, never async
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* quota */ }
    mirrorToNative('set', key, value);
  }

  removeItem(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    mirrorToNative('remove', key);
  }
}

/** Singleton — used by Supabase client */
export const capacitorStorage = new CapacitorStorage();

/**
 * One-time migration: copy any existing sb-* keys from native Preferences
 * into localStorage so the session survives the storage-swap.
 */
export async function migrateLocalStorageToPreferences(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const prefs = await getPrefs();
  if (!prefs) return;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('sb-')) {
      const val = localStorage.getItem(key);
      if (val) {
        const { value: existing } = await prefs.get({ key });
        if (!existing) await prefs.set({ key, value: val });
      }
    }
  }
}
