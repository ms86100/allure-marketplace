

# Add "Create New Workflow" to Admin Workflow Manager

## Current State

The admin **can edit** existing workflows but **cannot create new ones**. The `AdminWorkflowManager` only lists workflows already seeded in `category_status_flows`. There is no "Create Workflow" button.

**How workflows link to categories today:**
The DB trigger `validate_order_status_transition` resolves workflow by joining `orders → products → category_config` to get `(parent_group, transaction_type)`, then looks up `category_status_flows` with that key. If no match, it falls back to `parent_group = 'default'`.

So when an admin adds a new category (e.g., `pet_care` under a new parent group `pets`), they currently have no way to create a matching workflow — it silently falls back to the `default` workflow.

## Plan

### 1. Add "Create Workflow" dialog to `AdminWorkflowManager.tsx`
- Add a `+ New Workflow` button in the header
- Dialog with two fields:
  - **Parent Group**: dropdown populated from `parent_groups` table (existing groups) + free-text option for new slugs
  - **Transaction Type**: dropdown from the existing `TRANSACTION_TYPES` constant
- On create: insert a minimal starter workflow (e.g., single `placed` step marked non-terminal) and open the editor immediately
- Validate: prevent duplicates (check if `parent_group + transaction_type` combo already exists)

### 2. Add "Clone Workflow" action on each workflow card
- Small copy icon button on each workflow card
- Opens a dialog asking for the target `parent_group` + `transaction_type`
- Copies all steps and transitions from the source workflow into the new combo
- This is the fastest way to set up a new category's workflow — clone from `default` and tweak

### 3. Add "Delete Workflow" option in the editor
- Button in the editor sheet (with confirmation dialog)
- Deletes all `category_status_flows` and `category_status_transitions` rows for that combo
- Warn if any `category_config` rows reference this `parent_group + transaction_type`

### 4. Show workflow linkage info
- In the editor header, show which categories currently use this workflow
- Query: `SELECT category, display_name FROM category_config WHERE parent_group = X AND transaction_type = Y`
- Helps admin understand the blast radius of changes

## Files to Modify

| File | Change |
|---|---|
| `src/components/admin/AdminWorkflowManager.tsx` | Add create dialog, clone action, delete action, category linkage display |

No database changes needed — the tables already support arbitrary `parent_group` + `transaction_type` values.

