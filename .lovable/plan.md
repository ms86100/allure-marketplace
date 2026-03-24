
# Workflow Engine Audit — All 8 Issues Fixed

## Completed Fixes

| # | Issue | Fix |
|---|---|---|
| 1 | RPC checked ANY future step for OTP | Now checks only IMMEDIATE next step's `otp_type` |
| 2 | enforce_otp_gate silently bypassed when no delivery assignment | Now raises explicit error instead of passing silently |
| 3 | food_beverages workflow had OTP on wrong step | Moved delivery OTP from `preparing` to `delivered` |
| 4 | is_success=true on all non-terminal steps | Set is_success=false on non-terminal steps |
| 5 | Wrong workflow loads before order data arrives | Added `isFlowLoading` guard to buyer action bar |
| 6 | Multiple creates_tracking_assignment steps allowed | Removed duplicate, added save-time validation |
| 7 | OTP verified flag bypassed transition validation | RPC now validates transition exists before proceeding |
| 8 | Buyer OTP code visible from assignment creation | OTP card only shown when next step requires delivery OTP |
