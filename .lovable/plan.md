

# Fix: Auto-Complete on OTP + Smart Attention Alerts

## Problem 1: Redundant "Yes, I received my order" after OTP

The OTP verification (`verify_delivery_otp_and_complete`) sets the order to `delivered`. Then the buyer sees a "Did you receive your order?" confirmation card that calls `buyer_confirm_delivery` to move to `completed`. This is redundant — the OTP **is** the proof of delivery. The buyer shouldn't need to confirm twice.

**Fix:** Modify the `verify_delivery_otp_and_complete` RPC to set the order status directly to `completed` (not `delivered`), and also clear `needs_attention` / `needs_attention_reason` since the delivery is now confirmed. Then hide the `BuyerDeliveryConfirmation` component for delivery orders where OTP was used.

**Changes:**
- **Database migration:** Update `verify_delivery_otp_and_complete` to set `status = 'completed'` instead of `'delivered'`, and reset `needs_attention = false, needs_attention_reason = null`
- **`src/pages/OrderDetailPage.tsx`:** Hide the `BuyerDeliveryConfirmation` card when order is a delivery order (OTP-verified deliveries skip `delivered` and go straight to `completed`)

## Problem 2: Generic "10 minutes" attention message even after 10+ hours

The `monitor-stalled-deliveries` edge function hardcodes: `"GPS tracking paused for over 1.5 minutes during active delivery"`. It never updates the message as time passes.

**Fix:** Make the attention reason dynamic — compute the actual elapsed time from `last_location_at` and format it as a human-readable duration.

**Changes:**
- **`supabase/functions/monitor-stalled-deliveries/index.ts`:** Compute actual elapsed time from `assignment.last_location_at` and format it contextually:
  - < 5 min: "GPS updates paused for a few minutes"
  - 5–30 min: "GPS updates paused for X minutes"
  - 30–60 min: "Tracking has been inactive for over 30 minutes"
  - 1+ hours: "Tracking has been inactive for over X hours"
- Also clear `needs_attention` when delivery completes (handled by the RPC fix above)

## Problem 3: Attention banner persists after delivery is complete

The `needs_attention` flag is never cleared. Even after successful OTP verification and delivery completion, the warning banner remains visible.

**Fix:** The RPC update (Problem 1) will clear the flag. Additionally, hide the attention banner on terminal statuses (`delivered`, `completed`) in the frontend as a safety net.

**Changes:**
- **`src/pages/OrderDetailPage.tsx`:** Add condition to hide attention banner when status is `delivered` or `completed`

## Problem 4: Delivery Code card still visible after delivery

The OTP card shows for "all non-terminal delivery statuses" but after OTP verification the order jumps to `completed` (terminal), so this resolves itself with the RPC fix.

## Summary of Changes

| File | Change |
|------|--------|
| Database migration (new) | Update `verify_delivery_otp_and_complete`: set `completed` instead of `delivered`, clear `needs_attention` |
| `supabase/functions/monitor-stalled-deliveries/index.ts` | Dynamic elapsed-time formatting for `needs_attention_reason` |
| `src/pages/OrderDetailPage.tsx` | Hide attention banner on terminal statuses; hide `BuyerDeliveryConfirmation` for OTP-verified delivery orders |

