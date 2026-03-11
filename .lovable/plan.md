

# Fix "No seller profile found" Error in Set Society Location

## Root Cause

The seller's `society_id` is `NULL` in `seller_profiles`. The DB function `set_my_society_coordinates` queries `SELECT society_id INTO _society_id FROM seller_profiles WHERE user_id = auth.uid()` — it finds the row, but `society_id` is NULL, so the exception fires with a misleading message.

## Fix

**Migration**: Update the function to distinguish between "no profile" and "no society assigned":

```sql
CREATE OR REPLACE FUNCTION public.set_my_society_coordinates(p_lat double precision, p_lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _society_id uuid; _found boolean;
BEGIN
  SELECT society_id, true INTO _society_id, _found
  FROM seller_profiles WHERE user_id = auth.uid() LIMIT 1;
  
  IF NOT COALESCE(_found, false) THEN
    RAISE EXCEPTION 'No seller profile found';
  END IF;
  
  IF _society_id IS NULL THEN
    RAISE EXCEPTION 'No society assigned to your seller profile. Please update your store settings first.';
  END IF;
  
  UPDATE societies SET latitude = p_lat, longitude = p_lng
  WHERE id = _society_id AND latitude IS NULL AND longitude IS NULL;
END; $$;
```

**`src/components/seller/SetSocietyLocationSheet.tsx`**: Improve the error toast to show a clearer message and, if the error mentions "No society assigned", suggest navigating to store settings.

**`src/hooks/queries/useSellerHealth.ts`**: Update the `society_coords` check — if the seller has no `society_id` at all, show a different message directing them to store settings to select a society first, rather than showing "Set Location".

