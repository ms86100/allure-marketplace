

# Workflow Engine — Final Hardening

## Already Implemented (Confirmed)
- Transition table with actor-based rules
- DB trigger using transition table with fallback to `default` parent_group
- Delivery/system actor enforcement in trigger
- Admin workflow editor with validation (terminal, duplicates, orphan warnings)
- Booking review step
- Calendar ICS fallback
- Performance index

## What the Architect Flagged (Still Actionable)

### 1. Add `seller_hint` column to `category_status_flows`
Mirrors `buyer_hint` but for seller-facing guidance (e.g., "Prepare the order", "Hand over to delivery"). Simple schema addition — no code changes required now, just schema readiness.

**Migration:**
```sql
ALTER TABLE public.category_status_flows
  ADD COLUMN IF NOT EXISTS seller_hint text;
```

### 2. Cycle detection warning in Admin Workflow Editor
Currently an admin could create backward transitions like `accepted → placed`. Add a warning (not a block, since rescheduling is a valid backward flow) when a transition goes to a lower `sort_order` step.

**Change in `AdminWorkflowManager.tsx`:**
- In `saveWorkflow()`, after the orphan check, add a warning if any transition goes from a higher `sort_order` step to a lower one
- Simple check: for each transition, compare `fromStep.sort_order` vs `toStep.sort_order`
- Show `toast.warning("Backward transition detected: X → Y. Ensure this is intentional.")`

### 3. Extend Admin editor to show `seller_hint` field
Add a `seller_hint` input field next to `buyer_hint` in the step editor card.

## Files

| File | Change |
|---|---|
| DB migration | Add `seller_hint` column |
| `src/components/admin/AdminWorkflowManager.tsx` | Add cycle warning + seller_hint input |

## What We're NOT Doing (Future)
- Full actor identity validation in trigger (would require passing caller identity via `app.actor` setting — significant refactor of all status-update callsites)
- Event-driven workflow automation (`trigger_event` column) — excellent idea for v2
- `workflow_id` abstraction — current `(parent_group, transaction_type)` key works for now

