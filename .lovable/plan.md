

# Make Service Booking Fully Workflow-Driven

## Problem
Four components have hardcoded status labels/colors instead of reading from the workflow database (`category_status_flows`). This means DB changes to deprecate or rename statuses won't reflect in the UI automatically.

## Hardcoded Locations Found

| File | What's hardcoded |
|---|---|
| `src/types/service.ts` | `SERVICE_STATUS_LABELS` and `SERVICE_BOOKING_STATUSES` constants |
| `src/components/order/AppointmentDetailsCard.tsx` | Uses `SERVICE_STATUS_LABELS` for badge |
| `src/components/seller/SellerDayAgenda.tsx` | Own `STATUS_COLORS` map |
| `src/components/booking/BuyerBookingsCalendar.tsx` | Own `STATUS_COLORS` map |
| `src/components/seller/ServiceBookingStats.tsx` | Hardcodes `'requested'`, `'scheduled'` etc. in filters |

## Solution

### 1. `AppointmentDetailsCard.tsx`
Replace `SERVICE_STATUS_LABELS` import with `useFlowStepLabels` hook. The badge label and color will come from the workflow DB, with automatic fallback to `useStatusLabels`.

### 2. `SellerDayAgenda.tsx`
Remove hardcoded `STATUS_COLORS` map. Use `useFlowStepLabels` for badge colors. Keep the `cancelled`/`no_show` filter as-is (those are terminal states that will always exist).

### 3. `BuyerBookingsCalendar.tsx`
Same treatment — remove hardcoded `STATUS_COLORS`, use `useFlowStepLabels` for dynamic colors.

### 4. `ServiceBookingStats.tsx`
The status filters (`'requested'`, `'confirmed'`, `'scheduled'`, `'completed'`) are **semantic queries** — they filter data, not display it. These are acceptable to keep as strings since they represent business logic. No change needed here.

### 5. `src/types/service.ts`
Remove `SERVICE_STATUS_LABELS` (no longer used after the above changes). Keep `SERVICE_BOOKING_STATUSES` only if referenced elsewhere; otherwise remove it too.

### No database changes needed
The workflow data is already correct. This is purely a frontend wiring change.

