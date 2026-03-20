
Root cause analysis

This is not a one-off bad order. It is a systemic flow split.

1. The OTP gate in the database is working correctly
- `supabase/migrations/20260318132639_...sql` adds `trg_enforce_delivery_otp` on `orders`
- Any direct `orders.status -> delivered` update is rejected unless the session flag `app.otp_verified=true` is set
- That flag is only set inside the secure OTP completion RPC `verify_delivery_otp_and_complete`

2. The app still has unsafe fallback paths that bypass the secure OTP RPC
- In `src/pages/OrderDetailPage.tsx`, seller completion uses OTP only if `deliveryAssignmentId` is present
- If `deliveryAssignmentId` is missing/not yet loaded, it falls back to `o.updateOrderStatus(o.nextStatus!)`
- That generic order update hits the DB trigger and fails with:
  `Delivery OTP verification required. Use the verify_delivery_otp_and_complete function.`
- Your screenshot strongly confirms this exact state: the page shows `Setting up live tracking...`, which means the assignment was not available in UI state when the seller tried to finish the order

3. There is a second inconsistent path in the delivery dashboard
- `src/pages/DeliveryPartnerDashboardPage.tsx` still directly updates `delivery_assignments.status = 'delivered'`
- That bypasses the secure completion flow entirely
- So the system currently has multiple competing completion paths:
  - Safe path: OTP RPC
  - Unsafe path A: direct order status update
  - Unsafe path B: direct delivery assignment update

4. Why it “worked before” but failed again
- The previous fix protected one successful path
- It did not remove all alternate paths
- So some orders go through the correct OTP flow, while others still hit a fallback path depending on timing/state hydration/which screen the seller uses

What exactly is breaking

Flow that breaks now:
1. Seller opens order summary
2. Order is already in a delivery stage
3. `deliveryAssignmentId` is still null, delayed, or unresolved in the page state
4. Seller taps the action button
5. UI falls back to generic `updateOrderStatus('delivered')`
6. Database trigger blocks it because OTP verification marker was never set
7. User sees the exact error in the screenshot

System areas involved
- Frontend:
  - `src/pages/OrderDetailPage.tsx`
  - `src/pages/DeliveryPartnerDashboardPage.tsx`
- Backend/database:
  - `public.verify_delivery_otp_and_complete(...)`
  - `public.enforce_delivery_otp_gate()` trigger on `orders`
  - `public.sync_delivery_to_order_status()` trigger logic
- State propagation:
  - `deliveryAssignmentId` hydration / assignment lookup / fallback behavior

Permanent fix

1. Make delivery completion go through one single completion service
- Create one shared completion path for all delivery orders
- Seller/rider completion must always call the secure server-side completion function
- No screen should directly write `orders.status='delivered'`
- No screen should directly write `delivery_assignments.status='delivered'`

2. Remove the dangerous fallback in `OrderDetailPage`
- If a delivery order needs OTP and `deliveryAssignmentId` is not ready:
  - disable the completion button
  - show a deterministic loading state like “Preparing delivery verification…”
  - retry assignment fetch instead of calling generic `updateOrderStatus`
- This is the core fix for the current bug

3. Replace direct dashboard updates with the secure completion flow
- In `DeliveryPartnerDashboardPage.tsx`
  - keep direct status updates only for pre-completion states like `picked_up` / `at_gate`
  - for final completion, open OTP verification UI and call the secure backend completion action
- This removes the second unsafe path

4. Harden the database so unsafe completion paths can never succeed
- Add a guard on `delivery_assignments` so direct transition to `status='delivered'` is rejected unless it comes from the verified completion flow
- Make the secure completion flow update both:
  - `delivery_assignments`
  - `orders`
  atomically in one transaction
- Either:
  - stop auto-syncing `delivered` from assignment -> order entirely, or
  - allow it only when an internal verified flag is present in the same transaction

5. Strengthen assignment hydration
- In `OrderDetailPage.tsx`, assignment lookup must be resilient:
  - handle `maybeSingle()` errors explicitly
  - subscribe to both INSERT and UPDATE
  - retry while order is in delivery stages and assignment is missing
- If the system detects an in-transit delivery order without an assignment in UI state, it should block completion and self-heal by refetching

6. Add anomaly detection for broken orders
- Detect and log cases where:
  - order is in delivery stage but no assignment exists
  - multiple assignments exist for one active order
  - assignment is delivered but order is not terminal
- This prevents silent recurrence in production

Implementation plan

Phase 1: stop the production failure
- Update `src/pages/OrderDetailPage.tsx`
  - remove direct delivered fallback for delivery orders
  - require assignment readiness before showing/enabling final completion
- Update `src/pages/DeliveryPartnerDashboardPage.tsx`
  - remove direct `status='delivered'` updates
  - route completion through OTP flow only

Phase 2: enforce correctness at backend level
- Add DB/trigger guard so `delivery_assignments.status='delivered'` cannot be set outside the verified completion flow
- Refactor the secure completion path to be the only place that can finalize delivery

Phase 3: improve state reliability
- Strengthen assignment fetch/retry/subscription logic in order detail
- Add explicit error handling for null/multiple assignment states
- Show clear blocked/loading UI instead of allowing fallback mutation

Phase 4: prevent recurrence
- Add tests for:
  - seller completes new delivery order
  - delayed assignment hydration
  - OTP required path from order summary
  - delivery dashboard completion
  - no direct delivered update allowed
- Add logging/auditing for invalid completion attempts and missing assignment anomalies

Expected result after the permanent fix
- Every future delivery completion uses the same verified path
- Seller can never hit the generic “Failed to update order: Delivery OTP verification required” error from UI again
- If assignment state is late, the app waits safely instead of attempting an invalid mutation
- Database guarantees that no alternate client path can bypass or accidentally break the completion flow
