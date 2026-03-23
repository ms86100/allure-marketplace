

## Plan: DB-Driven Workflow Selector for Category Management

### Problem
The Category Manager uses a **hardcoded** `LISTING_TYPE_PRESETS` array as a dropdown, then indirectly resolves the workflow through `listing_type_workflow_map` + `resolveTransactionType`. This means:
- The "Linked Workflow" preview can show a different workflow than what actually executes
- Admins can't directly select the actual workflow
- `deriveBehaviorFlags()` is hardcoded static logic

### Solution
Replace the indirect listing-type dropdown with a **direct workflow selector** that pulls available workflows from the database. The selected workflow key is stored as `transaction_type` on `category_config` and drives all downstream behavior.

### Changes

**1. New hook: `useAvailableWorkflows`**
- Query `category_status_flows` for distinct `transaction_type` values (grouped, with step counts)
- Returns a list like `[{ key: 'cart_purchase', label: 'Cart Purchase', stepCount: 8 }, ...]`
- Used by the Category Manager dropdown

**2. Update `CategoryManager.tsx` — Edit & Add dialogs**
- Replace the `LISTING_TYPE_PRESETS` static dropdown with a dynamic `<Select>` that uses `useAvailableWorkflows()`
- Each option shows: workflow label + step count badge
- The selected value is stored directly as `transaction_type` (which is already the column name in `category_config`)

**3. Update `CategoryWorkflowPreview.tsx`**
- Simplify: instead of resolving `listingType → workflowKey` via `listing_type_workflow_map`, just use the `transaction_type` directly from the category config
- The preview becomes a straight lookup: `category_status_flows WHERE transaction_type = selectedWorkflow`

**4. Update `useCategoryManagerData.ts`**
- Remove `LISTING_TYPE_PRESETS` constant
- Remove `deriveBehaviorFlags()` — behavior flags should come from the DB (they're already stored on `category_config`)
- In `saveEditedCategory` and `saveNewCategory`, stop calling `deriveBehaviorFlags()` and just save the `transaction_type` directly. Behavior flags are already independently configurable in the category config

**5. Update `resolveTransactionType.ts`**
- Simplify: when `listingType` (now actually the workflow key) is provided, use it directly instead of the hardcoded mapping chain
- Keep fulfillment-variant resolution (`seller_delivery`, `self_fulfillment`) as these are runtime sub-variants

**6. Update `listing_type_workflow_map` usage**
- `CategoryWorkflowPreview` no longer needs to go through the map — it reads `transaction_type` directly
- The map table remains useful for edge cases but is no longer the primary resolution path in admin UI

### What stays the same
- `category_status_flows` and `category_status_transitions` tables — untouched
- Order execution logic — still uses `resolveTransactionType` at runtime
- Fulfillment variants (`seller_delivery`, `self_fulfillment`) — still derived at runtime

### Files Modified
| File | Change |
|---|---|
| `src/hooks/useAvailableWorkflows.ts` | **New** — fetch distinct workflows from DB |
| `src/hooks/useCategoryManagerData.ts` | Remove `LISTING_TYPE_PRESETS`, `deriveBehaviorFlags`; use workflow key directly |
| `src/components/admin/CategoryManager.tsx` | Replace static dropdown with DB-driven workflow selector |
| `src/components/admin/CategoryWorkflowPreview.tsx` | Accept `workflowKey` directly instead of resolving from `listingType` |
| `src/components/admin/TransactionTypeConfirmSave.tsx` | Use dynamic workflow labels instead of `LISTING_TYPE_PRESETS` |
| `src/lib/resolveTransactionType.ts` | Simplify to prefer direct `transaction_type` when available |

