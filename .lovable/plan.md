

# Buyer-Side Service Booking — 10 Critical Bugs

## Bug 1: `BuyerCancelBooking` Component Is Never Used

**Description:** The `BuyerCancelBooking` component exists in `src/components/booking/BuyerCancelBooking.tsx` but is never imported or rendered anywhere. The `OrderDetailPage` uses `OrderCancellation` for buyer cancellation (line 693), which is a generic order cancellation — it does NOT release the service slot or update the `service_bookings` record.

**Why Critical:** When a buyer cancels a service booking via `OrderCancellation`, the order gets cancelled but the service slot `booked_count` is never decremented, and the `service_bookings` row status remains unchanged. The slot is permanently "consumed" — other buyers can't book it.

**Where:** `OrderDetailPage.tsx` line 693, `BuyerCancelBooking.tsx` (dead code)

**Impact:** Slot inventory leak. Every cancelled booking permanently reduces available capacity. Over time sellers appear to have no availability.

**Fix Risk:** Low. Replacing `OrderCancellation` with `BuyerCancelBooking` for service orders is surgical. Must verify `buyer_cancel_order` RPC + `release_service_slot` RPC are both called.

**Mitigation:** For service bookings (`serviceBooking` is truthy), render `BuyerCancelBooking` instead of `OrderCancellation` in the buyer action bar. The component already handles slot release + booking status update + seller notification.

---

## Bug 2: `fulfillment_type` Uses Prop `locationType` Instead of `resolvedLocation`

**Description:** In `ServiceBookingFlow.tsx` line 223, the order insert uses `locationType` (the raw prop from `ProductDetailSheet`) for `fulfillment_type`, but line 244 uses the correct `resolvedLocationType` (from `service_listings` DB lookup) for the booking RPC. This creates a mismatch — the order record may say `at_seller` while the booking says `home_visit`.

**Why Critical:** Workflow resolution depends on `fulfillment_type` on the order. Wrong fulfillment type → wrong workflow → wrong status steps shown to buyer and seller. For home visit services, buyer address info and delivery flow logic break.

**Where:** `ServiceBookingFlow.tsx` line 223

**Impact:** Workflow engine, fulfillment card on `OrderDetailPage`, delivery/pickup labels all display incorrectly.

**Fix Risk:** Minimal — single line change from `locationType` to `resolvedLocationType` (already computed on line 244).

**Mitigation:** Replace `fulfillment_type: locationType || 'at_seller'` with `fulfillment_type: resolvedLocationType`.

---

## Bug 3: `orderFulfillmentType` Defaults to `'self_pickup'` Before Order Loads

**Description:** In `useOrderDetail.ts` line 58: `const orderFulfillmentType = (order as any)?.fulfillment_type || 'self_pickup'`. Before the order loads, this resolves to `'self_pickup'`, which causes `useCategoryStatusFlow` to resolve the wrong workflow on first render.

**Why Critical:** This violates the documented resolution-gating pattern. The workflow hook fires with `self_pickup` → fetches the wrong flow → UI briefly shows cart_purchase timeline steps instead of service_booking steps. Although it corrects on re-render, this causes a visible flash of wrong steps.

**Where:** `useOrderDetail.ts` line 58

**Impact:** Brief flash of incorrect workflow timeline for every service booking order detail load. Confuses buyers.

**Fix Risk:** Low. Change default to `null` and gate `useCategoryStatusFlow` on order being loaded.

**Mitigation:** Default to `null` instead of `'self_pickup'`. The memory doc `workflow-resolution-gating` explicitly states this pattern.

---

## Bug 4: `nextBooking` Filter Uses Deprecated Statuses

**Description:** In `BuyerBookingsCalendar.tsx` line 60, the "Next Appointment" highlight filters by `['requested', 'confirmed', 'scheduled', 'rescheduled'].includes(b.status)`. But `requested`, `scheduled`, and `rescheduled` are deprecated in the workflow — bookings now start at `confirmed`. This filter is partially dead code, but more critically, it won't match `in_progress` bookings that are still active.

**Why Critical:** An `in_progress` appointment (e.g., buyer is currently at the doctor) won't show as "Next Appointment". The buyer loses visibility of their active booking.

**Where:** `BuyerBookingsCalendar.tsx` line 60

**Impact:** "Next Appointment" card goes blank during active appointments.

**Fix Risk:** Low. Should filter by non-terminal statuses dynamically instead of a hardcoded list.

**Mitigation:** Use workflow-driven terminal status check: `if (isTerminalStatus(flow, b.status)) return false;` or simply check `!['completed', 'cancelled', 'no_show'].includes(b.status)` as a minimal fix.

---

## Bug 5: Notification Payload Says `'requested'` But Booking Is `'confirmed'`

**Description:** In `ServiceBookingFlow.tsx` line 315, the notification sent to the seller says `payload: { orderId: order.id, status: 'requested', type: 'order' }`. But the booking is auto-confirmed (status = `'confirmed'`). The notification title also says "New Booking Request" implying it needs acceptance.

**Why Critical:** Seller receives misleading notification suggesting action is needed to "accept" the booking. In reality the booking is already confirmed. This creates confusion and unnecessary seller anxiety.

**Where:** `ServiceBookingFlow.tsx` lines 312-316

