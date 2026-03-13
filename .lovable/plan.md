

## Root Cause: API Key Not in Database

The `admin_settings` table has **no row** for `google_maps_api_key`. The app's key-fetching logic (`useGoogleMaps.ts` line 11-27) queries the database first, finds nothing, and falls back to a **hardcoded key** (`AIzaSyC96Rz...`). That hardcoded key belongs to a different Google Cloud project where the Geocoding API is **not** enabled — hence "Geocode failed" every time.

Your Sociva project key with Geocoding enabled is never actually used by the app.

## Fix

### 1. Insert API key into database (migration)

Add the correct Google Maps API key to `admin_settings` so the app uses it instead of the fallback. You will be prompted to provide the key value.

```sql
INSERT INTO admin_settings (key, value, is_active)
VALUES ('google_maps_api_key', '<YOUR_KEY>', true);
```

### 2. Add enhanced error logging (`GoogleMapConfirm.tsx`)

Log the actual geocoder error status (`REQUEST_DENIED`, `OVER_QUERY_LIMIT`, etc.) so future failures are immediately diagnosable instead of a generic "Geocode failed" message.

### 3. Add Places API fallback (`GoogleMapConfirm.tsx`)

If the Geocoder fails for any reason, fall back to `google.maps.places.PlacesService.nearbySearch()` to get a place name from the already-working Places API. This makes reverse geocoding resilient even if the Geocoding API is temporarily unavailable.

### 4. Log key source (`useGoogleMaps.ts`)

Add a `console.info` indicating whether the key came from the database or the hardcoded fallback, so you can instantly verify the correct key is being used in future builds.

### Summary

The code is actually correct — it just never had the right API key. Fix 1 (inserting the key) solves the problem immediately. Fixes 2-4 add resilience and diagnostics to prevent this from being hard to debug again.

