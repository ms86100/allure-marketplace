
Audit result (brutally honest):

1) The current code is choosing a low-quality reverse-geocode label too early.
- In `src/components/auth/GoogleMapConfirm.tsx`, `extractBestName()` treats `route` as a valid winner.
- For your pin, Google returns a route-level label (`"Unnamed Road"`), so it is accepted immediately.
- Because a “bestName” exists, the Places fallback is never executed.

2) The fallback that could return a POI (like “Tmax Cafe…”) is gated behind failure conditions that are too narrow.
- Current fallback only runs when geocoder fails or all results are plus-codes.
- It does not run for generic-but-valid geocoder labels like `"Unnamed Road"`.

3) The fallback implementation itself uses legacy Places search (`PlacesService.nearbySearch`).
- Your autocomplete flow uses newer Places APIs, but fallback uses legacy API style.
- If legacy Places is not enabled or differently restricted, fallback may silently return null even when a place exists.

4) Some flows overwrite better known names with worse geocode output.
- `OnboardingLocationSheet` and `SetStoreLocationSheet` pass `"Store Location"` into confirm step.
- If user selected a known place from autocomplete, that known label is not preserved as a preferred candidate.
- Then reverse geocode can downgrade it to `"Unnamed Road"`.

5) There is also a separate low-quality geocode path in profile address flow.
- In `src/components/profile/AddressForm.tsx`, GPS detection still uses `results[0].formatted_address` directly.
- That can produce generic labels before the map-confirm step.

What is NOT the root problem:
- API key persistence is now correct in DB (`admin_settings`) and active.
- This is no longer the old key-caching issue.
- Zoom cap in code is already high (`maxZoom: 21`); “cannot zoom further” is usually tile-detail/imagery availability at that location, not UI cap.

Implementation plan:

A) Build a shared “location label resolver” with quality scoring (new utility)
- Reject plus-codes.
- Mark generic labels as low-quality (`Unnamed Road`, etc.).
- Rank candidates: POI/establishment/premise > neighborhood/sublocality > route > coords.
- Never overwrite a higher-quality existing name with a lower-quality one.

B) Refactor `GoogleMapConfirm` to resolve labels by quality, not first match
- Geocoder candidate + Places candidate are both evaluated.
- Trigger Places lookup when geocoder result is generic (not only on total failure).
- Prefer POI/place display name when available; fallback to formatted address; fallback to coords last.

C) Remove legacy-dependency risk in fallback path
- Replace `nearbySearch` fallback with the newer Places flow already used elsewhere (`importLibrary('places')` + modern place details flow), so behavior is consistent with autocomplete and avoids legacy mismatch.

D) Preserve known selected place labels in sheets
- In `OnboardingLocationSheet` and `SetStoreLocationSheet`, keep the selected place name/address and pass it into map confirm as a high-priority initial candidate.
- Only update if new reverse result is better quality.

E) Align `AddressForm` GPS geocode with the same resolver
- Stop using raw `results[0].formatted_address`.
- Reuse shared resolver so profile/edit and seller flows behave identically.

F) Verification checklist (end-to-end)
- Reproduce at your exact Budigere/Tmax Cafe pin.
- Confirm label is POI/full address, never plus-code, never “Unnamed Road” when a better candidate exists.
- Drag pin slightly and ensure label quality stays stable.
- Test both “Search place” and “Use current location” paths in `/#/profile/edit` and seller location sheets.

Technical details (files to change):
- `src/components/auth/GoogleMapConfirm.tsx` (core resolver usage + fallback behavior)
- `src/hooks/useGoogleMaps.ts` (export modern place helpers if needed)
- `src/components/profile/AddressForm.tsx` (replace direct `results[0]` geocode usage)
- `src/components/seller/OnboardingLocationSheet.tsx` (preserve selected place label)
- `src/components/seller/SetStoreLocationSheet.tsx` (preserve selected place label)
- (new) shared utility file for label scoring/resolution to avoid duplicated logic
