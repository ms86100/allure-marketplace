
Audit report (no implementation):

1) Frontend map pin handling
- Pin drag is captured only in `GoogleMapConfirm.tsx` via `pin.addListener('dragend', ...)` (lines 115–123).
- On drag end, coordinates come from `pin.getPosition()` and are stored as:
  - `marker.lat = pos.lat()`
  - `marker.lng = pos.lng()`
- Confirm payload sent from UI is:
  - `onConfirm(marker.lat, marker.lng, displayNameRef.current)` (line 150)
- In Profile Edit flow (`AddressForm.tsx`), that payload is mapped to:
  - `latitude = lat`
  - `longitude = lng`
  - `full_address = name` (line 151)
- Final DB save payload goes through `useDeliveryAddresses.ts` as full row insert/update with `full_address`, `latitude`, `longitude`.

2) Google API request audit
- Maps JS loaded with key from backend setting:
  - `admin_settings.google_maps_api_key` is active and equals `AIzaSyAGqPf40...` (verified in DB/network).
- Reverse geocode is called through JS Geocoder:
  - `geocoder.geocode({ location: { lat, lng } })`
- Actual endpoint seen in session replay:
  - `https://maps.googleapis.com/maps/api/js/GeocodeService.Search?...&1d13.070832887320721&2d77.75253546564815...&key=AIzaSyAGqPf40...`
- Places fallback called from `findNearbyPlaceName()` using legacy `PlacesService.nearbySearch(...)`.
- Actual endpoint seen in replay:
  - `.../maps/api/place/js/PlaceService.FindPlaces?...&key=AIzaSyAGqPf40...`

3) Google API response audit (raw evidence)
Using same key + same pin coordinates:
- Reverse geocode raw response contains all required fields:
  - `formatted_address` present
  - `place_id` present
  - `plus_code` present
  - `address_components` present
- Example results at this exact point:
  - Result 1: `formatted_address = "3QC3+82C, Bendiganahalli, Bengaluru..."` (POI type)
  - Result 3: `formatted_address = "Unnamed Road, Bendiganahalli, Bengaluru..."` (route)
  - Result 5: `formatted_address = "Bengaluru, Karnataka 560049, India"`
- Nearby Search raw response for same point:
  - `results[0].name = "Bengaluru"` (type locality, far generalized)
  - `results[1].name = "Mountain High Studio Cafe"` (actual POI at pin)

4) Parsing logic failure (exact)
Primary failure points:
- `findNearbyPlaceName()` picks only `results[0]` (line ~100), so it selects “Bengaluru” instead of cafe.
- `GoogleMapConfirm` displays `currentBest.name` (line 108), not full `formatted_address`.
- On confirm, app sends only that short name string, then `AddressForm` stores it as `full_address`.
- `scoreGeocoderResult()` rejects plus-code formatted addresses entirely; when POI result has plus-code formatted address, it gets discarded.
- `callerNameToLabel()` treats any non-placeholder initial text as POI quality, which can lock bad initial labels.

5) UI display logic failure
- Display field in map header is `displayName` (`<span>{displayName}</span>`) from resolver `name`, not formatted address.
- Persisted delivery `full_address` is overwritten by that display label via `handleMapConfirm`.
- So even when Google returns formatted addresses, UI/data path prefers label text.

6) Error handling audit
- Geocoder status is collapsed to `null` for non-OK (`resolve(status==='OK' ? results : null)`), without logging status/reason.
- No explicit UI error path for ZERO_RESULTS/REQUEST_DENIED/etc in map confirm.
- “Geocoding failed” string is not present in current codebase; current behavior silently falls back to label/coords.

Brutal root cause summary
- This is not an API-key issue now.
- The pipeline is architecturally mixing two different concepts:
  - `display label` (short place name)
  - `full formatted address` (postal address)
- Because of that mixing + `results[0]` fallback + legacy PlacesService behavior, you get “Bengaluru”/“Unnamed Road”/plus-code outcomes.

Implementation plan (after audit)
A) Split data contract end-to-end:
- Maintain separate fields: `display_label` and `formatted_address`.
- Never map label into `full_address`.

B) Reverse geocode source of truth:
- For pin drop, always derive `formatted_address` from geocode results (first non-plus-code formatted result).
- Keep `place_id` and components for optional enrichment.

C) Fix fallback ranking:
- If using nearby places, do not use `results[0]`.
- Filter for `establishment/point_of_interest`, then choose nearest/high-confidence.
- Migrate away from legacy `PlacesService` path (console already warns).

D) UI binding correction:
- Header may show short label, but saved address must be `formatted_address`.
- Confirmation payload should return `{ lat, lng, formattedAddress, label, placeId, components }`.

E) Observability:
- Log geocode status, selected result index, selected place_id, and fallback reason.
- Explicit user-facing error when geocode returns non-OK and no formatted address candidate.

No external documentation is required to proceed with the fix.
Optional config confirmation (recommended): whether you want UI to display “POI name + full address” or full address only in the top chip.
