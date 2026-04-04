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
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota */
    }
    mirrorToNative('set', key, value);
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    mirrorToNative('remove', key);
  }
}

/** Singleton — used by Supabase client */
export const capacitorStorage = new CapacitorStorage();

const AUTH_SESSION_KEY = 'sb-auth-session-backup';

export async function clearAuthSessionArtifacts(projectRef?: string): Promise<void> {
  const keys = new Set<string>([AUTH_SESSION_KEY]);

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
        keys.add(key);
      }
    }
  } catch {
    // ignore localStorage enumeration failures
  }

  if (projectRef) {
    keys.add(`sb-${projectRef}-auth-token`);
  }

  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  const prefs = await getPrefs();
  if (!prefs) return;

  await Promise.allSettled(
    Array.from(keys).map((key) => prefs.remove({ key })),
  );
}

/**
 * Persist the current auth session to native Preferences.
 * Called on every onAuthStateChange so the token survives iOS localStorage purges.
 */
export function persistAuthSession(session: { access_token: string; refresh_token: string } | null): void {
  if (!Capacitor.isNativePlatform()) return;
  if (session) {
    mirrorToNative('set', AUTH_SESSION_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }));
  } else {
    mirrorToNative('remove', AUTH_SESSION_KEY);
  }
}

/**
 * Restore auth session from native Preferences → Supabase localStorage key.
 * Must be called BEFORE supabase.auth.getSession() on cold boot.
 */
export async function restoreAuthSession(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const prefs = await getPrefs();
  if (!prefs) return false;

  try {
    const { value } = await prefs.get({ key: AUTH_SESSION_KEY });
    if (!value) return false;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('sb-') && k.endsWith('-auth-token')) {
        return false;
      }
    }

    const parsed = JSON.parse(value);
    if (parsed?.access_token && parsed?.refresh_token) {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL || '';
      const ref = url.replace('https://', '').split('.')[0];
      if (ref) {
        const storageKey = `sb-${ref}-auth-token`;
        localStorage.setItem(storageKey, JSON.stringify({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        }));
        console.log('[Auth] Restored session from native Preferences');
        return true;
      }
    }
  } catch (e) {
    console.warn('[Auth] Failed to restore session from Preferences:', e);
  }
  return false;
}

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
