

## Plan: Lean Category-Specific Workflows (with Guardrails)

### Live Order Safety Assessment

Current non-terminal orders in service/request flows:
- 1 booking order in `confirmed` state — **SAFE** (kept in all new flows)
- 1 enquiry order in `quoted` state — **SAFE** (kept in trimmed request_service)

No orders exist in `preparing`, `ready`, `scheduled`, or `in_progress` for these flows, so trimming is safe today. But we still add a compatibility layer.

### Strategy: Soft Deprecation, Not Hard Deletion

Old steps (`preparing`, `ready`, `scheduled`, `in_progress`, `rescheduled`) will NOT be deleted from default flows. Instead:
1. Mark them `is_terminal = false` with a new `is_deprecated` flag (add column)
2. Remove their outgoing transitions (so no NEW orders enter them)
3. Add escape transitions FROM deprecated states → nearest valid state (so stuck orders can exit)
4. New orders follow the lean path; old orders gracefully drain

### Changes

**1. DB Schema: Add `is_deprecated` column**

```sql
ALTER TABLE category_status_flows ADD COLUMN is_deprecated BOOLEAN DEFAULT false;
```

This lets the UI hide deprecated steps from new order timelines while keeping them valid for existing orders.

**2. New `contact_enquiry` workflow (4 steps)**

| Step | Actor | Terminal | Label |
|------|-------|----------|-------|
| contacted | buyer | no | Contacted |
| responded | seller | no | Responded |
| completed | system | yes | Completed |
| cancelled | buyer | yes | Cancelled |

Transitions: contacted→responded (seller), contacted→cancelled (buyer/seller), responded→completed (seller/buyer), responded→cancelled (buyer/seller).

**3. Trim default `service_booking` (keep 5 active, deprecate 3)**

Active path: requested → confirmed → completed / no_show / cancelled

Deprecated (kept but no inbound transitions for new orders):
- `rescheduled` — escape: rescheduled→confirmed (seller)
- `scheduled` — escape: scheduled→confirmed (seller)  
- `in_progress` — escape: in_progress→completed (seller)

New transitions: requested→confirmed (seller), confirmed→completed (seller/buyer), confirmed→no_show (seller), confirmed→cancelled (buyer/seller/admin), requested→cancelled (buyer/seller/admin).

**4. Trim default `request_service` (keep 6 active, deprecate 2)**

Active path: enquired → quoted → accepted → completed / cancelled / no_show

Deprecated (kept but no inbound transitions):
- `preparing` — escape: preparing→completed (seller)
- `ready` — escape: ready→completed (seller)

New transitions: accepted→completed (seller), accepted→cancelled (buyer/admin).

**5. Frontend: Hide deprecated steps from new order UI**

Update `useCategoryStatusFlow` to filter `is_deprecated = true` steps from timeline display for NEW orders, but show them for orders currently IN those states.

**6. Full `contact_enquiry` system propagation**

| System | Change |
|--------|--------|
| `resolveTransactionType.ts` | Add contact_only → `contact_enquiry` resolution |
| `listing_type_workflow_map` (DB) | Update `contact_only` row: workflow_key = `contact_enquiry` |
| `validate_transaction_type` trigger | Add `contact_enquiry` to allowed values |
| `fn_enqueue_order_status_notification` | Add CASE for `contact_enquiry` |
| `buyer_advance_order` RPC | Add `contact_enquiry` to allowed transaction types |
| `statusFlowCache.ts` | Add `contact_enquiry` to `.in()` filter |
| `src/components/admin/workflow/types.ts` | Add to TRANSACTION_TYPES |
| `listingTypeWorkflowMap.ts` fallback | Update `contact_only` → `contact_enquiry` |

**7. Parent group override consistency**

Parent group overrides (domestic_help, home_services, personal_care, etc.) remain UNTOUCHED — they have their own extended flows with on_the_way/arrived/in_progress which are genuinely needed.

The `CategoryWorkflowPreview` already shows override vs default via the determinism badge system from Phase 1.5, so admins have full visibility.

### Files Changed

| File | Change |
|------|--------|
| DB migration | Add `is_deprecated` column; insert `contact_enquiry` flow + transitions; mark deprecated steps; update escape transitions |
| DB data (insert tool) | Update default service_booking + request_service transitions; update listing_type_workflow_map |
| `src/lib/resolveTransactionType.ts` | Add contact_only → contact_enquiry |
| `src/lib/listingTypeWorkflowMap.ts` | Update fallback map |
| `src/components/admin/workflow/types.ts` | Add contact_enquiry |
| `src/services/statusFlowCache.ts` | Add contact_enquiry to filter |
| `src/hooks/useCategoryStatusFlow.ts` | Filter deprecated steps from timeline for new orders |
| `src/components/admin/AdminWorkflowManager.tsx` | Show deprecated badge on deprecated steps |

### Validation Checklist

- No steps are deleted — only deprecated
- Every deprecated step has an escape transition to a valid state
- Every active step has entry and exit paths
- No dead ends or orphan states
- contact_enquiry covered in all 8 system touchpoints
- Existing 2 live orders unaffected (both in active states)
- Parent group overrides unchanged

