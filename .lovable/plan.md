
# Workflow Decoupling — Final Bulletproof Revision

## What I verified in the codebase
- `src/lib/marketplace-constants.ts` still has a hardcoded `TX_TO_ACTION` map, so frontend workflow logic is still duplicated.
- Buyer CTA resolution in product cards/details still falls back to `category_config.transaction_type`, which keeps category-driven behavior alive.
- Seller creation flows (`DraftProductManager.tsx`, `useBulkUpload.ts`) save `action_type`, but there is no robust DB-level category/action allowlist enforcement yet.
- `create_multi_vendor_orders` has multiple historical SQL versions and still resolves `transaction_type` inside the RPC instead of reading one canonical mapping source.
- The existing `listing_type_workflow_map` already proves drift is real: one seed maps `contact_only` to `request_service`, while app logic expects `contact_enquiry`.

## Architecture decision
Keep `product.action_type` as the seller-selected buyer interaction mode, and make the action→workflow translation database-owned.

Why this is the safest model:
- `action_type` is needed for UX distinctions like `request_quote` vs `request_service`, `buy_now` vs `add_to_cart`.
- `transaction_type` is needed for workflow execution on orders.
- The bug is not “having two concepts”; the bug is duplicating the mapping in multiple places.

So the production model becomes:

```text
product.action_type            = seller intent / buyer CTA mode
action_type_workflow_map       = single canonical translation source
order.transaction_type         = immutable workflow snapshot for execution
```

## DB changes
1. Create `public.action_type_workflow_map`
   - `action_type` PK
   - `transaction_type`
   - `checkout_mode` (`cart`, `booking`, `inquiry`, `contact`)
   - `creates_order`
   - `requires_price`
   - `requires_availability`
   - `is_active`

2. Add `default_action_type` to `category_config`

3. Create `public.category_allowed_action_types`
   - `category_config_id`
   - `action_type`
   - unique pair
   - FK to `action_type_workflow_map`

4. Remove workflow-setting product triggers that overwrite seller choice from category

5. Add a validation trigger on `products`
   - reject unknown `action_type`
   - reject `action_type` not allowed for that category
   - validate booking requirements before publish
   - never auto-rewrite values

6. Keep `listing_type_workflow_map` only for legacy listing-type compatibility, not as the product CTA source; also fix the `contact_only` mapping if still referenced anywhere.

## Backend hardening
1. Replace inline action/workflow CASE logic in `create_multi_vendor_orders` with DB lookup from `action_type_workflow_map`.

2. Make `create_multi_vendor_orders` explicitly purchase-only:
   - fetch each product’s `action_type`
   - join canonical mapping
   - hard-fail if any item is `booking`, `inquiry`, or `contact`
   - never coerce non-cart items into purchase orders

3. Enforce seller-group consistency in the RPC:
   - validate all items in a group belong to the same purchase family after fulfillment resolution
   - if not, reject with structured error instead of creating an ambiguous order

4. Persist `orders.transaction_type` only from the canonical DB mapping + fulfillment context, and treat it as immutable afterward.

5. Audit all downstream workflow consumers so they read `orders.transaction_type` first:
   - order status transition validation
   - buyer/seller advance RPCs
   - delivery sync/OTP completion
   - notifications
   - analytics/tracking

## Frontend changes
1. Remove business mapping from `marketplace-constants.ts`
   - keep `ACTION_CONFIG` for label/icon/UI only
   - stop using `TX_TO_ACTION` as workflow logic

2. Update buyer CTA resolution (`ProductGridCard`, `ProductListingCard`, `useProductDetail`)
   - use `product.action_type` first
   - use `category_config.default_action_type` only as temporary legacy fallback

3. Update seller product creation and bulk upload
   - fetch allowed actions from DB
   - preselect `default_action_type`
   - show clear explanations + CTA preview
   - block `book` if availability is missing

4. Update admin category/workflow UI
   - manage default action + allowed actions per category
   - keep workflow preview DB-driven

## Safe migration / no-regression rollout
1. Do not run heuristic backfills on live products.

2. Ship schema + validation first.

3. Seed mapping and category allowlists before switching UI.

4. Leave existing `products.action_type` untouched initially.

5. Add an audit report for suspicious products instead of auto-mutating them:
   - action not in mapping
   - action not allowed for category
   - booking action with no availability
   - category default/action mismatch
   - non-cart items somehow reaching cart/order payloads

6. Only perform data correction in an explicit remediation pass, scoped to clearly safe records or admin-reviewed batches.

## Result
This closes the remaining real gaps:
- no frontend/backend mapping drift
- no silent backfill corruption
- no mixed workflow payloads creating wrong orders
- no invalid category/action combinations bypassing UI
- no category change mutating existing seller listings

## Main implementation surface
- DB migration for `action_type_workflow_map`, `default_action_type`, `category_allowed_action_types`, trigger cleanup, and RPC hardening
- `src/lib/marketplace-constants.ts`
- `src/components/product/ProductGridCard.tsx`
- `src/components/product/ProductListingCard.tsx`
- `src/hooks/useProductDetail.ts`
- `src/components/seller/DraftProductManager.tsx`
- `src/components/seller/BulkProductUpload.tsx`
- admin category/workflow screens
- order notification / transition / delivery workflow functions
