/**
 * Persistent Storage Adapter for Supabase Auth on Capacitor (iOS/Android)
 *
 * On native platforms, WKWebView's localStorage is non-persistent — Apple can
 * purge it when the app is backgrounded or when the device is low on storage.
 * This adapter uses @capacitor/preferences (UserDefaults on iOS,
 * SharedPreferences on Android) which are fully persistent across app restarts.
 *
 * On web, it falls back to localStorage (standard behavior).
 *
 * Implements the Supabase `SupportedStorage` interface:
 *   getItem(key): Promise<string | null>
 *   setItem(key, value): Promise<void>
 *   removeItem(key): Promise<void>
 */
import { Capacitor } from '@capacitor/core';

interface SupportedStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

let _preferences: typeof import('@capacitor/preferences').Preferences | null = null;
let _loaded = false;

async function ensurePreferences() {
  if (_loaded) return _preferences;
  try {
    const mod = await import('@capacitor/preferences');
    _preferences = mod.Preferences;
  } catch (e) {
    console.warn('[CapacitorStorage] Failed to load Preferences plugin:', e);
    _preferences = null;
  }
  _loaded = true;
  return _preferences;
}

/**
 * A SupportedStorage adapter backed by @capacitor/preferences on native
 * and localStorage on web.
 */
class CapacitorStorage implements SupportedStorage {
  private withTimeout<T>(promise: Promise<T>, ms = 5000, fallback: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => {
        console.warn('[CapacitorStorage] Native bridge call timed out after', ms, 'ms — using fallback');
        resolve(fallback);
      }, ms)),
    ]);
  }

  async getItem(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return localStorage.getItem(key);
    }
    const prefs = await ensurePreferences();
    if (!prefs) return localStorage.getItem(key);
    try {
      const { value } = await this.withTimeout(prefs.get({ key }), 3000, { value: localStorage.getItem(key) });
      return value;
    } catch (e) {
      console.warn('[CapacitorStorage] getItem failed, falling back to localStorage:', e);
      return localStorage.getItem(key);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    // Always write to localStorage as a safety net
    try { localStorage.setItem(key, value); } catch (_) { /* quota exceeded, ignore */ }
    if (!Capacitor.isNativePlatform()) return;
    const prefs = await ensurePreferences();
    if (!prefs) return;
    try {
      await this.withTimeout(prefs.set({ key, value }), 3000, undefined);
    } catch (e) {
      console.warn('[CapacitorStorage] setItem failed:', e);
    }
  }

  async removeItem(key: string): Promise<void> {
    try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
    if (!Capacitor.isNativePlatform()) return;
    const prefs = await ensurePreferences();
    if (!prefs) return;
    try {
      await this.withTimeout(prefs.remove({ key }), 3000, undefined);
    } catch (e) {
      console.warn('[CapacitorStorage] removeItem failed:', e);
    }
  }
}

/** Singleton instance — reused across the app */
export const capacitorStorage = new CapacitorStorage();

/**
 * Migrate any existing auth tokens from localStorage to Preferences.
 * This ensures users who already have a session in localStorage don't
 * get logged out after the storage swap.
 */
export async function migrateLocalStorageToPreferences(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const prefs = await ensurePreferences();
  if (!prefs) return;

  // Supabase stores session under keys starting with 'sb-'
  const keysToMigrate: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-')) {
      keysToMigrate.push(key);
    }
  }

  for (const key of keysToMigrate) {
    const value = localStorage.getItem(key);
    if (value) {
      // Only migrate if not already present in Preferences
      const { value: existing } = await prefs.get({ key });
      if (!existing) {
        await prefs.set({ key, value });
      }
    }
  }
}
