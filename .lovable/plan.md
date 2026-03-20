

## Remove Duplicate "Added to Cart" Toast

**Problem:** When a product is added to the cart, the user sees two feedback elements: the floating green cart bar (FloatingCartBar) animates/bounces via the `cart-item-added` CustomEvent, AND a toast saying "X added to cart". This is redundant — the cart bar already confirms the action.

**Fix:** Stop showing the toast in `feedbackAddItem`, but keep the haptic feedback and the `cart-item-added` CustomEvent (which the FloatingCartBar listens to for its bounce animation).

### Changes

**`src/lib/feedbackEngine.ts`** — In `feedbackAddItem()`, remove the `toast.success(...)` call. Keep `hapticImpact('medium')` and `dispatch('cart-item-added')`.

That's the only change needed. The FloatingCartBar will continue to animate on add, providing clear visual confirmation without a redundant toast.

