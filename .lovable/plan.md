

# Reuse Existing Store Location for New Stores

## Problem
When a multi-seller creates a new store, they must go through the full location search/GPS flow every time, even if the new store is at the same location as an existing one.

## Solution
Add a "Use from existing store" option in the `StoreLocationPicker` component that appears when the user has other seller profiles with coordinates set. Tapping a store auto-fills the location without opening the map flow.

## Changes

### 1. Modify `StoreLocationPicker` in `src/pages/BecomeSellerPage.tsx`
- Accept a new prop: `existingStoreLocations` (array of `{ id, business_name, latitude, longitude }`)
- Before the "Set Store Location" button, show a list of existing stores with coordinates:
  - Each item shows store name + coordinates
  - Tapping one calls `onLocationSet(lat, lng, storeName)`
- Show a divider "or" between existing locations and the manual "Set Store Location" button
- Only render this section when `existingStoreLocations.length > 0`

### 2. Pass existing locations from `BecomeSellerPage`
- In the step where `StoreLocationPicker` is rendered, use `sellerProfiles` from `useAuth()`
- Filter to profiles that have `latitude` and `longitude` set and are not the current draft
- Pass as `existingStoreLocations` prop

### 3. Also update `SetStoreLocationSheet` (post-onboarding)
- Add a similar "Use from existing store" section at the top of the pick step
- Fetch other seller profiles for the user that have coordinates

## UX
- Section header: "Use location from another store"
- Each store shown as a tappable card with store name and a MapPin icon
- After selection, location is set immediately (no map confirm needed since it was already confirmed for the other store)

