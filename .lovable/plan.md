
Goal: make live tracking map bulletproof when the Google Maps API key exists as a secret, not as an `admin_settings` row.

What I found:
- The current failure is not a generic map bug. The console explicitly says: `useGoogleMaps: No valid API key found in DB`.
- `src/hooks/useGoogleMaps.ts` only loads the key from `public.admin_settings`.
- Your project’s RLS allows authenticated users to read only `payment_gateway_mode` from `admin_settings`, not `google_maps_api_key`.
- So even if the key is stored as a project secret, the browser can never read it. Result: `loadGoogleMapsScript()` throws `NO_API_KEY`, and `DeliveryMapView` shows `Live map unavailable`.
- This also means other Google Maps features in onboarding/address search are fragile for the same reason.
- The fallback card warning about refs in `DeliveryMapView` is cosmetic, but should be cleaned up while we’re here.

Bulletproof fix:
1. Move Google Maps key delivery to a secure server-side path
   - Create a small Edge Function that reads the runtime secret and returns the publishable Google Maps key to authenticated users.
   - This becomes the single source of truth for Google Maps across the app.
   - Keep `admin_settings` as an optional admin override only if needed, but do not depend on it.

2. Refactor `useGoogleMaps`
   - Replace the direct `admin_settings` query with a resolver chain:
     1. in-memory cached key
     2. Edge Function response from secret
     3. optional `admin_settings` fallback only if explicitly allowed
   - Add better error states:
     - `NO_API_KEY`
     - `AUTH_FAILED`
     - `SCRIPT_LOAD_FAILED`
     - `KEY_FETCH_FAILED`
   - Reset global auth-failure state correctly when reloading scripts.

3. Make map UI failure-proof
   - In `DeliveryMapView`, show distinct fallback copy for:
     - missing key/config
     - invalid/restricted key
     - script/network load failure
   - Keep OSRM ETA + “Open in Google Maps” fallback.
   - Fix the `ref` warning by removing any invalid ref pass-through on the fallback/button path.

4. Verify live-tracking data dependency separately
   - Ensure the map fallback is only about Google Maps rendering, not missing tracking data.
   - Preserve current behavior where OSRM route/ETA works even if Google JS fails.
   - Confirm assignment/location flow still drives rider coordinates into the map once the script loads.

5. Update all Google Maps consumers
   - Reuse the same new key loader in:
     - order live tracking map
     - onboarding location sheets
     - seller store location sheet
     - address/location selectors
   - This prevents the same secret-vs-DB bug elsewhere.

Files to update:
- `src/hooks/useGoogleMaps.ts`
- `src/components/delivery/DeliveryMapView.tsx`
- likely one new Edge Function, e.g. `supabase/functions/get-google-maps-key/index.ts`
- possibly shared helper usage in:
  - `src/components/seller/OnboardingLocationSheet.tsx`
  - `src/components/seller/SetStoreLocationSheet.tsx`
  - `src/components/location/LocationSelectorSheet.tsx`

Technical notes:
- Since this project is connected to external Supabase, the correct place for runtime secrets is an Edge Function, not client-side DB reads.
- Google Maps browser keys are publishable, but using the secret-backed function avoids coupling the app to `admin_settings` and fixes the current production bug immediately.
- The current RLS policy on `admin_settings` is a strong signal that secrets were never meant to be read directly by the browser.

Expected outcome after implementation:
- Live map no longer says “Live map unavailable” just because the key is stored as a secret.
- All Google Maps-powered flows use one reliable source for the key.
- If the key is actually invalid/restricted, the UI will say that clearly and still preserve ETA/open-in-maps fallback.

Validation after implementation:
- Open the affected order detail page and confirm the map renders.
- Test “Start Sharing Location” and confirm rider movement updates the map.
- Test onboarding/store-location search to ensure autocomplete still works.
- Confirm fallback still works when the key is intentionally unavailable or restricted.
