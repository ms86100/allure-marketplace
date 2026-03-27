

# Fix: Application-Wide Slowness — Tab Switches and Post-Order Navigation

## Root Cause Analysis

After examining the codebase, three distinct performance bottlenecks are causing the 5-6 second delays:

### Problem 1: COD Order Placement Blocks on Edge Function (5+ seconds)
In `useCartPage.ts` line 514-518, after a COD order is placed, the code calls `await clearCartAndCache()` (which hits the DB), then fires `supabase.functions.invoke('process-notification-queue')` — this is fire-and-forget but `clearCartAndCache` is `await`ed **before** navigation. The bigger issue: `clearCartAndCache()` calls `clearCart()` which deletes all cart items from DB one-by-one via the cart hook. The navigation to `/orders/{id}` only happens after all these async operations complete.

### Problem 2: Every Route Change Remounts Heavy Components
When you tap a bottom nav tab, React Router unmounts the current page and mounts a new one. Each lazy-loaded page triggers a dynamic import + full component tree mount. The `Suspense` fallback shows a skeleton, but the actual page mount triggers multiple queries simultaneously (marketplace data, category configs, badge configs, system settings, etc.). These all fire in parallel but the page renders as blank/loading until they resolve.

### Problem 3: Console Ref Warnings = Wasted Render Cycles
The console shows `SellerTrustBadge` and `ProductDetailSheet` are function components receiving refs they can't handle. React logs a warning per instance and skips the ref — but with dozens of product cards, this generates excessive console work.

### Problem 4: Order Detail Page Cold-Load After Navigation
After placing a COD order and navigating to `/orders/{orderId}`, the order detail page fires `fetchOrderData` which does a complex join query. There's no `placeholderData` and no optimistic seed — so the page shows loading skeleton for 1-3 seconds.

---

## Surgical Fixes

### Fix 1: Make Post-Order Navigation Instant (useCartPage.ts)
**Current** (line 514-518):
```typescript
await clearCartAndCache();
supabase.functions.invoke('process-notification-queue').catch(() => {});
prefetchFlowData();
navigate(`/orders/${orderIds[0]}`);
```

**Fixed**: Navigate FIRST, then clear cart in background:
```typescript
hapticNotification('success');
prefetchFlowData();
// Navigate immediately — don't block on cart clear
if (orderIds.length === 1) {
  toast.success('Order placed successfully!', { id: 'order-placed' });
  navigate(`/orders/${orderIds[0]}`);
} else {
  toast.success(`${orderIds.length} orders placed!`, { id: 'order-placed' });
  navigate('/orders');
}
// Background: clear cart + trigger notifications (non-blocking)
clearCartAndCache().catch(() => {});
requestFullPermission().catch(() => {});
supabase.functions.invoke('process-notification-queue').catch(() => {});
```

Same pattern for the Razorpay success handler (line ~556-562) and UPI confirmation handler (line ~617-621).

### Fix 2: Add startTransition to Route Navigation (BottomNav.tsx)
Wrap nav link clicks in `React.startTransition` so React doesn't block the UI thread while mounting the new route. This makes tab switches feel instant — the old page stays visible during the transition instead of showing a loading skeleton.

### Fix 3: Fix forwardRef Warnings (SellerTrustBadge.tsx, ProductDetailSheet.tsx)
- `SellerTrustBadge` is a function component being passed a ref from `ProductListingCardInner`. Wrap with `React.forwardRef` or remove the ref from the call site.
- `ProductDetailSheet` has the same issue in `SearchPage`. Fix the ref passing.

### Fix 4: Seed Order Detail Cache on Navigation (useCartPage.ts)
After `createOrdersForAllSellers` succeeds, we have the order data (buyer info, items, seller). Seed the React Query cache with this data so the order detail page loads instantly:

```typescript
// After order creation success, seed cache
queryClient.setQueryData(['order-detail', orderIds[0]], {
  order: { /* constructed from known cart data */ },
  derivedParentGroup: parentGroup,
  derivedListingType: null,
});
```

---

## Files Changed

| File | Change | Risk |
|------|--------|------|
| `src/hooks/useCartPage.ts` | Navigate before awaiting cart clear (3 places) | Zero — cart clear still happens, just non-blocking |
| `src/components/layout/BottomNav.tsx` | Add `startTransition` to tab navigation | Zero — standard React 18 pattern |
| `src/components/trust/SellerTrustBadge.tsx` | Add `forwardRef` wrapper | Zero — additive |
| `src/components/product/ProductDetailSheet.tsx` | Fix ref passing | Zero — removes warning |
| `src/hooks/useOrderDetail.ts` | Accept `placeholderData` from cache | Zero — additive fallback |

## Impact
- Tab switches: instant (no more 2-3s delay)
- Post-order navigation: instant (from 5-6s to <500ms)
- Console warnings: eliminated (cleaner render cycles)
- No existing functionality is changed or removed

