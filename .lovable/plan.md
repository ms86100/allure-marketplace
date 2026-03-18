

# Bug Fix: "column p.latitude does not exist"

## Root Cause

Two database triggers query `profiles.latitude` which doesn't exist. The `latitude`/`longitude` columns are on `seller_profiles`, not `profiles`. The alias `p` refers to `profiles`, so `p.latitude` fails.

**Affected triggers:**
1. `trg_compute_delivery_eta` (fires on `accepted` — this is the error in the screenshot)
2. `trg_create_seller_delivery_assignment` (fires on `picked_up` — would fail next)

Both have identical wrong code:
```sql
SELECT p.latitude, p.longitude INTO _seller_lat, _seller_lng
FROM profiles p
JOIN seller_profiles sp ON sp.user_id = p.id
WHERE sp.id = NEW.seller_id;
```

Should be `sp.latitude, sp.longitude` instead of `p.latitude, p.longitude`.

## Fix

Single database migration to recreate both trigger functions, changing `p.latitude` → `sp.latitude` and `p.longitude` → `sp.longitude`.

No frontend changes needed.

