
Goal: deliver a production-hardening plan for the 3 issues with evidence from the current codebase, prioritizing the payment P0 first.

1. P0: UPI return flow is still not bulletproof
- Confirmed evidence:
  - `src/pages/CartPage.tsx:63-83` shows the exact “Pending Payment / incomplete payment” shell when cart is empty but a payment session exists.
  - `src/hooks/useCartPage.ts:508-529` creates online orders, saves a pending-payment session, and opens UPI.
  - `supabase/migrations/20260331064103_eff92636-1193-40b0-94d1-2bebe2f3cd47.sql:322-323` still deletes `cart_items` immediately inside `create_multi_vendor_orders`, even for online `payment_pending` orders.
  - `src/components/payment/UpiDeepLinkCheckout.tsx:109-123` runs a visibility-based DB recheck on app resume and can keep the sheet in `confirm` if backend state is not yet advanced.
  - `src/components/payment/UpiDeepLinkCheckout.tsx:182-187` only advances the order when `confirm_upi_payment` succeeds.
- Root cause:
  - The system still mixes two incompatible models:
    1) “cart clears only after confirmed payment” in client comments/intent
    2) “cart clears immediately on order creation” in the live DB RPC.
  - That makes the fallback UI highly likely after app return.
  - Separately, the UPI flow has a resume race: returning from the UPI app only checks order state; it does not auto-reconcile or distinguish “payment completed externally but buyer has not yet confirmed” from “truly incomplete”.
- Production fix plan:
  - Update `create_multi_vendor_orders` so cart clearing happens only for immediate-confirmation flows, not for `payment_pending` online flows.
  - Keep cart until UPI confirmation or verified Razorpay confirmation completes.
  - Harden `UpiDeepLinkCheckout` resume logic:
    - on app resume, if order is still `payment_pending/pending`, do not immediately imply failure/incomplete state;
    - show a stronger “Confirm your payment” recovery state, not the empty-cart dead-end shell;
    - add a backend recheck step before rendering the pending-payment shell.
  - Tighten `handleUpiDeepLinkSuccess` / `handleUpiDeepLinkFailed` in `src/hooks/useCartPage.ts` so session cleanup, cart cleanup, and navigation are strictly tied to confirmed backend state.
  - Add a single canonical “pending payment recovery” decision path in `useCartPage` instead of duplicating logic in mount recovery, retry, and sheet visibility handlers.
- Safeguards:
  - Preserve idempotency behavior already present in `useCartPage` and `create_multi_vendor_orders`.
  - Do not change seller-visible order creation timing unless payment is actually confirmed.
  - Keep `buyer_cancel_pending_orders` behavior intact for explicit cancellation.
- Validation:
  - Test matrix: UPI success + immediate return, UPI success + delayed return, UPI abandoned, UPI confirm with screenshot, app killed during payment, multi-order cart, multi-address delivery.
  - Verify no regression in Razorpay and COD flows.
  - Verify cart remains intact until confirmed online payment.

2. Seller “no order-arrival notification” is not proven fixed
- Concrete evidence:
  - iOS sound filename fix is present:
    - `supabase/functions/send-push-notification/index.ts:102`
    - `supabase/functions/send-push-notification/index.ts:244`
    - both use `gate_bell.mp3`
    - `codemagic.yaml:392-401` copies and links `ios-config/gate_bell.mp3`
  - But seller notification delivery still depends on device-token + permission readiness:
    - `src/hooks/usePushNotifications.ts:150-168` skips registration unless OS permission is granted
    - `src/hooks/usePushNotifications.ts:485-488` auto-registers only if permissions already exist
    - `src/hooks/useAuthPage.ts:176-182` requests permission after login, but this is timing-sensitive
  - Seller order-arrival notification sources are inconsistent:
    - `supabase/functions/confirm-razorpay-payment/index.ts:231-239` manually inserts seller notification payload `{ orderId, status: "placed", type: "order" }`
    - workflow trigger `fn_enqueue_order_status_notification` now inserts richer payloads with `target_role`, `action`, and workflow-based semantics.
