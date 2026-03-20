

## Plan: Unified Category ↔ Workflow Confidence Layer

### Problem Diagnosis

The root issue is a **vocabulary mismatch** between two admin surfaces:

```text
Category Config uses:        Workflow Engine uses:
─────────────────────        ────────────────────
cart_purchase                 cart_purchase        ✅ match
buy_now                       (no workflow)        ❌ gap
book_slot                     service_booking      ❌ mismatch
request_service               request_service      ✅ match
request_quote                 (no workflow)        ❌ gap
contact_only                  (no workflow)        ❌ gap
schedule_visit                (no workflow)        ❌ gap
```

A hidden runtime function (`resolveTransactionType`) maps category listing types to workflow keys at order time, but admins never see this mapping. The existing `WorkflowLinkage` component queries `category_config.transaction_type = workflow.transaction_type` directly — which only works for `cart_purchase` and `request_service`, missing everything else.

**Result:** Admins configure categories in one tab and workflows in another, with no visible connection between them and no confidence that the right workflow will fire.

### Solution: Three Changes

#### 1. Add a Listing Type → Workflow Key mapping table (visible to admin)

Create a static mapping that mirrors `resolveTransactionType` logic, making it visible in the admin UI:

```typescript
// src/lib/listingTypeWorkflowMap.ts
export const LISTING_TYPE_TO_WORKFLOW: Record<string, string> = {
  cart_purchase: 'cart_purchase',     // resolves further by fulfillment type
  buy_now: 'cart_purchase',
  book_slot: 'service_booking',
  request_service: 'request_service',
  request_quote: 'request_service',
  contact_only: 'request_service',
  schedule_visit: 'service_booking',
};
```

This is the single source of truth for the admin-facing mapping. No DB change needed — it codifies the existing `resolveTransactionType` logic.

#### 2. Fix `WorkflowLinkage` to use the mapping

Currently it does `category_config.transaction_type = workflow.transaction_type` which misses `book_slot` → `service_booking`, etc.

**Fix:** Load category configs for the parent group, then filter client-side using the mapping:

```typescript
// Show categories whose RESOLVED workflow key matches this workflow's transaction_type
const linked = allGroupCategories.filter(c => 
  LISTING_TYPE_TO_WORKFLOW[c.transaction_type] === workflowTransactionType
);
```

#### 3. Add Workflow Preview Panel inside Category Edit Dialog

This is the key UX fix. When an admin edits a category and selects a listing type (e.g., "Bookable Service"), show an inline read-only panel:

```text
┌─────────────────────────────────────────────┐
│  Listing Type: [Bookable Service ▾]         │
│                                             │
│  🔗 Workflow: service_booking               │
│  ┌─────────────────────────────────────┐    │
│  │ requested → confirmed → completed   │    │
│  │ 6 steps · home_services pipeline    │    │
│  │ [Open Workflow Editor →]            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ⚠️ No workflow found for "events /         │
│     service_booking" — will use default     │
└─────────────────────────────────────────────┘
```

This gives admins instant confidence: "When I set this category to Bookable Service, HERE is the exact workflow that will run."

### Files Changed

| File | Change |
|------|--------|
| `src/lib/listingTypeWorkflowMap.ts` | **New.** Static mapping from listing types to workflow keys |
| `src/components/admin/workflow/WorkflowLinkage.tsx` | Use mapping instead of direct equality |
| `src/components/admin/CategoryWorkflowPreview.tsx` | **New.** Inline preview showing resolved workflow for a category's listing type |
| `src/components/admin/CategoryManager.tsx` | Add `CategoryWorkflowPreview` inside edit and add dialogs below the listing type selector |
| `src/hooks/useCategoryManagerData.ts` | No change (listing type presets already defined) |

### What This Does NOT Change

- No DB schema changes. The workflow engine, `resolveTransactionType`, and `category_status_flows` tables remain untouched.
- No runtime behavior changes. Order routing logic stays identical.
- This is purely an **admin visibility improvement** — making the existing hidden mapping explicit and inspectable.

### Edge Cases Handled

- **Missing workflow:** If no workflow exists for the resolved key + parent group, the preview shows a warning: "Will fall back to `default` pipeline" (matching the existing runtime fallback in `useCategoryStatusFlow`).
- **Fulfillment variants:** For `cart_purchase`, the preview notes: "Final workflow depends on fulfillment type (seller delivery vs platform delivery vs self-pickup)" since that's resolved at order time, not category time.

