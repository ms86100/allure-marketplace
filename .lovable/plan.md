
# Workflow Engine Audit — All Issues Fixed (Round 1 + Round 2)

## Round 1 Fixes (Migration 20260324161009)

| # | Issue | Fix |
|---|---|---|
| 1 | RPC checked ANY future step for OTP | Now checks only IMMEDIATE next step's `otp_type` |
| 2 | enforce_otp_gate silently bypassed when no delivery assignment | Now raises explicit error instead of passing silently |
| 3 | food_beverages workflow had OTP on wrong step | Moved delivery OTP from `preparing` to `delivered` |
| 4 | is_success=true on all non-terminal steps | Set is_success=false on non-terminal steps (food_beverages) |
| 5 | Wrong workflow loads before order data arrives | Added `isFlowLoading` guard to buyer action bar |
| 6 | Multiple creates_tracking_assignment steps allowed | Removed duplicate, added save-time validation |
| 7 | OTP verified flag bypassed transition validation | RPC now validates transition exists before proceeding |
| 8 | Buyer OTP code visible from assignment creation | OTP card only shown when next step requires delivery OTP |

## Round 2 Fixes (Data corrections)

| # | Issue | Fix |
|---|---|---|
| 1 | `default/cart_purchase` had 3 steps with `creates_tracking_assignment` | Cleared flags on `picked_up` and `on_the_way`, kept only `preparing` |
| 2 | `default/self_fulfillment` had tracking on `accepted` | Cleared `creates_tracking_assignment` flag |
| 3 | `is_success=true` on all non-terminal steps in default workflows | Set `is_success=false` on all non-terminal steps across all default workflows |
| 4 | `default/cart_purchase` had delivery OTP on both `picked_up` AND `on_the_way` | Cleared OTP from `picked_up`, kept only on `on_the_way` |
| 5 | `delivered` step in `cart_purchase` had `actor='system'` | Changed to `actor='delivery'` to match transition rules |
| 6 | `default/self_fulfillment` had `otp_type='delivery'` on `accepted` | Cleared — self-pickup doesn't need delivery OTP |
