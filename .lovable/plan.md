

# Fix Service Booking Workflow — With Architectural Guardrails

## Problem Summary
From `confirmed` (sort=20), seller has transitions to `rescheduled` (sort=15) and `scheduled` (sort=30). `getNextStatusForActor()` picks lowest sort_order → `rescheduled` → which loops back to `confirmed`. Meanwhile, bookings start as `requested` despite slot already being atomically locked.

## DB State (All 7 non-default parent_groups + default)
- All 8 parent_groups have `seller → rescheduled` transitions from `confirmed`, `requested`, and `scheduled`
- `rescheduled` (sort=15) sits between `requested` (10) and `confirmed` (20)

---

## Fix: 4 Changes

### 1. Add `is_side_action` column to `category_status_transitions`
**Schema migration** — new boolean column, default `false`.

This is the architectural guardrail: instead of hard-coding forward-only logic in the frontend, we mark certain transitions as side-actions in the DB. The `getNextStatusForActor()` function only considers transitions where `is_side_action = false` for the primary CTA. Side-actions (reschedule, no_show) are surfaced via separate UI buttons.

This keeps the system admin-driven: admins can still configure backward transitions — they just mark them as side-actions so the main action bar ignores them.

### 2. Update `getNextStatusForActor()` to exclude side-actions
**File:** `src/hooks/useCategoryStatusFlow.ts`

- Add `is_side_action` to `StatusTransition` interface
- Fetch `is_side_action` in `useStatusTransitions()`
- In `getNextStatusForActor()`: filter out transitions where `is_side_action = true` before picking the primary CTA
- Add a new exported function `getSideActionsForActor()` that returns only side-action transitions (for future reschedule button)

This replaces the naive "forward-only by sort_order" approach — the DB controls what's a side-action, not frontend heuristics.

### 3. Auto-confirm bookings
**DB migration:** Update `book_service_slot` RPC — change INSERT status from `'requested'` to `'confirmed'`

**Frontend:** `src/components/booking/ServiceBookingFlow.tsx` line 218 — change order status from `'requested'` to `'confirmed'`

Safe because: the RPC already validates slot availability, prevents duplicates, prevents overlaps, and atomically locks the slot with a row-level `FOR UPDATE` pattern. Auto-confirm only happens through this validated path.

### 4. Mark reschedule transitions as side-actions + remove seller→rescheduled from default
**Data updates** (all 8 parent_groups for `service_booking`):
- Set `is_side_action = true` on all transitions where `to_status = 'rescheduled'`
- Delete `seller → rescheduled` transitions from `requested` state (no longer reachable since bookings auto-confirm)
- Keep `buyer → rescheduled` transitions (buyer can still reschedule via dedicated UI)
- Keep `seller → rescheduled` from `confirmed`/`scheduled` but marked as side-action (seller can reschedule via explicit button, not main CTA)

---

## Resulting Behavior

**Primary CTA flow (seller):**
```
confirmed → scheduled → in_progress → completed
```

**Side actions (separate buttons):**
- Cancel: buyer/seller/admin from confirmed/scheduled
- Reschedule: buyer from confirmed/scheduled (dedicated button)
- No-show: seller from scheduled/in_progress

**No loops possible** — `rescheduled` is never offered as primary CTA regardless of sort_order.

**Admin-safe** — admins can still configure any transition; marking `is_side_action` controls UI behavior without removing workflow capability.

---

## Files Impacted
| Change | Type |
|--------|------|
| Add `is_side_action` column to `category_status_transitions` | Schema migration |
| Update `book_service_slot` RPC → status `confirmed` | Schema migration |
| Mark reschedule transitions as side-actions | Data update |
| `src/hooks/useCategoryStatusFlow.ts` — filter side-actions in CTA, add `getSideActionsForActor()` | Code |
| `src/components/booking/ServiceBookingFlow.tsx` — order status `confirmed` | Code |

