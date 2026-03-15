

# Remaining Improvements from Architect Review

The core workflow engine (DB schema, transitions, admin UI, hardcoded removal) is already implemented. Three items from the architect's feedback remain unaddressed.

## What's Already Done
- `category_status_transitions` table with full seeded data including cancellation rules
- Actor-aware `validate_order_status_transition` trigger
- `AdminWorkflowManager` with transition editor
- `useCategoryStatusFlow` with `booking` → `service_booking` mapping
- `useOrderDetail` using DB-driven flow (no hardcoded fallbacks)
- Calendar try/catch fallback to ICS

## Remaining Tasks

### 1. Add Booking Review Step to `ServiceBookingFlow.tsx`
Currently the flow goes: select slot → confirm (immediately creates order). Need an intermediate review screen.

- Add `step` state: `'select' | 'review'`
- When user clicks "Continue" after slot selection, show review screen with:
  - Service name, image, seller name
  - Selected date and time slot
  - Location type (at seller / home visit with address)
  - Add-ons list with prices
  - Price breakdown (base + addons = total)
  - Notes preview
- "Back" returns to slot selection, "Confirm Booking" triggers `handleConfirm`
- Rename bottom button: "Continue" in select step, "Confirm Booking" in review step

### 2. Admin Workflow Validation on Save
Add validation in `AdminWorkflowManager.saveWorkflow()` before saving:

- **At least one terminal status** — error if no step has `is_terminal: true`
- **No duplicate status keys** — error if two steps share the same `status_key`
- **No orphaned statuses** — warn if a non-terminal status has no outgoing transitions defined

### 3. Database Index for Flow Lookups
Add performance index:
```sql
CREATE INDEX IF NOT EXISTS idx_flows_lookup
ON category_status_flows (parent_group, transaction_type, sort_order);
```

## Files to Modify
| File | Change |
|---|---|
| `src/components/booking/ServiceBookingFlow.tsx` | Add review step with back/confirm navigation |
| `src/components/admin/AdminWorkflowManager.tsx` | Add save-time validation (terminal, duplicates, orphans) |
| DB migration | Add `idx_flows_lookup` index |

