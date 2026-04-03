

# Fix Onboarding Flow — 3 Issues

## Issue 1: Flicker on Login Redirect
**Root cause**: When a returning user with incomplete profile logs in, `useAuthPage.ts` line 194 navigates to `/profile/edit`. But `ProtectedRoute` first renders `HomePage`, which has its own `useEffect` redirect to `/profile/edit` (line 33-37). The HomePage content briefly renders before the effect fires — causing a visible flash of the marketplace/society search UI.

**Fix in `HomePage.tsx`**: Instead of using a `useEffect` for the redirect (which renders one frame first), add an early return **before** the main JSX. If `profile` exists and is incomplete, return `<Navigate to="/profile/edit" replace />` synchronously — no flash.

```
// Replace the useEffect redirect with a synchronous check
if (profile && (!profile.name || profile.name === 'User')) {
  return <Navigate to="/profile/edit" replace />;
}
```

Remove the existing `useEffect` that does the same thing (lines 31-38).

## Issue 2: Cancel Button Creates Infinite Re-open Loop
**Root cause**: When there are no addresses, `shouldAutoOpen` is `true`, which renders `AddressForm`. Clicking Cancel sets `showAddressForm = false`, but since `addresses.length` is still 0, `shouldAutoOpen` recalculates to `true` and the form immediately re-opens. The Cancel button is effectively broken for first-time users.

**Fix in `ProfileEditPage.tsx`**: Add a `dismissedAutoOpen` state. When Cancel is clicked during auto-open, set this flag to `true`. Include `!dismissedAutoOpen` in the `shouldAutoOpen` condition. When dismissed, show the empty address state with an "Add Address" button instead of the form.

```
const [dismissedAutoOpen, setDismissedAutoOpen] = useState(false);
const shouldAutoOpen = !addressesLoading && addresses.length === 0 
  && !showAddressForm && !dismissedAutoOpen;

// Update the onCancel handler:
onCancel={() => { 
  setShowAddressForm(false); 
  setEditingAddress(null); 
  setDismissedAutoOpen(true); 
}}
```

## Issue 3: Profile Completion Prompt on Home
**Status**: Already implemented in `HomePage.tsx` lines 87-104. Shows a progress bar with "Profile X% complete" and an "Update" link when name, flat_number, or block are missing. No changes needed.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/HomePage.tsx` | Replace useEffect redirect with synchronous `<Navigate>` early return |
| `src/pages/ProfileEditPage.tsx` | Add `dismissedAutoOpen` state to fix Cancel button loop |

## Technical Notes
- Both fixes are purely UI logic — no DB or backend changes
- The synchronous redirect in HomePage eliminates the flash entirely since React never renders the page content
- The `dismissedAutoOpen` flag resets naturally on page reload, so it doesn't persist unnecessarily

