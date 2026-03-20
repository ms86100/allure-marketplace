

## Critical Audit Results: Category ↔ Workflow Mapping (Phase 1.5)

### Overall Verdict: MINOR ISSUES + 1 CRITICAL (pre-existing)

Phase 1.5 itself is **clean and non-regressive**. However, the audit exposed a pre-existing critical bug that the new visibility layer now makes obvious.

---

### CRITICAL: `book_slot` transaction_type has ZERO flow rows

**Severity:** CRITICAL (pre-existing, not caused by Phase 1.5)

**Root cause:** `resolveTransactionType` returns `'book_slot'` for enquiry orders in `classes`/`events` parent groups (line 19). The DB trigger in `fn_enqueue_order_status_notification` also uses `'book_slot'` (migration line 88). But `category_status_flows` has **zero rows** where `transaction_type = 'book_slot'`. The only service workflow is `service_booking`.

**Impact:**
- Classes/events enquiry orders get **empty flow** — no status timeline, no valid transitions
- Notification trigger silently fails to find the flow step → `v_silent` is null → notifications may fire incorrectly
- Admin preview shows `service_booking` (correct via DB map), but runtime uses `book_slot` (broken) — **config ↔ reality drift**

**Fix (2 options, recommend Option A):**
1. **Option A — Fix resolver:** Change `resolveTransactionType` line 19 from `return 'book_slot'` to `return 'service_booking'`. Update the DB trigger CASE similarly. This aligns runtime with DB map.
2. **Option B — Add rows:** Insert `book_slot` flows into `category_status_flows` as copies of `service_booking`. Creates duplication.

Also update `TRANSACTION_TYPES` in `src/components/admin/workflow/types.ts` — it already lists `book_slot` as a valid type, but no flows exist for it.

---

### HIGH: Edge functions use hardcoded transaction_type lists

**Severity:** HIGH

**Files:** `supabase/functions/update-live-activity-apns/index.ts` (line 108), `supabase/functions/update-delivery-location/index.ts` (line 61)

Both hardcode `.in('transaction_type', ['cart_purchase', 'seller_delivery'])` instead of querying all relevant types. If new workflow types are added, these functions silently miss them.

**Fix:** Either query all non-terminal statuses without filtering by transaction_type, or query `listing_type_workflow_map` to get the full set of workflow keys.

---

### MEDIUM: Static fallback map could drift from DB

**Severity:** MEDIUM

`src/lib/listingTypeWorkflowMap.ts` has `LISTING_TYPE_TO_WORKFLOW_FALLBACK` which is used when DB map hasn't loaded yet. If an admin adds a new listing type to the DB table, the fallback won't have it.

**Current mitigation:** Fallback defaults to `'cart_purchase'` which is safe. Comments clearly mark it as fallback-only. **Acceptable risk** — no fix needed now, but worth noting.

---

### MEDIUM: `FULFILLMENT_DEPENDENT_TYPES` set is unused

**Severity:** MEDIUM (dead code)

`FULFILLMENT_DEPENDENT_TYPES` in `listingTypeWorkflowMap.ts` is defined but never imported anywhere. The conditional logic in `CategoryWorkflowPreview` uses `is_conditional` from DB instead (correct).

**Fix:** Remove dead code.

---

### Section-by-Section Confirmations

| Section | Status | Notes |
|---------|--------|-------|
| 1. Source of Truth | **PASS** | DB table is canonical. Static map correctly marked fallback-only. No duplication in hooks/components. |
| 2. Runtime Consistency | **FAIL** | `book_slot` divergence (see CRITICAL above) |
| 3. Backward Compatibility | **PASS** | All existing flows (cart, buy_now, request, booking) unaffected. Phase 1.5 only added read-only admin visibility. |
| 4. Silent Failures | **PASS with caveat** | Fallback to `'cart_purchase'` is safe. `book_slot` issue is pre-existing. Preview correctly shows "Fallback" badge when no workflow found. |
| 5. WorkflowLinkage | **PASS** | `book_slot` → `service_booking`, `request_quote` → `request_service`, `schedule_visit` → `service_booking` all correctly resolved via DB map. |
| 6. Preview Accuracy | **PASS** | Determinism badges work correctly. Conditional flag used for `cart_purchase`/`buy_now`. |
| 7. Audit Trail | **PASS** | Query joins `orders` → `order_items` → `products.category` correctly. Shows `order_type` and `fulfillment_type`. |
| 8. Performance | **PASS** | Single query cached 10min with jitter. No N+1. Preview uses per-category `useEffect` with proper deps. |
| 9. Data Integrity | **PASS** | `listing_type` is PK (unique). `validate_transaction_type` trigger guards valid values. RLS allows authenticated read. |
| 10. E2E Contract | **FAIL for book_slot only** | All other listing types have complete flow coverage. |

---

### Recommended Actions (Priority Order)

1. **CRITICAL FIX:** Change `resolveTransactionType` to return `'service_booking'` instead of `'book_slot'` for classes/events enquiries. Update the DB trigger CASE expression to match. This eliminates the config ↔ runtime divergence.

2. **HIGH FIX:** Update edge functions to not hardcode transaction_type lists, or at minimum add `service_booking` and `self_fulfillment` to the existing filters.

3. **CLEANUP:** Remove `FULFILLMENT_DEPENDENT_TYPES` dead code.

4. **OPTIONAL:** Add a DB constraint or trigger on `listing_type_workflow_map.workflow_key` to validate it exists in `category_status_flows`.

