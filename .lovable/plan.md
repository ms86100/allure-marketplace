

# 20 Bugs in Bookable Service E2E Flow

Across buyer, seller, and admin perspectives — all verified by code inspection.

---

## Critical Data Bugs

### Bug 1: Addon prices always show as `undefined` / NaN
**File**: `src/hooks/useServiceBookings.ts` line 88
**Problem**: `useBookingAddons` reads `row.price_at_booking` but the DB column is `addon_price`. The column `price_at_booking` does not exist. Every booking addon displays as `undefined` or `NaN` in `BookingAddonsSummary`.
**Fix**: Change `row.price_at_booking` → `row.addon_price`.

### Bug 2: `location_type` never passed to ServiceBookingFlow
**File**: `src/components/product/ProductDetailSheet.tsx` line 238
**Problem**: `locationType={(product as any).location_type}` — but `location_type` lives on the `service_listings` table, NOT `products`. The products table has no such column. Result: `locationType` is always `undefined`, so home-visit address field never appears and all bookings default to `at_seller`.
**Fix**: Join `service_listings` in the product query to get `location_type`, or fetch it separately in `ServiceBookingFlow`.

### Bug 3: Wrong duration passed to ServiceBookingFlow
**File**: `src/components/product/ProductDetailSheet.tsx` line 238
**Problem**: `durationMinutes={product.prep_time_minutes}` — but `prep_time_minutes` is food preparation time. The actual service duration is `duration_minutes` on `service_listings`. Buyers see "30 min session" (food prep) instead of the real service duration (e.g., 60 min).
**Fix**: Source `duration_minutes` from `service_listings` join, not `prep_time_minutes`.

### Bug 4: Buyer bookings cache not invalidated after new booking
**File**: `src/components/booking/ServiceBookingFlow.tsx` lines 287-288
**Problem**: After successful booking, only `service-slots` and `seller-service-bookings` query keys are invalidated. The `buyer-service-bookings` key (used by `BuyerBookingsCalendar`) is NOT invalidated. New booking won't show in buyer's calendar until page refresh.
**Fix**: Add `queryClient.invalidateQueries({ queryKey: ['buyer-service-bookings'] })`.

---

## Seller View Bugs

### Bug 5: Slot regeneration deletes booked slots with `booked_count = 0` after cancellation
**File**: `src/components/seller/ServiceAvailabilityManager.tsx` lines 227-232
**Problem**: When regenerating slots, `DELETE ... WHERE booked_count = 0` removes slots that had bookings that were later cancelled (booked_count decremented back to 0). If a cancellation happens, then seller regenerates, the freed-up slot is deleted and replaced with a new row — but any references from `service_bookings.slot_id` now point to a deleted row.
**Fix**: Add `AND id NOT IN (SELECT slot_id FROM service_bookings WHERE status NOT IN ('cancelled','no_show'))` to the delete.

### Bug 6: No validation that `start_time < end_time` in availability schedule
**File**: `src/components/seller/ServiceAvailabilityManager.tsx` lines 192-195
**Problem**: If a seller sets `end_time` before `start_time` (e.g., start=18:00, end=09:00), `endMinutes < startMinutes`, the while loop never executes, generating 0 slots — silently. No error shown.
**Fix**: Add validation before slot generation: if `endMinutes <= startMinutes`, show toast error and skip that day.

### Bug 7: SellerDayAgenda doesn't show `requested` bookings
**File**: `src/components/seller/SellerDayAgenda.tsx` line 33
**Problem**: Filter excludes `cancelled` and `no_show` but `requested` bookings (pending acceptance) are shown in the agenda without any visual distinction from confirmed ones. Seller may think these are confirmed when they're not yet accepted.
**Fix**: Add visual indicator or separate section for `requested` vs `confirmed/scheduled` bookings.

### Bug 8: ServiceBookingStats counts bookings from past 7 days, not future
**File**: `src/hooks/useServiceBookings.ts` lines 36-37
**Problem**: `useSellerServiceBookings` fetches bookings with `booking_date >= (now - 7 days)`. This means the "Pending" and "Upcoming" counts in `ServiceBookingStats` include past bookings too. The "Today" count is correct but "Upcoming confirmed" may include yesterday's confirmed booking that wasn't completed.
**Fix**: For stats, filter `upcomingConfirmed` to only `booking_date >= todayStr` (already done on line 21 but using `>=` which is correct). However, the underlying query includes past-week data which inflates total counts.

---

## Buyer View Bugs

### Bug 9: No reschedule UI exists despite DB function
**Files**: Entire `src/components/booking/` directory
**Problem**: `reschedule_service_booking()` RPC exists in the DB, documentation references it, status flow includes `rescheduled` state — but there is ZERO UI for buyers or sellers to trigger a reschedule. The feature is documented but completely unimplemented in the frontend.
**Fix**: Add a "Reschedule" button to the order detail page for bookings in `confirmed`/`scheduled` status.

### Bug 10: UpcomingAppointmentBanner uses incorrect status filter syntax
**File**: `src/components/home/UpcomingAppointmentBanner.tsx` line 49
**Problem**: `.not('status', 'in', '("cancelled","completed","no_show")')` — the double quotes inside the string may cause Supabase PostgREST parsing issues. Standard format uses parentheses without internal quotes: `'(cancelled,completed,no_show)'`. If this silently fails, ALL bookings appear.
**Fix**: Change to `.not('status', 'in', '(cancelled,completed,no_show)')` to match the pattern used elsewhere.

