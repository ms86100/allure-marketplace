

# Root Cause Analysis: Missing Latitude/Longitude — Deep Investigation

## A. Root Cause Tree

```text
Seller store has NULL latitude/longitude
├── 1. ONBOARDING: Location step is optional (recently fixed but was missing)
│   ├── 1a. Seller never clicked "Set Store Location" — form allows submission without it IF society_id exists
│   ├── 1b. Seller has NO society AND skipped location — now blocked by validation (line 279) but was not before
│   └── 1c. Auto-save draft (line 184-191) creates seller_profiles row WITHOUT lat/lng — location only added on explicit save
│
├── 2. FORM STATE BUGS (Silent Failures)
│   ├── 2a. loadSellerDataIntoForm uses `seller.latitude || null` (line 139) — if lat is 0 (equator), it becomes null
│   ├── 2b. GPS/search fails silently in OnboardingLocationSheet — catch blocks show toast but form proceeds without location
│   ├── 2c. React state can be overwritten: setFormData spreads entire object, location could be lost on fast navigation
│   └── 2d. handleStepBack auto-saves draft (line 261-263) but user can navigate away before location is captured
│
├── 3. ADMIN APPROVAL: No location validation
│   ├── 3a. useSellerApplicationReview.updateSellerStatus (line 150-177) — approves without checking lat/lng
│   ├── 3b. useAdminData.updateSellerStatus (line 159-190) — approves without checking lat/lng
│   ├── 3c. useSocietyAdmin — approves without checking lat/lng
│   └── 3d. Admin UI shows NO warning/indicator for missing coordinates
│
├── 4. POST-APPROVAL EDITS
│   ├── 4a. Seller settings page can update profile fields without touching lat/lng — no regression risk here
│   ├── 4b. set_my_store_coordinates RPC (correct) — only writes when called
│   └── 4c. set_my_society_coordinates RPC — sets seller lat/lng from society, but only if seller lat IS NULL (safe)
│
├── 5. DATABASE SCHEMA
│   ├── 5a. seller_profiles.latitude is NULLABLE — no constraint prevents NULL
│   ├── 5b. seller_profiles.longitude is NULLABLE — no constraint prevents NULL
│   └── 5c. No DB trigger validates coordinates on status change to 'approved'
│
└── 6. DISCOVERY SYSTEM
    ├── 6a. search_sellers_by_location: COALESCE(sp.latitude, s.latitude) IS NOT NULL — correctly excludes NULL sellers ✓
    ├── 6b. get_location_stats: Same COALESCE pattern — correctly excludes ✓
    └── 6c. These RPCs fail SAFELY (exclude seller from results) but SILENTLY (no error raised) ✓
```

## B. Silent Failure List

| # | Location | Failure | Impact |
|---|---|---|---|
| 1 | `useSellerApplication.ts:279` | Validation only checks `!formData.latitude && !profile?.society_id` — if seller has society_id but society has no coords, it passes | Store invisible |
| 2 | `useSellerApplication.ts:139` | `seller.latitude || null` — falsy check treats `0` as null | Equator-adjacent locations lost |
| 3 | `useSellerApplication.ts:184-191` | Auto-save draft creates profile without lat/lng | Incomplete record in DB |
| 4 | `useSellerApplicationReview.ts:150-177` | Admin approves seller with no location check | Approved but invisible store |
| 5 | `useAdminData.ts:159-190` | Same — admin approves without location check | Approved but invisible store |
| 6 | `OnboardingLocationSheet.tsx:52-58` | GPS error caught, toast shown, but form continues | User can proceed without location |
| 7 | `BecomeSellerPage.tsx:86-88` | Society sellers see "Optionally set a precise location" — misleading if society has no coords | May skip required step |
| 8 | `search_sellers_by_location` RPC | Silently excludes sellers with NULL coords — no error/log | Store invisible, no alert |
| 9 | DB schema | No CHECK constraint or trigger preventing `approved` status with NULL coordinates | Data integrity gap |

## C. Data Integrity Report

| Business Name | Status | Latitude | Longitude | Society ID | Seller Type | Impact |
|---|---|---|---|---|---|---|
| Electric shock | **approved** | NULL | NULL | NULL | society_resident | **Invisible to all buyers** |
| Geeta's Kitchen | rejected | NULL | NULL | NULL | society_resident | N/A (rejected) |

**1 approved store is currently invisible.** All other approved stores have valid coordinates (either direct or via society fallback).

## D. Prevention Plan — Concrete Fixes

### Fix 1: DB Trigger — Block approval without coordinates
Create a validation trigger on `seller_profiles` that prevents `verification_status` from changing to `'approved'` when both direct coordinates AND society fallback coordinates are NULL. This is the strongest safeguard.

### Fix 2: Admin UI — Show location warning + block approve button
In both `useSellerApplicationReview` and `useAdminData`, before approving:
- Query seller's lat/lng AND society lat/lng
- If both are NULL, show error toast and block approval
- In the admin moderation UI, show a red "⚠️ No Location" badge on sellers missing coordinates

### Fix 3: Fix falsy check in loadSellerDataIntoForm
Change `seller.latitude || null` to `seller.latitude ?? null` (line 139-140) to preserve `0` values.

### Fix 4: Strengthen onboarding validation
Change the submission check from:
```
!formData.latitude && !profile?.society_id
```
to also verify the society actually has coordinates:
```
!formData.latitude && !(profile?.society_id && societyHasCoords)
```
This requires a quick lookup of the society's coordinates.

### Fix 5: Admin moderation UI indicator
Add a location status column/badge to the seller review card showing:
- ✅ Direct coordinates set
- 🟡 Using society fallback
- 🔴 No coordinates — cannot be discovered

### Fix 6: Data fix for "Electric shock"
Run an immediate update or prompt the seller to set their location via the MissingLocationBanner already added to the dashboard.

### Implementation Files

| File | Change |
|---|---|
| **New DB migration** | Validation trigger: block `approved` if no coords |
| `src/hooks/useSellerApplicationReview.ts` | Add lat/lng + society coord check before approval |
| `src/hooks/useAdminData.ts` | Same check before approval |
| `src/hooks/useSellerApplication.ts:139-140` | `|| null` → `?? null` |
| `src/hooks/useSellerApplication.ts:279` | Strengthen validation to check society coords |
| Admin moderation UI component | Add location status badge |

