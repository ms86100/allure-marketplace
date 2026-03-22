

# Fix: Seller Action Bar Shows "Mark Unknown" — Using Legacy Labels Instead of Workflow

## Root Cause

**Line 616 of `OrderDetailPage.tsx`** uses `o.getOrderStatus(o.nextStatus).label` — this reads from a **hardcoded/legacy status label map**. The new `buyer_received` status only exists in the **DB workflow** (`category_status_flows.display_label = "Confirm Receipt"`), not in the legacy map, so it returns `"Unknown"`.

The buyer action bar (line 635) already correctly uses `o.getFlowStepLabel(o.buyerNextStatus).label`, which checks the DB flow first.

## Fix

**One-line change** in `src/pages/OrderDetailPage.tsx` line 616:

Replace `o.getOrderStatus(o.nextStatus).label` with `o.getFlowStepLabel(o.nextStatus).label`

This makes the seller action bar fully workflow-driven — the button will show **"Mark Confirm Receipt"** (from `display_label` in `category_status_flows`).

## Audit: Other Uses of `getOrderStatus`

- **Line 180** (`statusInfo` badge): Acceptable — it's the current status badge, and `getFlowStepLabel` already handles this with DB fallback. But should also be switched for consistency.
- **OrdersPage.tsx line 25**: List view — uses `getOrderStatus` for order cards. This should also use flow labels, but flow data isn't loaded per-order in list view. Lower priority — the list view doesn't show `buyer_received` as an action, only as a status badge. Can be addressed separately.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/OrderDetailPage.tsx` | Line 616: `getOrderStatus` → `getFlowStepLabel` for seller action button |

