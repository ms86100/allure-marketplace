

# Revalidation Report: Seller CRUD Bugs — Confidence Assessment

## Status of `.lovable/plan.md` (5 bugs from Configuration & CRUD Parity)

**ALL 5 bugs in the plan file are ALREADY FIXED.** The `.lovable/plan.md` is stale.

| # | Bug | Status | Evidence |
|---|-----|--------|----------|
| 1 | Service config missing from Products page | **FIXED** | `SellerProductsPage.tsx` lines 94-97 render `ServiceFieldsSection` |
| 2 | Action type selector missing | **FIXED** | Lines 65-86 render action type `Select` + contact phone `Input` |
| 3 | Category change doesn't reset blocks | **FIXED** | Line 62: `sp.setAttributeBlocks([])` in `onValueChange`. Line 570 in `DraftProductManager`: same |
| 4 | Onboarding edit doesn't load schedule | **FIXED** | `DraftProductManager.tsx` lines 364-378 fetch `service_availability_schedules` |
| 5 | Contact phone input missing | **FIXED** | Lines 80-86 render phone input when `action_type === 'contact_seller'` |

---

## Status of Latest Approved Plan (Data Integrity bugs — NOT yet implemented)

These are real, unimplemented bugs. Revalidated against current code:

### Bug 1: Onboarding payload missing `subcategory_id`, `lead_time_hours`, `accepts_preorders`
**Confidence: 100%** — Verified at `DraftProductManager.tsx` lines 200-216. The `productPayload` object has NO `subcategory_id`, `lead_time_hours`, or `accepts_preorders` fields. Compare with `useSellerProducts.ts` lines 242-244 which includes all three.

### Bug 2: Onboarding edit overwrites `approval_status` to `draft` unconditionally
**Confidence: 100%** — Line 210: `approval_status: 'draft'` is hardcoded for both inserts AND updates. The `useSellerProducts.ts` lines 246-261 have sophisticated conditional logic that preserves status. An approved product edited during onboarding silently drops back to `draft`.

### Bug 3: Edit doesn't reload `stock_quantity` fields into DraftProduct interface
**Confidence: 0% — ALREADY FIXED.** The `DraftProduct` interface at lines 35-36 now includes `stock_quantity?: number | null` and `low_stock_threshold?: number | null`. This bug was resolved in a prior round. **Drop from plan.**

### Bug 4: `rejection_note` not cleared on onboarding edit
**Confidence: 100%** — Lines 200-216 have no `rejection_note` field. `useSellerProducts.ts` lines 255-259 correctly clear it. A rejected product edited in onboarding retains stale rejection notes.

### Bug 5: Onboarding missing stock tracking, lead time, preorder UI
**Confidence: 100%** — Lines 580-678 show no stock toggle, no lead time input, no pre-order switch. The `SellerProductsPage` (lines 87, 92) has all three. Editing in onboarding silently resets these to defaults on save.

---

## Revised Plan: 4 Confirmed Bugs to Implement

All changes are in `src/components/seller/DraftProductManager.tsx`.

### Fix 1: Add missing fields to save payload (~2 min)
In `productPayload` (line 200-216), add:
```typescript
subcategory_id: (newProduct as any).subcategory_id || null,
lead_time_hours: (newProduct as any).lead_time_hours ? parseInt(String((newProduct as any).lead_time_hours)) : null,
accepts_preorders: (newProduct as any).accepts_preorders || false,
```

### Fix 2: Conditional approval_status for edits (~3 min)
Replace line 210 with logic that only uses `'draft'` for new inserts, and transitions `approved`/`rejected` to `'pending'` on edit:
```typescript
approval_status: (() => {
  if (!isEditing || !existingId) return 'draft';
  const existing = products[editingIndex!];
  const currentStatus = (existing as any).approval_status || 'draft';
  if (['approved', 'rejected'].includes(currentStatus)) return 'pending';
  return currentStatus;
})(),
```

### Fix 3: Clear stale rejection_note on edit (~1 min)
Add to payload: `...(isEditing ? { rejection_note: null } : {}),`

### Fix 4: Add stock/lead_time/preorder UI to onboarding form (~10 min)
After the attribute blocks section (line 634), add:
- Stock tracking toggle + quantity/threshold inputs (matching `SellerProductsPage` line 92 pattern)
- Lead time hours input
- Accept pre-orders toggle

Wire to `newProduct` state using the existing `DraftProduct` interface fields.

**Risks**:
1. Form length increases — mitigate by placing in a collapsible section
2. `DraftProduct` interface may need `lead_time_hours`, `accepts_preorders`, `subcategory_id` added — currently accessed via `(newProduct as any)`, should be typed properly

| # | Bug | Confidence | Effort |
|---|-----|-----------|--------|
| 1 | Missing payload fields | 100% | ~2 min |
| 2 | Unconditional draft status on edit | 100% | ~3 min |
| 3 | Stale rejection_note | 100% | ~1 min |
| 4 | Missing stock/lead_time/preorder UI | 100% | ~10 min |

