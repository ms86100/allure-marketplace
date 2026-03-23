

# QA Audit: 5 Critical Bugs in the Dynamic Workflow Engine

## Impact Analysis Preface

The dynamic workflow engine touches these core modules: **Order Detail Page** (buyer + seller views), **Delivery Partner Dashboard**, **DB Trigger validation**, **Status transition RPCs**, and **Admin Workflow Manager**. Fixes to any of these require careful regression testing across all order types (cart_purchase, service_booking, seller_delivery, self_fulfillment, contact_enquiry).

---

## Bug 1: Fallback Linear Flow Breaks on Comma-Separated Actors

**Description:** The `getNextStatusForActor()` function in `useCategoryStatusFlow.ts` has a legacy fallback path (lines 165-175) that activates when transitions are not loaded. In this path, it checks `next.actor !== 'seller'` — a strict string equality. Since the admin UI now stores multi-actor values as comma-separated strings (e.g., `"seller,delivery"`), this check will **always fail** for multi-actor steps, returning `null` and hiding the seller's CTA button entirely.

**Why critical (buyer trust):** If transitions fail to load (network blip, cold cache), the seller sees "Awaiting next step" instead of a CTA button. The order appears stuck. The buyer sees no progress and loses trust.

**Affected modules:** `useOrderDetail.ts` (seller action bar), `OrderDetailPage.tsx` (seller CTA), any future consumer of the fallback path.

**Fix risks:** Changing the fallback to `.split(',').includes(actor)` is safe and backward-compatible. Single-value actors like `"seller"` will still match. Risk: **Low** — the primary path (transitions-based) is unaffected.

**Implementation plan:**
1. In `useCategoryStatusFlow.ts` line 173, replace `next.actor !== 'seller'` with `!next.actor.split(',').includes(actor)` to handle both single and comma-separated actor values.
2. Generalize: remove the seller-specific check — any actor should only advance to steps where they appear in the actor list.

---

## Bug 2: `verify_delivery_otp_and_complete` RPC Blocks Delivery Partners

**Description:** The `verify_delivery_otp_and_complete` RPC (latest migration) checks `_seller_user_id IS DISTINCT FROM auth.uid()` and raises "Only the seller can complete this delivery." This means if a workflow defines a **delivery partner** (not the seller) as the actor who performs OTP verification at the delivery step, the RPC will reject them.

**Why critical (buyer trust):** The buyer has shared their OTP with the delivery partner at the door. The partner enters it and gets an error. The delivery cannot be completed. The buyer is left waiting, and the order is stuck in limbo.

**Affected modules:** `DeliveryCompletionOtpDialog.tsx` (both seller and delivery partner views), `DeliveryPartnerDashboardPage.tsx`, the `verify_delivery_otp_and_complete` RPC.

**Fix risks:** Adding delivery partner authorization requires checking `delivery_assignments.rider_user_id` as an alternative to seller ownership. Risk: **Medium** — must ensure the check doesn't open a security hole (only the assigned rider OR the seller should verify). The `service_complete_delivery` RPC (used by edge functions for platform deliveries) is separate and unaffected.

**Implementation plan:**
1. Alter the RPC to also accept `auth.uid() = _assignment_record.rider_user_id` (fetch rider_user_id from delivery_assignments).
2. Keep the existing seller check as a valid alternative — either seller OR assigned rider can verify.
3. Keep the `delivery_handled_by = 'platform'` guard to prevent double-path conflicts.

---

## Bug 3: `stepRequiresOtp()` Only Checks Next Status — Ignores Actor Context

**Description:** In `OrderDetailPage.tsx` line 604, `stepRequiresOtp(o.flow, o.nextStatus)` checks if the *target* step has `requires_otp = true`. But it doesn't check **who** is performing the action. If a workflow defines that OTP is required when the *delivery partner* completes delivery, but the *seller* is the one advancing (self-delivery), the OTP dialog still shows — correct. However, the reverse is also true: if a workflow step has `requires_otp = true` and the **buyer** is the one advancing to it (via `buyerNextStatus`), the buyer action bar does NOT check for OTP at all (lines 632-636). The buyer just gets a plain button.

**Why critical (buyer trust):** If an admin configures a step like "confirmed" with `requires_otp = true` (e.g., buyer must enter OTP to confirm receipt in a service booking), the buyer can bypass it entirely — the OTP dialog never appears. This undermines the verification security the admin intended.

