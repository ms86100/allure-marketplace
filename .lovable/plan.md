

## Root Cause Analysis

The error `Delivery OTP verification required` keeps appearing because of a **mismatch between frontend and backend OTP detection logic**:

### The DB trigger (`enforce_delivery_otp_gate`)
When transitioning to `delivered`, it checks:
1. Does a `delivery_assignment` with a non-null `delivery_code` exist?
2. Does the workflow's `delivered` step have `requires_otp`?
3. If no workflow step found, **defaults to `true`** (safe default)
4. If all true, requires `app.otp_verified` session flag

### The frontend (`stepRequiresOtp`)
Checks if the **target step** in the loaded flow has `requires_otp = true`. If the step isn't found in the flow (e.g., flow not fully loaded, or parent_group override mismatch), it **defaults to `false`** -- the opposite of the DB.

### Why it keeps happening
1. **`transaction_type` is `null`** on the order (visible in network response). The frontend resolves it to `seller_delivery` via runtime logic, but the DB trigger uses `COALESCE(transaction_type, 'seller_delivery')` -- usually matching, but fragile.
2. **Race condition**: The flow loads asynchronously. If the seller taps the action button before the flow finishes resolving (or if the flow resolves to a different parent_group override), `stepRequiresOtp` returns `false` while the DB enforces `true`.
3. **Safe default mismatch**: DB defaults to requiring OTP (safe), frontend defaults to not requiring it (unsafe).

## Bulletproof Fix

### 1. Frontend: Add a secondary OTP gate based on delivery assignment existence

In `OrderDetailPage.tsx`, change the seller action bar logic: if there's a `deliveryAssignmentId` (meaning a delivery code exists), AND the next status is a terminal/success step (like `delivered` or `completed`), ALWAYS route through the OTP dialog. Don't rely solely on `stepRequiresOtp`.

```text
Current logic:
  stepRequiresOtp(flow, nextStatus) ? → OTP dialog : regular button

New logic:
  (stepRequiresOtp(flow, nextStatus) || hasDeliveryOtpGate) ? → OTP dialog : regular button
```

Where `hasDeliveryOtpGate = deliveryAssignmentId && isDeliveryOrder && isTerminalOrDeliveredStep(nextStatus)`

### 2. Frontend: Make `stepRequiresOtp` default to `true` for delivery completion steps

When the step is not found in the flow, default to `true` for known delivery completion statuses (`delivered`, `completed`) -- matching the DB's safe default.

### 3. Backend safety: Catch the specific OTP error in `updateOrderStatus` and auto-open the OTP dialog

In `useOrderDetail.ts`, when `updateOrderStatus` catches the `Delivery OTP verification required` error, instead of just showing a toast, fire a callback or event that opens the OTP dialog automatically.

### Files to modify
- **`src/pages/OrderDetailPage.tsx`** -- Add `hasDeliveryOtpGate` logic to seller and buyer action bars; catch OTP error to auto-open dialog
- **`src/hooks/useOrderDetail.ts`** -- Add OTP-required error detection that triggers a callback instead of just a toast
- **`src/hooks/useCategoryStatusFlow.ts`** -- Update `stepRequiresOtp` to default `true` for delivery/terminal steps when flow is ambiguous

