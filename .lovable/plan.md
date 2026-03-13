

# Fix: Allow Rejected Sellers to Update Store Location

## Problem

The `SellerRoute` guard in `App.tsx` (line 265-269) requires `isSeller === true` to access `/seller/*` routes. But `isSeller` is only `true` when at least one seller profile has `verification_status === 'approved'` (AuthProvider.tsx line 29). This locks rejected/pending sellers out of `/seller/settings` where they could update their location.

The **resubmission flow** on `/become-seller` already includes the `StoreLocationPicker` component — so technically a rejected seller CAN update their location through that path. But there are two gaps:

1. **The rejected seller may not know to go to `/become-seller`** — the rejection notification links to `/orders/` or has no clear path to the fix.
2. **The `SellerRoute` is unnecessarily strict** — a seller with a `draft`, `pending`, or `rejected` profile should still be able to access settings to fix issues.

## Solution

### Change 1: Relax `isSeller` to include non-approved seller profiles for route access

In `AuthProvider.tsx`, add a new `hasSellerProfile` boolean that's `true` if the user has ANY seller profile (regardless of status). Use this for route gating while keeping `isSeller` for feature-level checks (like order alerts).

In `App.tsx`, update `SellerRoute` to allow access if the user has any seller profile OR is admin.

### Change 2: Show rejection banner with location fix on Seller Dashboard

In `SellerDashboardPage.tsx`, if the seller's `verification_status` is `rejected`, show a prominent banner with:
- The rejection reason (if available)
- A direct "Update & Resubmit" button linking to `/become-seller`
- If specifically rejected for missing location, a direct "Set Location" action

### Change 3: Show status-aware UI on Seller Settings

In `SellerSettingsPage.tsx`, if the seller profile is `rejected` or `pending`, show a contextual banner explaining the status and allowing edits + resubmission.

## Files to Change

1. **`src/contexts/auth/AuthProvider.tsx`** — Add `hasSellerProfile` flag (any seller profile exists)
2. **`src/contexts/auth/types.ts`** — Add `hasSellerProfile` to type
3. **`src/App.tsx`** — Update `SellerRoute` to use `hasSellerProfile || isAdmin`
4. **`src/pages/SellerDashboardPage.tsx`** — Add rejection/pending banner with resubmit link
5. **`src/pages/SellerSettingsPage.tsx`** — Add status banner for non-approved sellers

## Technical Detail

The key change is in `AuthProvider.tsx`:
```typescript
const isSeller = roles.includes('seller') && sellerProfiles.some(s => s.verification_status === 'approved');
const hasSellerProfile = roles.includes('seller') && sellerProfiles.length > 0; // NEW
```

And in `SellerRoute`:
```typescript
if (!hasSellerProfile && !isAdmin) return <Navigate to="/" replace />;
```

This preserves the existing `isSeller` semantics (used for order alerts, seller-specific features) while unlocking route access for sellers who need to fix their profiles.

