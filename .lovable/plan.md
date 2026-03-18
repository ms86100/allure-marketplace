
Permanent fix plan for the cart-empty production bug

What I verified
- This is a frontend state-consistency bug, not a backend persistence bug.
- The database currently contains the 3 cart rows for your user.
- The network log shows 3 successful cart inserts at 14:15:10, 14:15:15, and 14:15:21.
- The lightweight cart-count query also saw 1, then 2, then 3 items.
- So the cart is being saved correctly, but the cart page can still render “Your cart is empty”.

Root cause
1. The current cart write path is still race-prone.
- `useCart.addItem()` does optimistic writes, but it does not cancel in-flight cart reads before writing.
- It also does not keep a full rollback snapshot of cart items.
- It only has a per-product mutex, so adding 3 different products creates 3 concurrent writes with no global reconciliation control.

2. Stale reads can overwrite optimistic cart state.
- If a cart refetch returns before all inserts settle, an empty or partial server response can replace the optimistic cache.
- After that, `CartPage` trusts `items.length === 0` and renders the empty state.

3. The empty-state guard is still too weak.
- `CartPage` only checks `isLoading` and `hasHydrated`.
- It does not protect against “desynced” states like:
  - DB has rows
  - cart-count is non-zero
  - optimistic writes are still settling
  - cart-items cache was overwritten by a stale read

4. Count and item list still use separate read paths.
- `useCartCount()` can be correct while `useCart()` is stale.
- That mismatch is exactly the kind of split-brain state that causes trust-breaking bugs.

Why the current fix was not enough
- The earlier fix improved auth hydration and reorder flow.
- It did not fully harden `addItem()` against concurrent multi-product adds plus immediate navigation.
- It also did not add a true “reconciling/syncing” state for the cart page.

Implementation plan
1. Rebuild cart mutations in `src/hooks/useCart.tsx`
- Create a single authoritative `fetchCartItems(userId)` helper.
- Before every mutation:
  - cancel cart-related queries
  - snapshot previous cart items and count
  - apply optimistic update
- After success:
  - fetch authoritative cart rows immediately
  - seed both `cart-items` and `cart-count` caches from that response
  - do not rely on blind invalidation alone
- On error:
  - restore full previous cart snapshot
  - restore count snapshot
- Apply this to:
  - `addItem`
  - `updateQuantity`
  - `removeItem`
  - `clearCart`
  - `replaceCart`

2. Add global cart reconciliation state in `src/hooks/useCart.tsx`
- Track:
  - `pendingMutationCount`
  - `isReconciling`
  - `lastSuccessfulSyncAt`
- Keep the existing per-product lock, but also add a global mutation sequence/barrier so older fetches cannot overwrite newer optimistic writes.

3. Eliminate cart/count split-brain
- Refactor `src/hooks/useCartCount.ts` so it derives from the same authoritative cart cache, or at minimum uses the same reconcile helper and cache seeding path.
- Goal: badge count and cart page must always come from the same source of truth.

4. Harden cart page rendering in `src/pages/CartPage.tsx` and `src/hooks/useCartPage.ts`
- Only show empty state when all of these are true:
  - auth/session is ready
  - no cart mutation is pending
  - no cart reconciliation is in progress
  - authoritative cart sync completed
  - item list is empty
  - derived count is also zero
- If count > 0 but items are empty, show a syncing state and force an authoritative refresh instead of showing “Your cart is empty”.

5. Add self-healing on cart entry
- When `/cart` opens, if the cart is in a desynced state, run an immediate reconcile.
- This ensures route transitions cannot expose stale empty cache even if writes are still settling.

6. Add regression coverage
- Add tests for:
  - add 3 different items quickly, then open cart immediately
  - add same item repeatedly
  - navigate to `/cart` while writes are in flight
  - stale empty cache while DB has cart rows
  - auth restore with existing cart
  - mutation failure rollback
- There are currently no meaningful hook-level tests covering this exact cart race.

Files to change
- `src/hooks/useCart.tsx`
- `src/hooks/useCartCount.ts`
- `src/hooks/useCartPage.ts`
- `src/pages/CartPage.tsx`
- likely one new shared cart helper and one new cart-focused test file

Important conclusion
- RLS is not the current blocker here.
- The backend is saving the cart correctly.
- The permanent fix is to make cart mutations transactional at the client-cache level and prevent empty-state rendering until authoritative reconciliation finishes.

Definition of done
- Add 3 items quickly from search/home/seller pages
- Open cart immediately
- Cart must show all added items on first render
- Badge count and cart page must always match
- No empty-state flash while the backend cart already contains items
