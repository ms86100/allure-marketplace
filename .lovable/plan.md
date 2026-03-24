
Goal: remove the mismatch that makes order `46db6646` look “not workflow-driven” even though the runtime is following a different contract than the editor.

What is happening now (traceable facts):
- This order resolves to `food_beverages / seller_delivery`, not `default / seller_delivery`:
  - seller `primary_group = food_beverages`
  - `fulfillment_type = delivery`
  - `delivery_handled_by = seller`
  - stored `transaction_type = null`
  - so `resolveTransactionType(...)` returns `seller_delivery`
- The page is displaying the wrong workflow source:
  - `OrderDetailPage.tsx` prints `workflow: {(order as any).seller_profiles?.primary_group || 'default'} / ...`
  - but `fetchOrder()` loads the seller relation as `order.seller`, not `order.seller_profiles`
  - so the UI falsely shows `default`
- In DB, `food_beverages / seller_delivery / accepted` has:
  - `requires_otp = true`
  - `otp_type = null`
- Runtime OTP gating now uses `otp_type`, not the legacy boolean:
  - `getStepOtpType()` reads `otp_type`
  - `OrderDetailPage.tsx` checks `nextOtpType === 'delivery'`
  - therefore the UI ignores `requires_otp=true` when `otp_type` is null and shows `Mark Preparing`

Implementation plan:

1. Fix workflow visibility on the order page
- In `useOrderDetail.ts`, return explicit:
  - `resolvedParentGroup`
  - `resolvedTransactionType`
  - `workflowSource` (`override` or `default fallback`)
- In `OrderDetailPage.tsx`, replace the broken header label with those resolved values so the page shows the actual workflow being used.

2. Remove the split-brain OTP model in admin
- In `AdminWorkflowManager.tsx`, make `otp_type` the only editable OTP control.
- Remove or disable any remaining UX that makes `requires_otp` look independently configurable.
- Show `requires_otp` as derived/read-only: `otp_type !== null`.

3. Detect and repair legacy OTP mismatches
- In the admin editor, add a blocking warning for any step where:
  - `requires_otp = true`
  - `otp_type = null`
- Message: “Legacy OTP flag is ignored at runtime until an OTP Type is selected.”
- On save, normalize mismatches:
  - valid post-tracking legacy rows → map to `otp_type = 'delivery'`
  - invalid pre-tracking rows (like `accepted`) → clear the legacy boolean and keep a warning

4. Make invalid early-step delivery OTP explicit
- Keep the existing architectural rule: delivery OTP only works once delivery-assignment context exists.
- In `AdminWorkflowManager.tsx`, show a hard inline warning on pre-tracking steps:
  - “Delivery OTP cannot run here; this step will not prompt OTP in the UI.”
- Do not create fake delivery assignments for early steps.

5. Add runtime debug clarity for admins/sellers
- On the order detail page, add a compact debug chip visible to admins/sellers showing:
  - active workflow
  - next status
  - `otp_type`
  - whether OTP is expected
  - why the OTP CTA is or is not shown
- This makes future workflow-vs-UI discrepancies immediately explainable.

Files to update:
- `src/hooks/useOrderDetail.ts`
- `src/pages/OrderDetailPage.tsx`
- `src/components/admin/AdminWorkflowManager.tsx`
- optionally `src/components/admin/workflow/types.ts` for clearer OTP typing

Expected outcome for this exact order:
- The page will stop falsely saying `default / seller_delivery`.
- It will clearly show the order is using `food_beverages / seller_delivery`.
- The editor will make it obvious that `accepted` currently has a legacy mismatch (`requires_otp=true`, `otp_type=null`) that runtime ignores.
- After cleanup, admin configuration and UI behavior will match exactly, with no silent OTP bypass caused by legacy fields.
