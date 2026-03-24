

# Fix: Fully Workflow-Driven Action Buttons

## Problem

Two issues remain:

1. **Legacy `hasDeliveryOtpGate` bypass** (lines 213-216, 658, 688): Forces delivery OTP on terminal steps regardless of workflow config — `(hasDeliveryOtpGate && sellerNextIsTerminal)`.
2. **Button labels don't reflect end-state awareness**: All OTP buttons say `Verify & [label]` and non-OTP buttons say `Mark [label]`, but terminal steps should say "Complete" variants.

## Changes — `src/pages/OrderDetailPage.tsx`

### 1. Remove legacy bypass (lines 211-216)

Delete `hasDeliveryOtpGate`, `sellerNextIsTerminal`, `buyerNextIsTerminal` entirely. These are non-workflow overrides.

### 2. Simplify OTP checks (lines 658, 688)

```js
// Before:
const needsDeliveryOtp = (nextOtpType === 'delivery' && deliveryAssignmentId) || (hasDeliveryOtpGate && sellerNextIsTerminal);

// After:
const needsDeliveryOtp = nextOtpType === 'delivery' && !!deliveryAssignmentId;
```

Same for buyer (line 688).

### 3. Dynamic labels with end-state awareness

Create a helper inside the component:

```ts
const getActionLabel = (status: string, otpRequired: boolean) => {
  const step = o.flow.find(s => s.status_key === status);
  const label = step?.display_label || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const isEnd = step?.is_terminal === true;
  if (otpRequired) return isEnd ? `Verify & Complete` : `Verify & ${label}`;
  return isEnd ? `Complete Order` : `Mark ${label}`;
};
```

Replace all button label expressions:
- Line 662: `getActionLabel(o.nextStatus, true)`
- Line 667: `getActionLabel(o.nextStatus, true)`
- Line 671: `getActionLabel(o.nextStatus, false)`
- Line 692: `getActionLabel(o.buyerNextStatus, true)`
- Line 697: `getActionLabel(o.buyerNextStatus, true)`
- Line 702: `getActionLabel(o.buyerNextStatus, false)`

### Result

| Scenario | Button |
|---|---|
| Next = `preparing`, no OTP | "Mark Preparing" |
| Next = `preparing`, delivery OTP | "Verify & Preparing" |
| Next = `delivered`, terminal, delivery OTP | "Verify & Complete" |
| Next = `delivered`, terminal, no OTP | "Complete Order" |
| Next = `completed`, terminal, generic OTP | "Verify & Complete" |

## One file changed

`src/pages/OrderDetailPage.tsx`

