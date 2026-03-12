

# Final Integrity Enforcement — Remaining Items

Most safeguards are already implemented from the previous round. Here's what exists and what's still needed.

## Already Implemented ✓
- **DB trigger** `validate_seller_location_on_approval` — blocks approval without coords
- **Admin approval checks** in both `useSellerApplicationReview` and `useAdminData` — pre-validate before DB call
- **Onboarding validation** — checks society coords exist, not just society_id
- **Falsy check fix** — `??` instead of `||` for lat/lng

## Remaining Work

### 1. Discovery RPC Logging
Update `search_sellers_by_location` to log sellers excluded due to missing coordinates using `RAISE WARNING`. This adds observability without breaking the safe-exclusion behavior.

**File:** New migration  
**Change:** Add a logging CTE that identifies approved+available sellers with NULL coordinates and raises a warning for each.

### 2. Scheduled Integrity Monitor
Create a lightweight edge function `check-location-integrity` that queries for approved sellers with no discoverable coordinates and logs warnings. Schedule it via pg_cron (daily).

**Files:**
- `supabase/functions/check-location-integrity/index.ts` — queries for invalid records, logs them
- pg_cron job (via insert tool, not migration) — runs daily at 3 AM

### 3. Data Fix for "Electric shock"
Use the insert tool to revert "Electric shock" to `pending` status since it has no coordinates. Also remove the seller role so the store is no longer treated as live.

**Action:** `UPDATE seller_profiles SET verification_status = 'pending' WHERE business_name = 'Electric shock' AND latitude IS NULL AND longitude IS NULL;`

### Summary of Changes
| Item | Type | Description |
|---|---|---|
| New migration | SQL | Add logging to `search_sellers_by_location` for excluded sellers |
| `check-location-integrity` | Edge function | Daily scan for invalid approved sellers |
| pg_cron job | Data insert | Schedule daily integrity check |
| "Electric shock" fix | Data update | Revert to pending |

