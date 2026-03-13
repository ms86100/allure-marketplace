

## Brutal Honest Assessment

The code has a **fatal caching bug** on line 29 of `useGoogleMaps.ts`:

```
if (loadPromise) return loadPromise;
```

Once the script loads with ANY key (including the old broken one), `loadPromise` is set and **never cleared**. Every subsequent call returns the cached promise — the DB is never queried again, the script is never reloaded. The "fix" on line 45 that sets `loadPromise = null` is **inside** the promise that line 29 already short-circuits past. It's dead code.

The previous "fixes" added Plus Code filtering and Places fallback, which are fine defensive measures, but they were treating symptoms. The root cause was always: **wrong API key loaded, and caching prevents the correct one from ever being used.**

## Plan

### 1. Update API key in database
Update the `admin_settings` row with your new key: `AIzaSyAGqPf40RaQ16EW8HQKASZLtrfGUH8rmSg`

### 2. Update hardcoded fallback (`useGoogleMaps.ts`)
Change the `HARDCODED_FALLBACK_KEY` on line 5 to use this same key, so even if the DB query fails, the correct key is used.

### 3. Fix the caching bug (`useGoogleMaps.ts`)
Restructure `loadGoogleMapsScript()` to:
- Always fetch the API key from DB first (not cached)
- Only skip reloading if the **currently loaded script** already uses the correct key
- Remove the broken `loadPromise` guard that prevents key updates from taking effect

### Files Changed
- `src/hooks/useGoogleMaps.ts` — Fix caching, update fallback key
- Database `admin_settings` — Update key value

