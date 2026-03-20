

## Lean Category-Specific Workflows — IMPLEMENTED ✅

### What Changed

1. **New `contact_enquiry` workflow** (4 steps): enquired→confirmed→completed/cancelled
   - For `contact_only` listing types (maid, cook, driver, rentals, etc.)
   - Uses existing `order_status` enum values with custom display labels ("Contacted", "Responded")

2. **Trimmed `service_booking` (default)**: 5 active + 3 deprecated
   - Active: requested → confirmed → completed / no_show / cancelled
   - Deprecated (with escape transitions): rescheduled, scheduled, in_progress

3. **Trimmed `request_service` (default)**: 6 active + 2 deprecated
   - Active: enquired → quoted → accepted → completed / cancelled / no_show
   - Deprecated (with escape transitions): preparing, ready

4. **Cart/delivery workflows unchanged** — cart_purchase, seller_delivery, self_fulfillment untouched

5. **Parent group overrides unchanged** — domestic_help, home_services, personal_care, etc. keep their extended flows

### Safety Guardrails

- **Soft deprecation**: `is_deprecated` column added — old steps kept but hidden from new order timelines
- **Escape transitions**: Every deprecated step has a path to a valid active state
- **No enum changes**: contact_enquiry reuses existing enum values (enquired, confirmed, completed, cancelled)
- **Backward compatible**: `resolveTransactionType` accepts optional `listingType` param — existing callers unaffected

### System Coverage for `contact_enquiry`

| System | Status |
|--------|--------|
| `resolveTransactionType.ts` | ✅ listingType=contact_only → contact_enquiry |
| `listing_type_workflow_map` (DB) | ✅ contact_only → contact_enquiry |
| `fn_enqueue_order_status_notification` | ✅ Detects contact_only via category_config |
| `buyer_advance_order` RPC | ✅ Detects contact_only via category_config |
| `statusFlowCache.ts` | ✅ Added to .in() filter |
| `workflow/types.ts` | ✅ Added to TRANSACTION_TYPES |
| `listingTypeWorkflowMap.ts` | ✅ Fallback updated |
| Admin WorkflowManager | ✅ Shows deprecated badges |

### Files Changed

- `src/lib/resolveTransactionType.ts` — Added optional `listingType` param, contact_enquiry resolution
- `src/lib/listingTypeWorkflowMap.ts` — contact_only → contact_enquiry fallback
- `src/components/admin/workflow/types.ts` — Added contact_enquiry to TRANSACTION_TYPES
- `src/services/statusFlowCache.ts` — Added all transaction types to filter
- `src/hooks/useCategoryStatusFlow.ts` — Added is_deprecated to interface + select; getTimelineSteps filters deprecated
- `src/hooks/useOrderDetail.ts` — Passes currentStatus to getTimelineSteps
- `src/components/admin/AdminWorkflowManager.tsx` — Deprecated badge, active step count display
- DB migration: is_deprecated column, updated notification trigger + buyer_advance_order RPC
- DB data: contact_enquiry flows + transitions, deprecated steps, escape transitions, lean transitions
