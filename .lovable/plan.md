

# Fix: Add Workflow Validation for `otp_type = 'delivery'` on Non-Delivery Steps

## Problem

The user is right: the previous plan tried to "make the system support a wrong workflow" by creating fake delivery assignments. The correct fix is to **prevent the misconfiguration** and **gracefully handle it in the UI**.

**Principle:** `otp_type = 'delivery'` is only valid on steps where a delivery assignment will already exist (i.e., steps that come AFTER a `creates_tracking_assignment = true` step, or steps that are `is_transit = true`).

---

## Changes

### 1. Admin Workflow Manager — Validate `otp_type = 'delivery'` on save

**File: `src/components/admin/AdminWorkflowManager.tsx`** (after line 219, alongside self-pickup validation)

Add validation: scan steps in sort order. Track whether a `creates_tracking_assignment` step has been encountered. If any step BEFORE that point has `otp_type = 'delivery'`, show a toast error and auto-clear it:

```
"Delivery OTP requires a delivery assignment. Step 'accepted' comes before any tracking assignment step — cleared to 'None'."
```

Also add an inline warning in the OTP Type dropdown: if the step has `otp_type = 'delivery'` but no prior step has `creates_tracking_assignment = true`, show an `AlertTriangle` icon with tooltip explaining why.

### 2. Admin Workflow Manager — Add inline visual warning on the dropdown

**File: `src/components/admin/AdminWorkflowManager.tsx`** (around line 601)

Next to the OTP Type `<Select>`, check if the current step position is before any `creates_tracking_assignment` step. If so and `otp_type = 'delivery'` is selected, render an orange warning icon.

### 3. OrderDetailPage — Graceful fallback when `otp_type = 'delivery'` but no assignment

**File: `src/pages/OrderDetailPage.tsx`** (line 634-643)

Current code already handles this correctly after the previous fix:
- `needsDeliveryOtp = (nextOtpType === 'delivery' && deliveryAssignmentId)` — if no assignment, this is `false`
- Falls through to the normal button — **correct behavior**

No change needed here. The current code already shows a normal advance button when `otp_type = 'delivery'` but no `deliveryAssignmentId` exists. The DB trigger is the safety net.

### 4. DeliveryActionCard — Same graceful handling

**File: `src/components/delivery/DeliveryActionCard.tsx`** (line 56)

Currently uses `requiresOtp: nextStep.requires_otp`. Update to use `otp_type`:
- If `otp_type === 'delivery'` and assignment exists → show OTP button
- If `otp_type === 'delivery'` and no assignment → show normal button
- This aligns the delivery card with the same logic as OrderDetailPage

---

## Files Modified

| File | Change |
|---|---|
| `src/components/admin/AdminWorkflowManager.tsx` | Save-time validation + inline warning for delivery OTP on pre-assignment steps |
| `src/components/delivery/DeliveryActionCard.tsx` | Use `otp_type` instead of `requires_otp` boolean |

## What is NOT changed
- No DB trigger modifications
- No delivery assignment creation changes  
- No schema changes
- `OrderDetailPage.tsx` — already handles this correctly after previous fix
- `useCategoryStatusFlow.ts` — already has `getStepOtpType()` and `otp_type` in queries

## Result
- Admin gets clear feedback when misconfiguring delivery OTP on early steps
- UI never deadlocks — shows normal button when delivery context doesn't exist
- DB trigger remains the safety net for any edge cases
- System respects the principle: "delivery OTP requires delivery assignment to already exist"

