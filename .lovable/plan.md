

## Status: The fix IS now universally applied

### Evidence from your own session

The network logs show the RPC call at **08:45:14** failed with the OTP error. This was the last request **before** the migration was deployed. Your session replay at **08:46:12** shows the exact same order completing successfully with the message "Delivery verified and completed" — proving the fix is now live and working.

### Why it happened one more time

The migration I deployed (`20260320084807`) replaced the `verify_delivery_otp_and_complete` function to set `app.otp_verified = 'true'` **before** updating tables. The 08:45:14 call hit the **old** function (before the migration propagated). The retry hit the **new** function and succeeded.

### Current state of the system — all paths are locked down

1. **Trigger on `orders` table** (`enforce_delivery_otp_gate`): Blocks any direct `status → delivered` unless `app.otp_verified = 'true'` is set in the transaction
2. **Trigger on `delivery_assignments` table** (`enforce_delivery_assignment_otp_gate`): Same guard for the assignment table
3. **The RPC** (`verify_delivery_otp_and_complete`): Sets `app.otp_verified = 'true'` FIRST, then updates both tables atomically, then resets the flag
4. **No sync trigger** exists from `delivery_assignments → orders` that could bypass the gate — only `orders → delivery_assignments` sync exists

### Can this error happen again?

**No**, for orders going through the normal OTP verification flow. Here's why:

- The only way to transition an order to `delivered` is through the RPC (triggers block all other paths)
- The RPC sets the flag before the updates (verified in the live database)
- The frontend's `OrderDetailPage` and `DeliveryPartnerDashboardPage` both route through the OTP dialog which calls the RPC

**One remaining edge case**: The `manage-delivery` edge function's `handleComplete` action (used for platform/3PL deliveries) still directly updates `delivery_assignments.status = 'delivered'` and `orders.status = 'delivered'` **without** setting `app.otp_verified`. This path uses its own OTP verification but does NOT set the session flag, so it **will fail** against the new triggers.

### Plan: Fix the edge function path

Update `supabase/functions/manage-delivery/index.ts` `handleComplete` to call the RPC instead of doing direct updates, OR have the edge function use the service role to set the config flag before its updates. Since the edge function uses the service role client, the cleanest fix is to have it call the RPC or execute a raw SQL `SELECT set_config(...)` before its updates.

This is the **last remaining unsafe path**. After fixing it, there will be zero ways to hit this error from any part of the system.