- Root cause:
  - The sound bug itself is fixed in code, but “seller gets no notification” can still happen because:
    - the seller may never have a valid device token if permission/registration did not complete;
    - Razorpay seller notifications bypass the canonical workflow-trigger payload contract;
    - there is no proof yet that every placed order path emits one consistent seller-targeted push.
- Production fix plan:
  - Standardize seller new-order notification creation:
    - remove/manual-minimize custom payload divergence in `confirm-razorpay-payment`;
    - prefer one workflow-driven notification source for order placement whenever possible.
  - Add explicit diagnostics/fallback checks in push pipeline:
    - if `device_tokens` missing, keep in-app notification but surface operational visibility in diagnostics/logging.
  - Audit `process-notification-queue` and `send-push-notification` together to ensure seller-targeted orders always produce:
    - in-app row
    - push attempt
    - correct route/action payload
  - For the bell-on-locked-phone concern:
    - code-side filename mismatch is fixed;
    - remaining validation must focus on whether sellers actually have registered tokens and permissions.
- Safeguards:
  - Do not break buyer/seller inbox filtering via `target_role`.
  - Keep Android channel config unchanged (`orders_alert`, `gate_bell`).
- Validation:
  - Test with a real seller account on iOS locked-screen and Android locked-screen:
    - COD order arrival
    - Razorpay order arrival
    - UPI buyer-confirmed seller alert
  - Verify:
    - queue row inserted
    - `user_notifications` row inserted
    - `device_tokens` row exists
    - push attempt succeeds
    - tap opens correct order context.

3. Buyer default address behavior is only partially implemented
- Confirmed evidence:
  - `src/hooks/useDeliveryAddresses.ts:82` already resolves `defaultAddress = addresses.find(a => a.is_default) || addresses[0] || null`
  - `src/hooks/useCartPage.ts:257-262` auto-selects that default address into checkout
  - `src/components/profile/AddressForm.tsx` supports `is_default`
  - `src/components/profile/AddressCard.tsx` supports “Set Default”
  - `src/components/profile/AddressPicker.tsx:37-53` only selects an address for the current checkout; it does not persist that choice as default
- Root cause:
  - The system supports default addresses at the profile layer, but checkout selection is transient.
  - Users expect “the address I just picked” to become their preference, but checkout does not ask or persist that preference.
- Production fix plan:
  - Add a lightweight checkout preference flow:
    - when a buyer selects a non-default address in checkout, allow “Make this my default” at the point of selection or near the address summary.
  - Wire that action to existing `setDefault` from `useDeliveryAddresses`.
  - Keep current auto-select behavior, but ensure explicit user choice can persist.
- Safeguards:
  - Do not silently overwrite default on every temporary selection unless the user opted in.
  - Preserve current address book behavior and ordering.
- Validation:
  - Test with 0, 1, and multiple addresses.
  - Test first-time add with `is_default=true`.
  - Test selecting a non-default address, marking it default, leaving checkout, and returning.

Implementation order
1. Fix payment lifecycle inconsistency first:
   - `create_multi_vendor_orders`
   - `useCartPage`
   - `UpiDeepLinkCheckout`
   - `CartPage`
2. Then harden seller notification pipeline:
   - `confirm-razorpay-payment`
   - notification queue/push delivery consistency
   - push registration assumptions
3. Then add checkout-level default-address persistence:
   - `AddressPicker`
   - `useDeliveryAddresses`
   - `CartPage` / `useCartPage`

Risk notes
- Highest regression risk is payment-state handling because it touches cart persistence, recovery, and navigation.
- Notification fixes risk duplicate seller alerts if both manual insert and workflow-trigger paths remain active.
- Address fix risk is low if persistence is opt-in.

Definition of done
- Buyer cannot get stuck in a misleading pending-payment shell after successful UPI confirmation.
- Seller reliably receives order-arrival notification when a real placed order is created, with push working on locked devices if OS permission/token exists.
- Buyer checkout remembers preferred delivery address through explicit default selection.
