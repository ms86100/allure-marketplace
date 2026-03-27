

# Fix Review Booking Content Cut-Off

## Problem

The review booking step's scrollable area (`div.space-y-6.overflow-y-auto`) has `pb-6` bottom padding, but the confirm button is `absolute bottom-0` with ~72px height. The price breakdown section at the bottom scrolls behind the fixed button and gets cut off — exactly what the screenshot shows.

## Fix

One line change in `ServiceBookingFlow.tsx` line 400:

Change `pb-6` → `pb-24` on the scrollable container. This adds enough clearance (~96px) so the last section (price breakdown) is fully visible above the fixed CTA button.

| File | Change |
|------|--------|
| `src/components/booking/ServiceBookingFlow.tsx` | Line 400: `pb-6` → `pb-24` |

