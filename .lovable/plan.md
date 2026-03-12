

# Fix Store Location Icon and Midnight Availability Bug

## Issue 1: Missing clickable location icon on Seller Detail Page

The seller detail page (line 362-366) shows `MapPin` + society name as static text. It does NOT have a clickable button to open Google Maps, unlike `ListingCard.tsx` which opens `https://www.google.com/maps/search/?api=1&query={lat},{lng}`.

**Fix in `src/pages/SellerDetailPage.tsx`**: Make the existing MapPin + society name row clickable. When the seller has coordinates (direct or via society fallback), wrap the location span in a button that opens Google Maps.

## Issue 2: Midnight `availability_end` bug

**Root cause**: `computeStoreStatus` in `src/lib/store-availability.ts` parses `00:00:00` as 0 minutes. The open check `currentMinutes >= startMinutes && currentMinutes < endMinutes` becomes `currentMinutes >= 540 && currentMinutes < 0` — always false.

The same bug exists in the DB function `compute_store_status` which also compares `v_current_time >= p_start AND v_current_time < p_end` — `00:00:00` is midnight start-of-day, so this also always fails.

**Fix**:
- **Client-side** (`src/lib/store-availability.ts`): If `endMinutes === 0`, treat it as `1440` (end of day).
- **DB function** (`compute_store_status`): If `p_end = '00:00:00'`, treat it as `'23:59:59'` for comparison purposes. This requires a migration.

## Files to modify

1. `src/pages/SellerDetailPage.tsx` — Add clickable location button with Google Maps link
2. `src/lib/store-availability.ts` — Fix midnight end-time handling
3. DB migration — Fix `compute_store_status` function for midnight end-time

