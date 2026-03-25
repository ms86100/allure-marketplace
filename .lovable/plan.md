
# Server-Side Coupon Validation — DONE

## What Changed
Migration added a server-side coupon validation block to `create_multi_vendor_orders` RPC, inserted right after `_resolved_coupon_id` is resolved.

## Validations Added (in order)
1. Coupon exists and `is_active = true`
2. Not expired (`expires_at >= now()`)
3. Started (`starts_at <= now()`)
4. Global usage limit not exceeded
5. Coupon belongs to a seller in the current order
6. Per-user redemption limit not exceeded
7. Minimum order amount met
8. **Discount recalculated server-side** — client `_coupon_discount` is completely ignored

## Failure Mode
Invalid coupon → silently removed (`_resolved_coupon_id := NULL`, `_coupon_discount := 0`). Order proceeds without discount. No cart flow disruption.

## Impact: Zero
No client-side changes. No schema changes. Same function signature. All downstream consumers (payment_records, coupon_redemptions, order totals, Razorpay, settlements) use the same `_coupon_discount` variable which is now server-validated.
