

# Fix Builder Member Experience

## Problem

When tester3 logs in as a builder member, they can't see or access anything related to their builder role. Three issues cause this:

1. **No navigation to the Builder Dashboard** -- The `/builder` route exists, but there is no link anywhere in the app (Profile page, Bottom Nav, Header) for builder members to reach it. It's a dead route unless you type the URL manually.

2. **tester3's society doesn't match the builder's society** -- tester3 belongs to "Hoskote Toll Plaza" but the builder (Prestige Group) is linked to "Prestige Tranquility". Since feature packages cascade from Builder to Society, tester3's own society is unaffected by the builder's plan.

3. **No builder-specific navigation** -- Builder members should see a distinct experience when they log in, similar to how security officers and workers get their own bottom nav.

## Solution

### Step 1: Add "Builder Dashboard" link in the Profile page

Add a visible link to `/builder` in the Profile page, shown only when `isBuilderMember` is true. This gives builder members a clear way to access their dashboard.

**File:** `src/pages/ProfilePage.tsx`
- Import `Building2` icon from lucide-react
- Import `isBuilderMember` from `useAuth()`
- Add a "Builder Dashboard" menu item (similar to Admin/Seller links) that navigates to `/builder`

### Step 2: Add builder link in the Header

When a user is a builder member, show a small builder icon/button in the Header that links to `/builder`.

**File:** `src/components/layout/Header.tsx`
- Add a `Building2` icon button next to other header actions when `isBuilderMember` is true
- Links to `/builder`

### Step 3: (No code change -- Data fix)

If you want tester3 to see the builder's feature plan affecting their own society experience, you need to either:
- Link "Hoskote Toll Plaza" to the Prestige Group builder via the Manage sheet, OR
- Change tester3's society to "Prestige Tranquility"

This is a data configuration step, not a code fix.

## Technical Details

### Modified Files
- `src/pages/ProfilePage.tsx` -- Add "Builder Dashboard" navigation item visible to builder members
- `src/components/layout/Header.tsx` -- Add builder shortcut icon in header for builder members

### What This Fixes
- Builder members will see a clear "Builder Dashboard" option in their profile
- Builder members can quickly access their dashboard from the header
- The full builder portfolio management experience becomes discoverable

