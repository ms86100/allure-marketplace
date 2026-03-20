
Fix plan: restore seller ownership detection and remove the dead-end state on Order Detail.

1. Confirmed root cause
- The order and workflow are valid in the backend:
  - Order `28333797-aa36-48ef-a9e3-87400daed188` is still `placed`
  - It belongs to seller profile `602762b5-03fc-4097-82a6-ec23b60ab67a`
  - That seller profile belongs to the logged-in user `ef690ff1-d82e-4b74-a0c1-6705f79fc1cd`
  - The workflow has a valid seller transition: `placed -> accepted`
- So this is not primarily a flow-table problem.
- The break is most likely in the frontend seller gate: `isSellerView` depends on nested relation data (`seller?.user_id === user?.id`) instead of the order’s own `seller_id` / seller context. If that relation is missing, delayed, or partially hydrated, the seller action bar disappears even though the seller owns the order.

2. Implement the actual fix
- In `useOrderDetail.ts`, replace the fragile seller-view check with an ownership check based on seller context:
  - Compare `order.seller_id` against `currentSellerId`
  - Also allow fallback match against any of the user’s `sellerProfiles`
- Keep the nested seller relation only for display data, not authorization/UI gating.
- Use the same ownership logic for:
  - `isSellerView`
  - seller chat recipient selection
  - seller action bar visibility
  - seller update query guard

3. Add a safe fallback so the page never becomes a dead end
- If the order belongs to one of the user’s seller profiles but seller display data has not loaded yet:
  - still show seller actions
  - still allow `placed -> accepted`
- If ownership cannot be resolved, show an explicit inline error state instead of silently rendering no actions.

4. Tighten the overlay flow
- In `NewOrderAlertOverlay.tsx`, make navigation safer:
  - navigate first, then dismiss only after navigation is triggered successfully
  - if navigation fails, keep the alert visible or fall back clearly to `/orders`
- This prevents the “popup disappears, nothing happens” experience even if routing fails.

5. Add targeted debugging guards
- Add temporary logging around:
  - resolved `isSellerView`
  - `order.seller_id`
  - `currentSellerId`
  - matched seller profile IDs
  - computed `nextStatus`
- This will verify the seller gate and stop future regressions quickly.

Technical details
- Files to update:
  - `src/hooks/useOrderDetail.ts`
  - `src/components/seller/NewOrderAlertOverlay.tsx`
- Expected result after fix:
  - Clicking “View Order” opens the order page reliably
  - Seller is recognized correctly on that page
  - Action bar appears for `placed`
  - Seller can accept/reject and continue status updates normally
