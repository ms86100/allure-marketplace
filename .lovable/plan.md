

# Fix Missing Notifications & Restore Header Buttons

## Issues Found

### 1. No notification sent on license approve/reject
Both `updateLicenseStatus` functions (in `useSellerApplicationReview.ts` and `LicenseManager.tsx`) only update the `seller_licenses` table — they never insert into `user_notifications` or `notification_queue`, and never send a push notification. Compare this with `updateSellerStatus` which inserts into `user_notifications` on approval/rejection.

### 2. Missing seller dashboard shortcut in Header
The Header (`Header.tsx`) has shortcuts for builder (`/builder`), admin (`/admin`), and society admin (`Building2` icon), but there is no seller dashboard link (`/seller/dashboard`). This was likely never added or was lost during a refactor.

### 3. Bell icon & profile avatar gated behind `isApproved`
The bell icon and profile avatar are wrapped in `{isApproved && (...)}` (line 119). If the user's profile `verification_status` is not `'approved'`, these disappear. This is likely intentional — but worth noting. The buttons the user sees missing may be because they're testing with a non-approved profile, or it could be a viewport/layout issue on the current route.

---

## Plan

### A. Add license status notification to seller (both files)

**Files**: `src/hooks/useSellerApplicationReview.ts`, `src/components/admin/LicenseManager.tsx`

After updating `seller_licenses` status, insert a row into `user_notifications` for the seller's `user_id` and send a push notification:

- Look up the seller's `user_id` from the license's `seller_id` → `seller_profiles.user_id`
- Insert into `user_notifications` with appropriate title/body:
  - Approved: "Your [license_type] has been verified!"
  - Rejected: "Your [license_type] was rejected. [admin_notes]"
- Call `sendPushNotification` for real-time delivery

### B. Add seller dashboard shortcut to Header

**File**: `src/components/layout/Header.tsx`

- Import `isSeller` from `useAuth()`
- Add a `Store` icon button linking to `/seller/dashboard`, shown when `isSeller` is true, placed alongside the existing builder/admin shortcuts

### C. Ensure bell icon is visible for all logged-in users

**File**: `src/components/layout/Header.tsx`

- Move the bell icon + profile avatar outside the `isApproved` gate — show them for any authenticated `user` (not just approved profiles). A seller going through onboarding still needs to see notifications.

---

## Files Changed
- **Edit**: `src/hooks/useSellerApplicationReview.ts` — add notification insert + push after license status update
- **Edit**: `src/components/admin/LicenseManager.tsx` — same notification logic
- **Edit**: `src/components/layout/Header.tsx` — add seller dashboard shortcut, show bell/avatar for all logged-in users

