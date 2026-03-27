
Root cause is confirmed: the stock fix was only partially applied.

What is happening now:
- `useCart.tsx` does enforce stock, but only if the incoming product object already has `stock_quantity`, otherwise it fetches once from `products`.
- Some buyer flows still pass incomplete product objects into `addItem(...)`.
- The clearest broken path is `src/hooks/useProductDetail.ts`:
  - it calculates stock from `product.specifications?.stock_quantity` / `loadedSpecs.stock_quantity`
  - but when calling `addItem(...)`, it sends a synthetic product object without `stock_quantity`
- Since seller stock is actually saved in `products.stock_quantity` (`useSellerProducts.ts`, `SellerProductsPage.tsx`), this mismatch means the buyer flow can behave as if stock is unlimited in certain paths.

Evidence from code:
- Seller saves stock to `products.stock_quantity`
- Cart enforcement reads `product.stock_quantity` first, else DB
- Product detail sheet never passes `stock_quantity`
- Product detail sheet also reads stock from `specifications`, which is no longer the canonical source

Implementation plan

1. Fix the source of truth
- Treat `products.stock_quantity` as the only canonical buyer-facing stock field.
- Stop relying on `specifications.stock_quantity` in buyer flows.

2. Fix product detail flow
- Update `useProductDetail.ts` to fetch/select real `stock_quantity` from `products`.
- Pass `stock_quantity` into the object sent to `addItem(...)`.
- Compute `stockLimit` from the fetched product row, not `specifications`.

3. Audit all add-to-cart entry points
- Review every component/hook that calls `addItem(...)` or `updateQuantity(...)`.
- Ensure each passes a product shape containing `stock_quantity`, or that the path explicitly loads canonical product data first.
- Prioritize:
  - product detail sheet
  - listing cards
  - reorder/cart replacement flow
  - any quick-add or suggested/similar product flows

4. Harden cart logic
- In `useCart.tsx`, make stock lookup always resolve from the canonical product row when stock is missing from the incoming object.
- Keep the DB-side guard, but remove any reliance on stale UI-only stock assumptions.
- Ensure quantity updates and optimistic state use the resolved ceiling consistently.

5. Verify checkout protection
- Reconfirm checkout remains protected by the server-side stock validation already added in `create_multi_vendor_orders`.
- Ensure buyer-facing error handling is ready for insufficient stock responses if cart state becomes stale.

6. Prevent this regression from returning
- Add focused tests for:
  - add from product card with stock 2
  - add from product detail with stock 2
  - increment from cart beyond stock
  - reorder of item whose stock is lower than previous quantity
  - checkout failure when stock changed concurrently
- This closes the gap that allowed one path to remain broken while others were “fixed”.

Expected result
- Buyers will never be able to add more than available stock from any entry point.
- Product detail, listing, cart, reorder, and checkout will all enforce the same stock number.
- No negative or oversold inventory states will be possible through normal buyer flows.

Technical notes
- Files to update:
  - `src/hooks/useProductDetail.ts`
  - `src/hooks/useCart.tsx`
  - possibly `src/components/product/ProductDetailSheet.tsx` if it depends on old stock props
  - any reorder/quick-add callers discovered in the audit
- No schema redesign is needed for this fix; the canonical field already exists in `products.stock_quantity`.
