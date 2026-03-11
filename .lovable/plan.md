

# Add "Set Society Location" Action for Sellers

## Problem
When a society has no coordinates, the visibility checklist says "Contact your society admin" — but there's nothing the admin can do through the app. The seller is stuck.

## Solution
Allow sellers to set their society's coordinates directly from the checklist, following the same pattern as "Add Logo" and "Add Description".

## Implementation

### 1. Database: Security Definer Function (migration)
Create a function `set_society_coordinates(p_lat, p_lng)` that:
- Looks up the caller's society via their `seller_profiles.society_id`
- Only updates if coordinates are currently NULL (prevents overwriting existing coords)
- Uses `SECURITY DEFINER` to bypass the admin-only RLS on `societies`

```sql
CREATE OR REPLACE FUNCTION public.set_my_society_coordinates(p_lat double precision, p_lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _society_id uuid;
BEGIN
  SELECT society_id INTO _society_id FROM seller_profiles WHERE user_id = auth.uid() LIMIT 1;
  IF _society_id IS NULL THEN RAISE EXCEPTION 'No seller profile found'; END IF;
  UPDATE societies SET latitude = p_lat, longitude = p_lng
  WHERE id = _society_id AND latitude IS NULL AND longitude IS NULL;
END; $$;
```

### 2. New Component: `SetSocietyLocationSheet.tsx`
A bottom sheet (Drawer) that:
- Step 1: "Use Current Location" button OR Google Places autocomplete search
- Step 2: Shows `GoogleMapConfirm` with draggable pin (reuses existing component)
- On confirm: calls `supabase.rpc('set_my_society_coordinates', { p_lat, p_lng })`
- Invalidates `seller-health` query on success

### 3. Update Visibility Checklist Hook
In `useSellerHealth.ts`, change the `society_coords` fail check to include an `actionLabel` and `actionRoute`:
- `actionLabel: 'Set Location'`
- `actionRoute: '#set-society-location'` (special route handled by checklist)

### 4. Update `SellerVisibilityChecklist.tsx`
Add state for the location sheet. When the "Set Location" action is clicked (detected by the `#set-society-location` route), open `SetSocietyLocationSheet` instead of navigating.

### Files Changed
- **1 migration** — `set_my_society_coordinates` RPC function
- **New**: `src/components/seller/SetSocietyLocationSheet.tsx` — location picker sheet
- **Edit**: `src/hooks/queries/useSellerHealth.ts` — add actionLabel/actionRoute to society_coords fail
- **Edit**: `src/components/seller/SellerVisibilityChecklist.tsx` — handle special action to open location sheet

