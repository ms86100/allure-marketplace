
## QA Audit Round 1: 5 Critical Bugs — FIXED ✅

### Bug 1: Fallback actor check for comma-separated values ✅
### Bug 2: OTP RPC blocks delivery partners ✅
### Bug 3: Buyer action bar missing OTP check ✅
### Bug 4: DB trigger ignores allowed_actor ✅
### Bug 5: DeliveryStatusCard hardcoded progress ✅

---

## QA Audit Round 2: 5 Production Blockers — FIXED ✅

### Blocker 1: Seller updates bypass actor enforcement ✅
- Created `seller_advance_order` RPC (SECURITY DEFINER) mirroring `buyer_advance_order`
- Sets `app.acting_as = 'seller'` before update
- Validates transition exists for `allowed_actor = 'seller'`
- `useOrderDetail.updateOrderStatus()` now calls this RPC instead of direct `.update()`

### Blocker 2: Delivery dashboard fully hardcoded ✅
- Added `getNextDeliveryAction()` helper that derives next status from workflow steps
- Replaced hardcoded `assigned/picked_up/at_gate` action buttons with dynamic workflow-driven logic
- Replaced hardcoded active tab filter with non-terminal check
- Transit detection uses non-terminal/non-pending check instead of hardcoded array

### Blocker 3: Delivery-to-order sync trigger uses stale flag ✅
- Updated `sync_delivery_to_order_status` to set `app.acting_as = 'delivery'` instead of stale `app.delivery_sync`
- Replaced hardcoded status mappings with dynamic lookup from `category_status_flows` using `is_transit` flag
- Terminal delivery statuses (delivered/failed/cancelled) excluded from sync — handled by OTP RPC

### Blocker 4: DeliveryStatusCard OTP hint hardcoded ✅
- Replaced `['picked_up', 'at_gate']` with workflow-driven check using `requires_otp` and `is_transit` flags
- Falls back to hardcoded list when no flow provided

### Blocker 5: statusFlowCache hardcodes transaction types ✅
- Removed `.in('transaction_type', [...])` filter
- All current and future workflow types now supported dynamically
