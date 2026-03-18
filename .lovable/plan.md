
Implementation plan to fix the cart-empty bug permanently

What is actually broken

The issue is real and there are multiple contributing causes in the current code:

1. Auth/session readiness race
- `useCart` and `useCartCount` only wait for `!!user`.
- `AuthProvider` flips `isLoading` to false as soon as auth emits, before the app has a reliable “session restored and ready” state for downstream queries.
- This makes cart queries vulnerable during fast navigation, resume, or sign-in restoration.

2. False empty-cart rendering
- `CartPage` shows the empty state whenever `items.length === 0`.
- It does not distinguish between:
  - truly empty cart
  - stale cached empty array
  - background refetch after an add/reorder
  - auth restoration still in progress
- So users can see “Your cart is empty” even while the backend cart row exists.

3. Split cart write paths
- `useCart.addItem()` updates cart cache optimistically.
- `ReorderButton` and `ReorderLastOrder` bypass the cart provider, write directly to the database, then immediately navigate to `/cart`.
- That creates inconsistent state between:
  - cart badge/count
  - cart items cache
  - cart page UI

Why sign out / sign in makes it appear
- A fresh auth bootstrap causes the cart query to run again cleanly, so the backend data finally hydrates into the UI.

Proposed permanent fix

1. Add a real auth-ready signal
Files:
- `src/contexts/auth/types.ts`
- `src/contexts/auth/useAuthState.ts`
- `src/contexts/auth/AuthProvider.tsx`
- optionally new `src/hooks/useAuthReady.ts`

Plan:
- Introduce a dedicated auth bootstrap/session-ready flag separate from profile loading.
- Mark auth as ready only after initial session restoration completes.
- Expose this through auth context so data hooks can depend on it.
- Keep route protection behavior intact, but stop data hooks from querying too early.

2. Gate all cart reads on auth readiness
Files:
- `src/hooks/useCart.tsx`
- `src/hooks/useCartCount.ts`

Plan:
- Change cart queries from `enabled: !!user` to `enabled: authReady && !!user`.
- Track both:
  - initial cart hydration status
  - background refetch status
- Expose a stronger cart state from the provider, for example:
  - `isBootstrapping`
  - `isRefreshing`
  - `hasHydrated`

3. Stop showing a false empty state
Files:
- `src/pages/CartPage.tsx`
- `src/hooks/useCartPage.ts`

Plan:
- Render loading/sync UI until the first authenticated cart fetch completes.
- Only show “Your cart is empty” after:
  - auth is ready
  - cart query has hydrated at least once
  - no refetch is currently resolving a recent mutation
- This removes the bad trust-breaking flash.

4. Unify cart mutations behind the cart provider
Files:
- `src/hooks/useCart.tsx`
- `src/components/order/ReorderButton.tsx`
- `src/components/home/ReorderLastOrder.tsx`

Plan:
- Add a provider-level batch/replace API such as `replaceCart(items)` or `setCartFromProducts(...)`.
- Move reorder flows to use the shared cart layer instead of direct DB writes plus blind invalidation.
- Update cache optimistically before navigating to `/cart`.
- Await the provider mutation lifecycle before navigation so the cart page opens with correct data already present.

5. Make navigation to `/cart` resilient after mutations
Files:
- `src/components/order/ReorderButton.tsx`
- `src/components/home/ReorderLastOrder.tsx`
- possibly product/home CTA callers if needed

Plan:
- After successful add/reorder, wait for cart cache reconciliation or explicitly seed the cart query before navigating.
- Do not rely only on `invalidateQueries()` and hope the next screen finishes refetch in time.

6. Add cache hygiene on auth transitions
Files:
- `src/hooks/useCart.tsx`
- `src/contexts/auth/useAuthState.ts`
- possibly app-level query handling

Plan:
- On sign-out: clear cart item/count caches for the old user immediately.
- On sign-in/session restore: trigger a single authoritative cart refresh for the current user.
- Prevent undefined-user cache states from leaking into the signed-in experience.

7. Add regression coverage for the real failure path
Files:
- existing test area for hooks/pages if present

Plan:
- Add tests for:
  - add from home page then open cart immediately
  - reorder then open cart immediately
  - app start with delayed session restore
  - sign-out/sign-in cycle with existing backend cart
  - stale empty cache followed by background refetch
- Acceptance: cart badge and cart page must always agree.

Implementation order

1. Add auth-ready/session-restored state
2. Update `useCart` and `useCartCount` to use it
3. Fix cart page empty-state logic
4. Refactor reorder flows into shared cart mutation APIs
5. Add auth-transition cache cleanup
6. Run regression verification on fast navigation flows

Technical notes
- This should be frontend/query-state work only; no database migration is required for the core fix.
- The most important architectural change is making the backend cart the source of truth while keeping the React Query cache consistent across all cart entry points.
- The current direct mutation pattern in reorder flows is the biggest consistency risk and should be removed.

Validation checklist after implementation

1. Add from home page, immediately open cart
- item must appear on first render

2. Reorder from home/order history, immediately open cart
- replaced items must appear without refresh

3. Refresh app on `/cart`
- existing backend cart must load correctly without needing sign-out/sign-in

4. Sign out and sign back in
- old cart cache must not leak
- current user cart must appear reliably

5. Slow network / delayed session restore
- cart page must show loading/syncing, never false empty state

6. Cart badge vs cart page
- both must always match

Definition of done

This is fixed only if:
- cart never depends on a lucky re-login to appear
- all cart entry points use the same mutation/cache path
- `/cart` never shows a false empty state while authenticated cart data is still hydrating
- badge count and cart contents remain consistent across navigation, refresh, and session restore