**Impact:** Seller trust. Every booking notification is misleading.

**Fix Risk:** Minimal — change `status: 'requested'` to `status: 'confirmed'` and update title from "Request" to "Booking Confirmed".

**Mitigation:** Update notification text and payload to reflect auto-confirmed status.

---

## Bug 6: Buyer Can Book Their Own Service (Race Condition)

**Description:** In `ServiceBookingFlow.tsx` lines 191-202, the self-booking check fetches `seller_profiles.user_id` and compares to `user.id`. But this check happens AFTER the order is already created (line 211-226). If the check fails, the order exists as an orphan with no booking.

**Why Critical:** The order is created before validation. Even though self-booking is caught, the cleanup uses `buyer_cancel_order` RPC — but only if `itemErr` triggers it. The self-booking path returns early WITHOUT cleaning up the order.

**Where:** `ServiceBookingFlow.tsx` lines 197-202

**Impact:** Orphan orders in database from self-booking attempts.

**Fix Risk:** Low. Move the self-booking check BEFORE order creation.

**Mitigation:** Relocate the seller profile fetch and self-check to before the order insert statement.

---

## Bug 7: Price ≤ 0 Check Creates Orphan Order

**Description:** Same pattern as Bug 6. The `price <= 0` check at line 204 happens AFTER the order is already inserted. If price is invalid, the function returns early without cleaning up the order.

**Where:** `ServiceBookingFlow.tsx` lines 204-208

**Impact:** Orphan order records in the database.

**Fix Risk:** Minimal — move the check before order creation or add cleanup on early return.

**Mitigation:** Move price validation before the order insert, or add `buyer_cancel_order` cleanup on the return path.

---

## Bug 8: `addToCalendar` Uses Local Timezone But Bookings Are IST

**Description:** `AppointmentDetailsCard.tsx` line 31-32 creates calendar dates as `new Date('2026-03-25T09:00')` without timezone offset. But `BuyerBookingsCalendar.tsx` explicitly parses booking times as IST (`+05:30`). This inconsistency means the calendar export creates events at the wrong time for users outside IST.

**Why Critical:** Buyer adds appointment to their phone calendar → event shows at wrong time → buyer misses appointment.

**Where:** `AppointmentDetailsCard.tsx` lines 31-32

**Impact:** Missed appointments for any user not in IST timezone.

**Fix Risk:** Low. Append `+05:30` to the date string construction to match `BuyerBookingsCalendar`.

**Mitigation:** Change to `new Date(\`${booking.booking_date}T${booking.start_time}+05:30\`)`.

---

## Bug 9: Booking Notes Not Passed to `book_service_slot` RPC

**Description:** `ServiceBookingFlow.tsx` line 246-257 calls `book_service_slot` RPC but does NOT pass `_notes`. The notes are saved on the `orders` table (line 221), but the `service_bookings` table has a `notes` column that stays `null`. The RPC accepts `_notes` as a parameter (see migration line 17).

**Why Critical:** Seller sees the appointment in `SellerDayAgenda` which queries `service_bookings` — buyer's special requests are invisible. Seller must navigate to the order detail to see notes.

**Where:** `ServiceBookingFlow.tsx` lines 246-257

**Impact:** Seller misses critical buyer instructions (allergies, preferences, access codes for home visits).

**Fix Risk:** Minimal — add `_notes: notes.trim() || null` to the RPC call.

**Mitigation:** Add the missing `_notes` parameter to the `book_service_slot` RPC call.

---

## Bug 10: Slot Freshness Check Uses `start_time` String Match — Timezone Mismatch Risk

**Description:** `ServiceBookingFlow.tsx` line 177 queries `service_slots` with `.eq('start_time', selectedTime)`. The `selectedTime` is a string like `"09:00"` from the picker, but DB `start_time` is a `time` type which may store as `"09:00:00"`. The PostgREST equality check works because Supabase casts, BUT if `selectedTime` comes with seconds (e.g., from a different flow), the match silently fails → `freshSlots` is null → booking shows "slot no longer available" error.

**Why Critical:** Silent booking failure. Buyer sees "slot no longer available" when the slot IS available. No error logged server-side.

**Where:** `ServiceBookingFlow.tsx` line 177

**Impact:** Intermittent booking failures that are very hard to debug.

**Fix Risk:** Low. Normalize `selectedTime` to HH:MM:SS format before the query.

**Mitigation:** Append `:00` if selectedTime is in `HH:MM` format: `.eq('start_time', selectedTime.length === 5 ? selectedTime + ':00' : selectedTime)`.

---

## Priority Order

| # | Bug | Severity | Effort |
|---|-----|----------|--------|
| 1 | Slot not released on cancel | **P0** | Medium |
| 2 | Wrong fulfillment_type on order | **P0** | Trivial |
| 5 | Misleading notification | **P1** | Trivial |
| 6 | Self-booking orphan order | **P1** | Low |
| 7 | Price check orphan order | **P1** | Low |
| 9 | Notes not passed to RPC | **P1** | Trivial |
| 4 | Next Appointment misses in_progress | **P1** | Low |
| 8 | Calendar timezone mismatch | **P2** | Low |
| 3 | Flash of wrong workflow | **P2** | Low |
| 10 | Slot time format mismatch | **P3** | Trivial |

