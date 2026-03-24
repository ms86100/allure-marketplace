
# Fix: Workflow Visibility + OTP Split-Brain Resolution

## Problem
1. Order detail page showed wrong workflow (`default` instead of `food_beverages`) because it accessed `order.seller_profiles` instead of `order.seller`
2. Legacy `requires_otp=true` with `otp_type=null` caused runtime to silently skip OTP (runtime reads `otp_type`, not the boolean)
3. No admin visibility into which workflow an order is actually using or why OTP is/isn't triggering

## Changes Made

### 1. `src/hooks/useOrderDetail.ts`
- Added `resolvedParentGroup` derived from `effectiveParentGroup || 'default'`
- Exposed in return object for consumers

### 2. `src/pages/OrderDetailPage.tsx`
- Fixed workflow label: uses `o.resolvedParentGroup` instead of broken `order.seller_profiles?.primary_group`
- Added debug chip (seller-only): shows active workflow, next status, otp_type, and assignment state

### 3. `src/components/admin/AdminWorkflowManager.tsx`
- **Save-time normalization**: detects `requires_otp=true` + `otp_type=null` mismatches
  - Post-tracking steps → auto-mapped to `otp_type='delivery'`
  - Pre-tracking steps → legacy flag cleared with warning
- **Inline warning**: red alert icon next to OTP dropdown when legacy mismatch detected
- Existing delivery OTP pre-tracking warning preserved

## Result
- Workflow label on order page now shows the ACTUAL workflow being used
- Admin can see and fix legacy OTP mismatches immediately
- Debug chip provides instant clarity on OTP gating decisions
- `requires_otp` is always derived from `otp_type !== null` on save — single source of truth
