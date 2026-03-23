

## Plan: Enforce Fully Workflow-Driven Architecture ✅ COMPLETED

### What Was Done

**DB Schema Changes:**
- Added `transaction_type` column to `orders` table — stores resolved workflow key at creation
- Added `is_transit` boolean to `category_status_flows` — drives tracking/map visibility from workflow
- Backfilled `transaction_type` on all existing orders
- Seeded `is_transit = true` for delivery transit steps

**RPC & Trigger Updates:**
- `create_multi_vendor_orders` — now sets `transaction_type` at order creation
- `validate_order_status_transition` — reads stored `transaction_type` directly, legacy fallback only for null
- `verify_delivery_otp_and_complete` — uses `is_transit` flag from DB instead of hardcoded status list

**Frontend Refactoring:**
- `useOrderDetail.ts` — `isInTransit` now uses `is_transit` from flow steps (no more system_settings)
- `OrderDetailPage.tsx` — removed 3 hardcoded overrides (OTP, cancel fallback, platform delivery check)
- `useCategoryStatusFlow.ts` — added `is_transit` to interface and select queries
- `resolveTransactionType.ts` — prefers stored `transaction_type` when available

**Edge Function:**
- `manage-delivery` — validates statuses against `category_status_transitions` DB table instead of hardcoded array

### Architecture
- **Single source of truth**: `transaction_type` on orders + `category_status_flows` + `category_status_transitions`
- **Zero hardcoded resolution** in trigger (with legacy fallback for pre-migration orders)
- **Transit/tracking**: driven by `is_transit` flag on workflow steps
- **OTP requirement**: driven by `requires_otp` flag on workflow steps
- **Actor enforcement**: driven by `allowed_actor` in transitions
