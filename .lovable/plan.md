

## Investigation Findings

### Issue 1: Wrong API Key Still Being Used (Script Caching)
The console logs prove the Maps script is **still loaded with the old hardcoded key** (`AIzaSyC96Rz...`). This is visible in the deprecation warning URL. The module-level variables `loadPromise` and `resolvedApiKey` are cached — once the script loads with the old key, it never reloads with the new DB key, even after the database was updated.

### Issue 2: Plus Code Displayed Instead of Address Name
"3QC3+85" is a **Google Plus Code** (Open Location Code). The Geocoder returns results successfully (status `OK`), but the first result often has no `premise`, `neighborhood`, `sublocality`, or `route` address components — so line 84 falls through to `result.formatted_address.split(',')[0]`, which is the Plus Code prefix. The code only inspects `results[0]` and never checks subsequent results which typically contain the actual street address.

### Issue 3: Map Zoom Limited
The map is set to `zoom: 16` with `disableDefaultUI: true` and only `zoomControl: true`. Zoom 16 is not the max — the issue is likely that without the correct API key, the map tiles aren't fully loading at higher zoom levels.

## Fix Plan

### 1. Fix Script Caching (`useGoogleMaps.ts`)
- Reset `loadPromise` and `resolvedApiKey` when key source changes, or simply remove the stale cache by not caching at module level when the script hasn't loaded yet
- Ensure `fetchGoogleMapsApiKey` always queries DB fresh on first load (don't cache `resolvedApiKey` until confirmed working)

### 2. Fix Plus Code Display (`GoogleMapConfirm.tsx`)
- When geocoder returns results, iterate through **all results** (not just `results[0]`) to find one with meaningful address components
- Skip results where `formatted_address` starts with a Plus Code pattern (matches regex like `/^[23456789CFGHJMPQRVWX]+\+/`)
- Extract the best human-readable name from the first non-Plus-Code result
- Add `plus_code` type check on address components to explicitly skip them

### 3. Increase Max Zoom (`GoogleMapConfirm.tsx`)
- Set `maxZoom: 20` on the map options to allow deeper zoom levels
- Keep initial zoom at 16 but allow users to zoom in further

### Files Changed
- **`src/hooks/useGoogleMaps.ts`** — Clear cached `resolvedApiKey` so DB key is used on next load
- **`src/components/auth/GoogleMapConfirm.tsx`** — Fix result parsing to skip Plus Codes, increase max zoom

