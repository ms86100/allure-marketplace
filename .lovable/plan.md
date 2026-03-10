## Plan: Remove Admin Approval Gate — Direct Access After OTP + Society Selection

### Problem

After OTP verification and society selection, new users land on a "Verification Pending" screen waiting for admin approval. You want users to go straight to the homepage.

### Root Cause

1. `handle_new_user()` DB trigger sets `verification_status = 'pending'` by default (only `'approved'` if `auto_approve_residents = true`)
2. `HomePage.tsx` line 27-28 checks `!isApproved && profile` → shows `VerificationPendingScreen`
3. `isApproved` in `AuthProvider.tsx` = `profile?.verification_status === 'approved'`

### Changes

**1. Database Migration — Always auto-approve new users**

Update the `handle_new_user()` trigger function to set `verification_status = 'approved'` for all new users, removing the conditional check on `auto_approve_residents`.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
  -- Change: _verification_status text := 'approved';  (was 'pending')
  -- Remove the auto_approve_residents conditional block
```

**2. `src/pages/HomePage.tsx` — Remove verification gate**

- Remove the `VerificationPendingScreen` import
- Remove the `!isApproved && profile` check (lines 27-29)
- Change onboarding guard from `isApproved` to `profile` (line 23)
- Remove `isApproved` from the destructured `useAuth()` call

**3. `src/components/onboarding/OnboardingWalkthrough.tsx` — No changes needed**

The onboarding walkthrough and `useOnboarding` hook work independently of approval status.

### Files Affected


| File                           | Change                                             |
| ------------------------------ | -------------------------------------------------- |
| DB trigger `handle_new_user()` | Default to `'approved'` instead of `'pending'`     |
| `src/pages/HomePage.tsx`       | Remove verification gate, fix onboarding condition |


### What stays

- `isApproved` flag remains in AuthContext (used by queries to gate data fetching — those continue to work since users will now always be approved)
- `VerificationPendingScreen` file kept (unused but harmless; can be cleaned up later)
- Society admin panel's manual approval UI stays (for edge cases or future use)