### Bug 11: BuyerBookingsCalendar doesn't include `requested` in "Next Appointment"
**File**: `src/components/booking/BuyerBookingsCalendar.tsx` line 68
**Problem**: `nextBooking` only considers `confirmed`, `scheduled`, `rescheduled` — but newly created bookings start as `requested`. A buyer who just booked won't see their booking highlighted as "Next Appointment" until the seller confirms.
**Fix**: Add `'requested'` to the status filter array.

### Bug 12: CalendarExportButton constructs invalid Date for times without seconds
**File**: `src/components/booking/CalendarExportButton.tsx` line 18-19
**Problem**: `new Date('2025-03-21T09:00')` — time strings from DB are in `HH:MM:SS` format but may be passed as `HH:MM` (after `.slice(0,5)`). On some browsers, `new Date('YYYY-MM-DDT09:00')` without seconds is valid; on others it returns `Invalid Date`. Safari is particularly strict.
**Fix**: Ensure time always has seconds: `${props.startTime.length === 5 ? props.startTime + ':00' : props.startTime}`.

---

## Admin View Bugs

### Bug 13: Admin bookings page has no date filter
**File**: `src/pages/AdminServiceBookingsPage.tsx`
**Problem**: Admin can only filter by status and search by name. There's no date range filter. With 200+ bookings, finding bookings for a specific day requires scrolling. The `ORDER BY booking_date DESC` helps but large datasets make this impractical.
**Fix**: Add a date picker or at minimum "Today / This Week / This Month / All" quick filters.

### Bug 14: Admin bookings page doesn't link to order detail
**File**: `src/pages/AdminServiceBookingsPage.tsx` lines 117-137
**Problem**: Booking cards are not clickable. Admin sees booking info but cannot navigate to the order detail page to take action. The `order_id` is fetched but never used for navigation.
**Fix**: Wrap each card in a `Link` to `/orders/${booking.order_id}`.

### Bug 15: Admin bookings page doesn't show buyer address for home visits
**File**: `src/pages/AdminServiceBookingsPage.tsx` line 36
**Problem**: The query selects `location_type` but doesn't fetch `buyer_address`. For home-visit bookings, admin can't see where the service is happening.
**Fix**: Add `buyer_address` to the select and display it for home visit bookings.

---

## Cross-Cutting Bugs

### Bug 16: NewOrderAlertOverlay triggers ref warning (active console error)
**File**: `src/components/seller/NewOrderAlertOverlay.tsx` + framer-motion AnimatePresence
**Problem**: Console logs show: `ref is not a prop` error from `PopChild` inside `AnimatePresence`. The inner `motion.div` component receives a ref from `AnimatePresence` but the pattern triggers React's ref warning. This is a live production console error visible on every seller view.
**Fix**: Wrap the inner content in `forwardRef` or use `motion.div` with explicit ref handling.

### Bug 17: Booking reminders use UTC times but bookings store local times
**File**: `supabase/functions/send-booking-reminders/index.ts` lines 38-41
**Problem**: `fromTime.toISOString().slice(11, 19)` produces UTC time strings, but `service_bookings.start_time` stores local times (Indian Standard Time). A booking at 10:00 AM IST would be matched against 10:00 UTC (which is 3:30 PM IST), causing reminders to fire 5.5 hours late.
**Fix**: Apply timezone offset to the comparison, or convert booking times to UTC before matching.

### Bug 18: Recurring booking config saves but never auto-generates future bookings
**File**: `src/components/booking/ServiceBookingFlow.tsx` lines 255-272
**Problem**: The recurring config is saved to `service_recurring_configs` table, but there is no cron job or edge function that reads this config and auto-generates future bookings. The "Appointments will be auto-booked" promise (in `RecurringBookingSelector`) is a lie — the config just sits in the DB doing nothing.
**Fix**: Either build the cron function to process recurring configs, or disable the feature and remove the misleading copy.

### Bug 19: `BuyerCancelBooking` bypasses the workflow engine
**File**: `src/components/booking/BuyerCancelBooking.tsx` lines 96-114
**Problem**: Cancellation directly updates `service_bookings.status` and `orders.status` via client-side `.update()` calls, completely bypassing the `validate_order_status_transition` trigger. This means invalid transitions are possible — a buyer could cancel a booking that's `in_progress` if the terminal status check (line 36-37) has stale data.
**Fix**: Use the `buyer_cancel_order` RPC (which respects transition validation) or a dedicated `cancel_service_booking` RPC.

### Bug 20: `subcategoryId` passed but product query doesn't join subcategory data
**File**: `src/components/product/ProductDetailSheet.tsx` line 238
**Problem**: `subcategoryId={(product as any).subcategory_id}` — while `products.subcategory_id` exists, the subcategory's `supports_addons` and `supports_recurring` flags are fetched inside `ServiceBookingFlow` via a separate `useSubcategories` hook that queries by `category_config_id`, not by subcategory ID directly. If the category config isn't loaded, addon and recurring features silently fail to appear even when configured.
**Fix**: Pass the subcategory data directly or ensure the config→subcategory chain resolves correctly.

---

## Summary by Severity

| Severity | Bugs | Impact |
|----------|------|--------|
| **Data corruption / wrong values** | #1, #2, #3, #5, #17 | Users see wrong prices, wrong location, wrong times |
| **Feature completely broken** | #9, #18 | Reschedule & recurring advertised but non-functional |
| **Silent failures** | #4, #6, #10, #11, #20 | Data not refreshed, slots not generated, bookings missing |
| **UX gaps** | #7, #8, #12, #13, #14, #15 | Missing admin tools, confusing displays |
| **Console errors** | #16 | Production error visible in DevTools |
| **Security / integrity** | #19 | Workflow bypass could cause invalid states |

Recommended fix order: #1, #2, #3 (data correctness), then #17, #19 (integrity), then #4, #10, #11 (silent failures), then remaining items.