**Affected modules:** `OrderDetailPage.tsx` (buyer action bar), `useOrderDetail.ts` (buyerNextStatus).

**Fix risks:** Adding OTP interception to the buyer action bar mirrors the seller pattern. Risk: **Low** — the `buyer_advance_order` RPC doesn't enforce OTP server-side, so this is UI-only currently. A server-side OTP check for buyer actions would need a new RPC.

**Implementation plan:**
1. In the buyer action bar section of `OrderDetailPage.tsx`, add the same `stepRequiresOtp()` check before the advance button.
2. Create a buyer-facing OTP dialog or reuse `DeliveryCompletionOtpDialog` with a buyer-appropriate flow.
3. Consider adding server-side OTP enforcement in `buyer_advance_order` for steps flagged `requires_otp`.

---

## Bug 4: DB Trigger Ignores `allowed_actor` — Any Authenticated User Can Advance

**Description:** The `validate_order_status_transition` trigger (latest version in migration `20260323140222`) checks if a transition row *exists* in `category_status_transitions` matching `from_status` and `to_status`, but it does **NOT** filter by `allowed_actor`. This means if a transition is defined only for `delivery` actor (e.g., `picked_up → on_the_way`), a *seller* or even a *buyer* could update the order to that status directly, as long as they can bypass RLS (which sellers can via `.eq('seller_id', ...)`).

**Why critical (buyer trust):** A seller could accidentally or intentionally skip steps (e.g., mark "delivered" without going through "on_the_way"), or a buyer could manipulate status via API calls. The workflow enforcement that admins carefully configured is effectively unenforced at the database level.

**Affected modules:** All order status updates via direct `.update()` calls in `useOrderDetail.ts`, the `validate_order_status_transition` trigger, any future integrations that update order status.

**Fix risks:** Re-adding actor enforcement requires determining the caller's role reliably within the trigger. Previous attempts used `current_setting('role')` which had issues. Risk: **Medium** — must handle the multi-path correctly: seller updates (RLS-filtered), buyer RPCs (SECURITY DEFINER), system/service_role updates, and delivery partner updates. The `app.otp_verified` bypass and `payment_pending` bypass must remain intact.

**Implementation plan:**
1. Add `allowed_actor` filtering back to the trigger's transition lookup.
2. Use a session flag pattern: set `app.acting_as` in each RPC/path before the update (e.g., `buyer_advance_order` sets `app.acting_as = 'buyer'`, seller update path sets `app.acting_as = 'seller'`).
3. The trigger reads this flag and includes it in the `WHERE` clause.
4. Fallback: if `app.acting_as` is not set and role is `service_role`, allow (system/edge function path).

---

## Bug 5: `DeliveryStatusCard` Progress Bar Ignores Comma-Separated Actors and Workflow Flow

**Description:** `DeliveryStatusCard.tsx` renders its own independent progress bar using `delivery_assignments.status` and a hardcoded `DEFAULT_LABELS` map (pending → assigned → picked_up → on_the_way → at_gate → delivered). This is entirely disconnected from the dynamic workflow. If an admin configures a workflow that skips "at_gate" or adds a custom step between "picked_up" and "delivered", the delivery card shows a mismatched timeline. The buyer sees one progression on the order timeline and a different one on the delivery card.

**Why critical (buyer trust):** Contradictory progress indicators erode trust. The order timeline might show 4 steps while the delivery card shows 6. The buyer doesn't know which one to believe. Worse, the delivery card may show "At Your Gate" for a workflow that never uses that status.

**Affected modules:** `DeliveryStatusCard.tsx`, `OrderDetailPage.tsx` (where it's rendered), `delivery_assignments` status handling.

**Fix risks:** Aligning the delivery card with the workflow engine requires passing the flow steps to `DeliveryStatusCard` or having it fetch the workflow. Risk: **Low-Medium** — the delivery_assignments table has its own status lifecycle (pending/assigned/picked_up/etc.) which may not perfectly map to order-level workflow steps. The mapping between delivery assignment statuses and order statuses needs to be explicit.

**Implementation plan:**
1. Pass the workflow `flow` (or at minimum the transit steps) as a prop to `DeliveryStatusCard`.
2. Derive the delivery progress bar from the workflow's `is_transit` steps instead of the hardcoded list.
3. Keep `DEFAULT_LABELS` as a fallback only when no flow is provided.
4. Use `labelsConfig` from `delivery_status_labels` system setting as override layer (existing behavior preserved).

