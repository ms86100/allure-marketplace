

## Plan: Harden Category ↔ Workflow Confidence Layer (Phase 1.5)

The current implementation uses a hardcoded frontend mapping (`listingTypeWorkflowMap.ts`) that duplicates `resolveTransactionType`. This plan moves the mapping to a DB table, eliminates duplication, and adds determinism indicators — while keeping the existing preview UI.

### 1. Create `listing_type_workflow_map` DB table

New table to store the mapping as admin-visible, DB-driven configuration:

```sql
CREATE TABLE public.listing_type_workflow_map (
  listing_type TEXT PRIMARY KEY,
  workflow_key TEXT NOT NULL,
  is_conditional BOOLEAN DEFAULT false,
  condition_note TEXT
);

INSERT INTO listing_type_workflow_map VALUES
  ('cart_purchase', 'cart_purchase', true, 'Final workflow varies by fulfillment type'),
  ('buy_now', 'cart_purchase', true, 'Final workflow varies by fulfillment type'),
  ('book_slot', 'service_booking', false, NULL),
  ('request_service', 'request_service', false, NULL),
  ('request_quote', 'request_service', false, NULL),
  ('contact_only', 'request_service', false, NULL),
  ('schedule_visit', 'service_booking', false, NULL);
```

This becomes the **single source of truth** for the category → workflow mapping.

### 2. Rewrite `listingTypeWorkflowMap.ts` to fetch from DB

Replace the hardcoded `LISTING_TYPE_TO_WORKFLOW` object with a query-backed hook/utility:

- Create `useWorkflowMap()` hook that queries `listing_type_workflow_map` (cached via react-query, 10 min stale time)
- Export a `getWorkflowKeyFromMap(map, listingType)` pure function for consumers
- Keep the static map as a **fallback only** (for offline / loading states), clearly marked as such

### 3. Update `CategoryWorkflowPreview` with determinism indicators

Use the `is_conditional` and `condition_note` fields from the DB table to show:

- **Green badge**: "Deterministic" — when `is_conditional = false` AND a matching workflow exists in `category_status_flows`
- **Amber badge**: "Conditional" — when `is_conditional = true` (e.g., cart_purchase depends on fulfillment type at order time)
- **Red badge**: "Fallback" — when no matching workflow exists for the parent_group + workflow_key combo

### 4. Update consumers to use DB-driven map

Three consumers need updating:
- `CategoryWorkflowPreview.tsx` — use `useWorkflowMap()` instead of static import
- `WorkflowLinkage.tsx` — use `useWorkflowMap()` instead of static import
- Keep `resolveTransactionType.ts` unchanged (runtime order resolution still needs fulfillment context) — but add a comment linking it to the DB table as the config source

### 5. Add recent order workflow audit trail

Add a small section at the bottom of `CategoryWorkflowPreview` showing last 5 orders for the category + parent group and which `transaction_type` was actually used at runtime. Query:

```sql
SELECT o.id, o.transaction_type, o.created_at 
FROM orders o
JOIN seller_profiles sp ON o.seller_id = sp.id
WHERE sp.parent_group = :parentGroup
  AND o.category = :category
ORDER BY o.created_at DESC LIMIT 5
```

This closes the config → reality loop.

### Files Changed

| File | Change |
|------|--------|
| DB migration | Create `listing_type_workflow_map` table + seed data |
| `src/hooks/useWorkflowMap.ts` | **New.** React-query hook to fetch mapping from DB |
| `src/lib/listingTypeWorkflowMap.ts` | Downgrade to fallback-only, add DB-first `getWorkflowKeyFromMap` |
| `src/components/admin/CategoryWorkflowPreview.tsx` | Use DB map, add determinism badges, add recent orders audit |
| `src/components/admin/workflow/WorkflowLinkage.tsx` | Use `useWorkflowMap()` |

### What This Sets Up for Phase 2

The `listing_type_workflow_map` table is the stepping stone to explicit `category_config.workflow_id` binding. When Phase 2 arrives, the mapping table gets replaced by a direct FK on `category_config`, and the resolver becomes a simple lookup.

