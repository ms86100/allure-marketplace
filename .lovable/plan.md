

# Fix: Empty Schedule Tab Shows Nothing

## Problem
The Schedule tab renders two components — `ServiceBookingStats` and `SellerDayAgenda` — both of which return `null` when there are no service bookings. This leaves the seller staring at a blank tab with no explanation.

## Fix

### 1. Add empty state to Schedule tab (`SellerDashboardPage.tsx`)
Wrap the Schedule tab content with a fallback empty state that shows when there are no bookings. The empty state will:
- Show a calendar icon with a message like "No upcoming bookings"
- Differentiate between sellers who have service listings (encourage sharing) vs those who don't (link to add a service)

### 2. Update `SellerDayAgenda.tsx` — show empty state for today
Instead of returning `null` when there are no today bookings but there ARE bookings in general, show a small "No appointments today" message so the component is always visible when the seller has any service activity.

### Files to change
- `src/pages/SellerDashboardPage.tsx` — add empty state wrapper in Schedule tab
- `src/components/seller/SellerDayAgenda.tsx` — show "Nothing scheduled today" instead of `null`

