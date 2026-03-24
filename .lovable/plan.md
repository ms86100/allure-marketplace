

# Fix: Validation Error Disappears + Tracking Spinner When Not Applicable

## Two bugs, two fixes

### Bug 1: Delivery OTP validation clears silently and saves anyway

**Root cause**: In `AdminWorkflowManager.tsx` lines 222-238, when `otp_type = 'delivery'` is set on a pre-tracking step, the validation:
1. Shows a toast warning
2. Clears `otp_type` to null
3. **Does NOT return** — continues to save the workflow
4. Save completes → calls `setSelectedWorkflow(null)` → editor closes

The user sees a brief toast, then the editor vanishes. The OTP was silently cleared and saved as "None".

**Fix in `AdminWorkflowManager.tsx`**:
- When delivery OTP is cleared by validation, **stop the save** (`return` after clearing)
- The editor stays open with the corrected values visible
- Show a persistent `toast.error()` instead of `toast.warning()` so it's clearly an actionable message
- User can then review the cleared state and decide to save manually or change the setting

### Bug 2: "Setting up live tracking..." spinner shows without delivery assignment

**Root cause**: In `OrderDetailPage.tsx` lines 500-515, the tracking section renders when `isDeliveryOrder && isInTransit`. If `deliveryAssignmentId` is falsy, it shows the "Setting up live tracking..." spinner indefinitely — even if no delivery assignment will ever be created (e.g., seller-handled delivery where assignment hasn't been created yet, or a workflow step that's marked `is_transit` but has no `creates_tracking_assignment` earlier).

**Fix in `OrderDetailPage.tsx`**:
- Check if the workflow actually has a `creates_tracking_assignment` step before showing the spinner
- If no step in the flow has `creates_tracking_assignment = true`, don't show the "Setting up" spinner — show nothing or a simple status card instead
- This makes the spinner conditional on the workflow actually expecting a tracking assignment

## Files to modify

| File | Change |
|---|---|
| `src/components/admin/AdminWorkflowManager.tsx` | Return early after delivery OTP validation clears values; use `toast.error` for visibility |
| `src/pages/OrderDetailPage.tsx` | Gate "Setting up live tracking" spinner on whether any flow step has `creates_tracking_assignment = true` |

## What stays the same
- The validation logic itself (correctly identifies pre-tracking delivery OTP)
- Generic OTP — no restrictions, works anywhere
- `isInTransit` computation — still workflow-driven
- All DB triggers and RPCs

