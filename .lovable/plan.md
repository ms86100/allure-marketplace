

## Bug: Store Incorrectly Marked as Closed

### Root Cause
**Timezone mismatch between client and server.**

- The database function `compute_store_status` uses `now()` which returns **UTC time**
- Store 7838 has hours 09:00 - 21:00, intended as **IST (UTC+5:30)**
- When it's 10 AM IST, the server sees **4:30 AM UTC** — outside the 09:00-21:00 window
- The client-side check uses `new Date()` (local browser time) so the UI initially shows "open"
- But when `addItem` inserts into `cart_items`, the DB trigger `validate_cart_item_store_availability_trigger` calls the server-side function, which returns "closed" and raises `STORE_CLOSED:closed`
- This causes the optimistic update to roll back, explaining the "added then reset" behavior

### Why both reported symptoms happen
1. **Homepage Add**: Optimistic toast "Added to cart" fires, then DB rejects → rollback + "Store closed" error toast
2. **Product detail Add to Cart**: Same flow — optimistic UI shows quantity stepper, DB rejects → resets to "Add to Cart ₹10"

### Fix
**Make the DB function timezone-aware.** Convert `now()` to IST (Asia/Kolkata) before comparing against store hours.

#### Database migration
Update the `compute_store_status` function to use:
```sql
v_now timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
v_current_time time := v_now::time;
v_current_day text := to_char(v_now, 'Dy');
```

This single change fixes both the trigger validation and any other server-side callers of this function.

#### Long-term consideration
Hardcoding `Asia/Kolkata` works since this is an India-only marketplace. If multi-timezone support is needed later, store a `timezone` column on `seller_profiles` and pass it into the function.

### Files to modify
- **Database migration only** — one `CREATE OR REPLACE FUNCTION` statement
- No client-side code changes needed (client already uses local time correctly)

