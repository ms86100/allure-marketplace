

# Analysis: Society System Architecture & Location Setting UX

## Audit Findings

### Why Society Name Matters — Deep Dependency Analysis

The `societies` table is a **core entity** — not just a label. It serves as the hub for:

1. **Community features** — Bulletin posts, help requests, disputes, snag tickets, gate entries, finances, worker management — ALL scoped by `society_id`. Without a society, a resident cannot participate in any community feature.

2. **Marketplace discovery** — The `search_sellers_by_location` function joins `seller_profiles → societies` to get coordinates. Sellers without a `society_id` are **invisible** in all discovery queries.

3. **Order processing** — `create_multi_vendor_orders` reads buyer's `society_id` from profiles. Orders store `society_id`, `buyer_society_id`, `seller_society_id` for cross-society logic.

4. **Trust & identity** — Profiles display "Flat B-204, Green Valley Society". Society membership is the core identity anchor.

### The Two-User Scenario

- **User A** (picks existing society "Green Valley"): Gets linked to `societies.id = abc123`. All community features work. Seller store inherits coordinates from society.

- **User B** (pins location on map, no society name): Currently, a new society row IS created during signup via `validate-society` edge function with the Google Place data. So User B gets a society — but it may be a **duplicate** of User A's society with a different name/slug.

**Key insight**: The system already handles "no society name" by creating a society from Google Places data. The problem is not that society names are required — it's that the **seller location setting flow** doesn't provide an inline way to set coordinates.

### Current Seller Location Issue

When a seller's society has no coordinates:
- The checklist shows "Set Location" → opens `SetSocietyLocationSheet` → GPS only
- If society_id is NULL → redirects to `/seller/settings` with no context

Both flows are poor UX. The user needs an **inline autocomplete + map confirm** approach.

## Proposed Solution

Redesign `SetSocietyLocationSheet` to offer **Google Maps autocomplete search** as the primary input, with GPS as secondary. This keeps the drawer-based approach (which works well from the checklist) but makes it actually useful.

### Changes

**`src/components/seller/SetSocietyLocationSheet.tsx`** — Redesign:

```text
┌─────────────────────────────────────────┐
│  Set Society Location                   │
│  Search for your society or area        │
│                                         │
│  🔍 [Search your society/area...    ]   │  ← Google Places autocomplete
│                                         │
│  — or —                                 │
│                                         │
│  📍 Use Current Location                │  ← existing GPS button
│                                         │
│  (after selection → map confirm step)   │
└─────────────────────────────────────────┘
```

- Step 1: Show search field (Google Places autocomplete) + "Use Current Location" button
- On place select: extract lat/lng from place, move to step 2 (GoogleMapConfirm)
- On GPS: same as current flow → step 2
- Step 2: GoogleMapConfirm with draggable pin → confirm → RPC call

**Reuse existing infrastructure**:
- `useGoogleMaps()` hook already loaded
- Google Places Autocomplete API already used in auth flow (`useAuthPage.ts` has `predictions`, `handleSelectPlace`)
- `GoogleMapConfirm` component already exists

**No schema changes needed** — the `set_my_society_coordinates` RPC already works correctly for the case where `society_id` exists and coordinates are NULL.

### For the "no society_id" case

This is a separate, deeper issue. Sellers inherit `society_id` from their profile at onboarding time (`society_id: profile?.society_id || null`). If a user signed up without a society (which shouldn't normally happen given the auth flow), the seller profile has no society link. The current "Update Settings" redirect is fine for this edge case — it's rare and needs manual resolution.

### Files Changed

1. **`src/components/seller/SetSocietyLocationSheet.tsx`** — Add Google Places autocomplete search field as primary input, keep GPS as secondary option. Both lead to GoogleMapConfirm step.

