

# Fix: Booking Sheet Layout Spacing

## Problem
The `ServiceBookingFlow` drawer content has no horizontal padding. The `DrawerHeader` has `p-4` but the main content `div` (line 363) has only `space-y-6` with zero `px`. The `TimeSlotPicker` date row uses `-mx-1 px-1` — nearly edge-to-edge.

## Changes

### 1. `ServiceBookingFlow.tsx` — Add `px-4` to content wrapper
- Line 363: Change `className="space-y-6 overflow-y-auto pb-6"` to `className="space-y-6 overflow-y-auto pb-6 px-4"`
- Same for the review step content and the bottom CTA button area

### 2. `TimeSlotPicker.tsx` — Fix date scroll row to bleed correctly
- Line 124: Change `-mx-1 px-1` to `-mx-4 px-4` so the scrollable date row extends to the drawer edges while the rest of the content respects the `px-4` padding. This gives the date cards breathing room from the visible boundary while allowing natural horizontal scroll.

### 3. `BookingSheet.tsx` — Apply same `px-4` pattern
- The other booking sheet uses the same `TimeSlotPicker` and likely has the same edge-to-edge issue. Add `px-4` to its content wrapper for consistency.

## Result
All content inside the booking drawer gets consistent 16px left/right margins. Scrollable rows (date selector) still scroll naturally but start/end with proper inset. Matches the `DrawerHeader` padding.

