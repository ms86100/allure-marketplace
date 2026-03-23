

## Plan: Multi-Select "Waiting On" Actor Field

### Problem
The "Waiting On" dropdown is a single-select, but some steps need multiple actors displayed (e.g., `picked_up` is waiting on both seller and delivery). The DB `actor` column stores a single value.

### Approach
Keep the DB `actor` column as-is (store the primary/first actor), but change the UI to use **toggle buttons** (like the transition actor toggles) instead of a single-select dropdown. Store the selected actors as a comma-separated string in the `actor` field (e.g., `"seller,delivery"`).

### Changes

**1. `src/components/admin/AdminWorkflowManager.tsx`**
- Replace the single `<Select>` for "Waiting On" (lines 492-512) with clickable toggle buttons for each actor (same style as transition actor badges)
- Each actor button toggles on/off; at least one must remain selected
- On save, join selected actors with comma → store in `actor` column (line 197)
- On load, split `actor` string by comma to populate toggle state

**2. `src/hooks/useCategoryStatusFlow.ts`** (read-only awareness)
- The `actor` field is currently used for display hints ("Waiting for X"). Code that reads it will need to handle comma-separated values. We'll check and update any consumer that reads `step.actor`.

**3. No DB migration needed** — the `actor` column is already `text`, so comma-separated values work without schema changes.

### Technical Details
- Toggle UI: reuse the same `cn()` pattern with `bg-primary text-primary-foreground` for active actors
- Parse on load: `step.actor.split(',')` → array of active actors
- Serialize on save: `selectedActors.join(',')` → single string
- Validation: prevent deselecting the last actor (toast warning)

