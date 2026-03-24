

# Fix: Decouple Workflow OTP from Delivery OTP — Introduce `otp_type`

## Problem

`requires_otp = true` is ambiguous — the UI assumes it always means "delivery OTP" and gates on `deliveryAssignmentId`. When a step has `requires_otp` but no delivery context exists (e.g., `accepted` step), the UI shows an infinite spinner.

## Solution

Replace the boolean `requires_otp` with a typed `otp_type` column that explicitly declares OTP intent.

---

### 1. DB Migration — Add `otp_type` column

```sql
ALTER TABLE category_status_flows 
  ADD COLUMN otp_type text DEFAULT NULL;

-- Migrate existing data: where requires_otp = true, set otp_type = 'delivery'
UPDATE category_status_flows SET otp_type = 'delivery' WHERE requires_otp = true;

-- Keep requires_otp column for backward compat (DB triggers use it). 
-- It becomes derived: requires_otp = (otp_type IS NOT NULL)
```

Values: `'delivery'` (needs delivery assignment + code) | `null` (no OTP) | future: `'generic'`, `'pickup'`, etc.

### 2. Frontend — Read `otp_type` everywhere

**`src/hooks/useCategoryStatusFlow.ts`**:
- Add `otp_type: string | null` to `StatusFlowStep` interface
- Add to all `select()` queries (lines 32, 41)
- Update `stepRequiresOtp` → new `getStepOtpType(flow, statusKey): string | null`
- Keep `stepRequiresOtp` as a thin wrapper: `return getStepOtpType(flow, statusKey) !== null`

**`src/pages/OrderDetailPage.tsx`**:
- Import `getStepOtpType` instead of (or alongside) `stepRequiresOtp`
- **Seller action bar (line 631)**: Change condition to:
  ```
  const nextOtpType = getStepOtpType(o.flow, o.nextStatus);
  const needsDeliveryOtp = (nextOtpType === 'delivery' && deliveryAssignmentId) || (hasDeliveryOtpGate && sellerNextIsTerminal);
  const needsGenericOtp = nextOtpType && nextOtpType !== 'delivery';
  ```
  - If `needsDeliveryOtp` → show delivery OTP dialog (existing)
  - If `needsGenericOtp` → show normal button (future: generic OTP dialog)
  - If `nextOtpType === 'delivery' && !deliveryAssignmentId` → show **normal button** (not spinner). DB trigger is safety net.
  - Otherwise → normal advance button
- **Buyer action bar (line 660)**: Same logic

**`src/components/admin/workflow/types.ts`**:
- Add `otp_type: string | null` to `FlowStep` interface

**`src/components/admin/AdminWorkflowManager.tsx`**:
- Read/write `otp_type` in queries and save logic
- Replace the `requires_otp` checkbox with an `otp_type` dropdown: `None | Delivery OTP`
- On save, sync `requires_otp = (otp_type IS NOT NULL)` for backward compat with DB triggers

**`src/components/admin/workflow/WorkflowFlowDiagram.tsx`**:
- Show OTP icon with type label (🔐 Delivery OTP vs just 🔐)

**`src/components/admin/CategoryWorkflowPreview.tsx`**:
- Read `otp_type` in query, show type-aware icon

### 3. Keep DB trigger backward-compatible

The existing `enforce_delivery_otp_gate` trigger reads `requires_otp`. We keep that column synced: `requires_otp = (otp_type IS NOT NULL)`. No trigger changes needed.

### 4. Documentation update

**`src/components/docs/WorkflowEngineDocs.tsx`**:
- Update OTP section to explain `otp_type` field and that `requires_otp` is now derived

---

## Files Modified

| File | Change |
|---|---|
| DB migration | Add `otp_type` column, migrate data |
| `src/hooks/useCategoryStatusFlow.ts` | Add `otp_type` to interface/queries, new `getStepOtpType()` |
| `src/pages/OrderDetailPage.tsx` | Use `otp_type` to decouple delivery OTP from generic OTP |
| `src/components/admin/workflow/types.ts` | Add `otp_type` to FlowStep |
| `src/components/admin/AdminWorkflowManager.tsx` | Replace checkbox with dropdown, sync `requires_otp` |
| `src/components/admin/workflow/WorkflowFlowDiagram.tsx` | Type-aware OTP icon |
| `src/components/admin/CategoryWorkflowPreview.tsx` | Read `otp_type` |
| `src/components/docs/WorkflowEngineDocs.tsx` | Update docs |

## What is NOT changed
- DB trigger `enforce_delivery_otp_gate` — reads `requires_otp` which stays synced
- `DeliveryCompletionOtpDialog` — unchanged, still called for delivery OTP
- Order creation / resolution logic — unchanged

