

# Fix: Replace `actor LIKE '%seller%'` with Dedicated Workflow Flag

## Problem

The trigger uses `actor LIKE '%seller%'` to decide whether to create a delivery assignment. This embeds business logic (actor = seller → create assignment) in code instead of deriving it purely from configuration. Actor means "who can act on this step" — it should not be overloaded to mean "who gets tracked."

## Solution

Add a new boolean column `creates_tracking_assignment` to `category_status_flows`. This is a pure workflow configuration flag that the admin toggles — the trigger reads it without interpreting actor semantics.

### 1. Database Migration — Add Column + Backfill

```sql
ALTER TABLE category_status_flows
  ADD COLUMN IF NOT EXISTS creates_tracking_assignment boolean DEFAULT false;

-- Backfill: existing steps where is_transit=true and actor includes seller
UPDATE category_status_flows
  SET creates_tracking_assignment = true
  WHERE is_transit = true AND actor LIKE '%seller%';
```

### 2. Database Migration — Update Trigger

Replace:
```sql
AND is_transit = true
AND actor LIKE '%seller%'
```
With:
```sql
AND is_transit = true
AND creates_tracking_assignment = true
```

Now the trigger has zero actor interpretation. It reads two boolean flags, both set by admin in workflow config.

### 3. Frontend — Workflow Editor Support

**File: Workflow step editor (admin)**
- Add a toggle for `creates_tracking_assignment` alongside the existing `is_transit` / `requires_otp` / `is_success` toggles
- Only show it when `is_transit = true` (it's meaningless otherwise)
- Label: "Auto-create tracking assignment"

### 4. Workflow Preview

**File: `CategoryWorkflowPreview.tsx`**
- Show an icon indicator when `creates_tracking_assignment = true` (e.g., a MapPin icon alongside the existing Truck/KeyRound icons)

## Files to Modify

| File | Change |
|------|--------|
| New migration SQL | Add `creates_tracking_assignment` column, backfill, update trigger |
| Workflow step editor component | Add toggle for the new flag |
| `CategoryWorkflowPreview.tsx` | Show indicator icon |
| `src/components/admin/workflow/types.ts` | Add `creates_tracking_assignment` to `FlowStep` interface |

## Why This Is Correct

| Before | After |
|--------|-------|
| `actor LIKE '%seller%'` — code interprets actor | `creates_tracking_assignment = true` — config flag |
| Actor overloaded for two meanings | Actor = who acts, flag = system behavior |
| New actors require code changes | New actors just need admin to toggle the flag |

## Risk

- **Zero regression**: Backfill sets the flag to `true` exactly where `actor LIKE '%seller%'` would have matched
- **Forward-compatible**: Any future actor/role works without trigger changes

