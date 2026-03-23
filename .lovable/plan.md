
## QA Audit: 5 Critical Bugs — FIXED ✅

### Bug 1: Fallback actor check for comma-separated values ✅
- Fixed `getNextStatusForActor()` in `useCategoryStatusFlow.ts` — now uses `.split(',').includes(actor)` instead of strict `!== 'seller'`

### Bug 2: OTP RPC blocks delivery partners ✅
- Updated `verify_delivery_otp_and_complete` to accept either the seller OR the assigned delivery rider (`delivery_partner_pool.user_id`)

### Bug 3: Buyer action bar missing OTP check ✅
- Added `stepRequiresOtp()` intercept to buyer action bar in `OrderDetailPage.tsx` — mirrors the seller pattern

### Bug 4: DB trigger ignores allowed_actor ✅
- Added `app.acting_as` session flag pattern to `validate_order_status_transition`
- `buyer_advance_order` sets `app.acting_as = 'buyer'` before update
- Trigger enforces actor when flag is set; falls back to any-actor check for direct seller updates

### Bug 5: DeliveryStatusCard hardcoded progress ✅
- `DeliveryStatusCard` now accepts `flow` prop and derives progress bar from `is_transit` steps
- Falls back to `DEFAULT_LABELS` when no flow provided
- `OrderDetailPage` passes `o.flow` to `DeliveryStatusCard`
