

## Problem Analysis

There are **two distinct issues** here:

### Issue 1: New user signup not redirecting to profile edit page

When you sign up with phone `7838459432`, the `msg91-verify-otp` edge function creates a new user and returns `is_new_user: true`. The auth flow then shows the **Society selection step** (Step 3). After completing society selection, `handleSocietyComplete()` in `useAuthPage.ts` line 337 navigates to `/profile/edit` — this part works correctly.

**However**, the setup-test-sellers script already created auth users for these phone numbers with a different phone format (`7838459432` vs `+917838459432`), causing **duplicate auth accounts**. The OTP verification flow looks up profiles by `+917838459432` but the test data has `7838459432` without the `+91` prefix. This means:
- The edge function doesn't find the existing profile → treats it as a new user
- Creates a second auth user with the synthetic email `917838459432@phone.sociva.app`
- The new user has no society, no address, and name = "User"

For **returning users** (not new), the flow at line 193 checks `prof.name === 'User'` and redirects to `/profile/edit` — this should work. The HomePage also has a guard at line 29-31 that redirects incomplete profiles.

**The real issue**: After OTP verification for an existing-but-incomplete user, the code at line 184 checks `is_new_user`. Since the edge function found a profile (the test-seeded one), `is_new_user = false`, so it skips the society step and goes to the `else` branch (line 187-197). There it checks if `prof.name === 'User'` and redirects to `/profile/edit`. This should work — unless the profile name was set to something else by the test script (e.g., "Priya Reddy"), in which case it goes straight to `/` home.

### Issue 2: Location chip missing from header

The header location chip (line 157) requires `browsingLocation` to be non-null. The fallback chain in `BrowsingLocationContext` is:
1. localStorage override → null (nothing saved)
2. Default delivery address → requires `is_default = true` OR falls back to `addresses[0]`
3. Society coordinates → requires `profile.society_id` to be set

For the test user with `society_id = null` and delivery address `is_default = false`, the fallback chain **should still work** because `useDeliveryAddresses` does `addresses[0]` fallback. But if the user just signed up and hasn't loaded addresses yet, or the address has no coordinates, `browsingLocation` will be null → chip hidden → **no way to open location picker**.

## Plan

### Fix 1: Always show location chip in Header (even when no location is set)

**File**: `src/components/layout/Header.tsx` (line 157)

Change the condition from `{!title && browsingLocation && (` to `{!title && (`. When `browsingLocation` is null, render a "Set your location" placeholder chip that still opens the `LocationSelectorSheet`.

### Fix 2: Ensure new/incomplete users always reach profile edit

**File**: `src/hooks/useAuthPage.ts` (lines 184-197)

The existing logic already handles this correctly for both new users (society step → profile/edit) and returning incomplete users (name check → profile/edit). The problem is specifically with test data — the setup script set names like "Sagar Sharma" and "Priya Reddy", so they appear "complete" and skip the redirect.

No code change needed for the auth flow itself — it's working as designed. The test data just needs proper cleanup.

### Fix 3: Clean up duplicate auth users from test script

**Database cleanup**: Remove the duplicate auth entries created by the setup-test-sellers script that used incorrect phone formats, so the OTP flow works cleanly with the correct `+91XXXXXXXXXX` format.

### Summary of changes

| Change | File | What |
|--------|------|------|
| Always show location chip | `src/components/layout/Header.tsx` | Remove `browsingLocation &&` guard; show "Set location" when null |
| DB cleanup | SQL | Remove duplicate auth users from test script; ensure test profiles use correct `+91` phone format |

