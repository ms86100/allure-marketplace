

# 5 Critical Silent Buyer Bugs — Pre-Production Audit (Round 2)

## Bug 1: Out-of-Stock Products Show Active "Add" Button

**What**: `ProductListingCard.tsx` line 80 sets `isOutOfStock = !product.is_available`, and `ProductCard.tsx` line 46 sets `isDisabled = !product.is_available || isStoreClosed`. Neither checks `stock_quantity === 0`. A product with `is_available: true` but `stock_quantity: 0` displays a fully enabled "Add" button. When tapped, `useCart.addItem` eventually catches it (line 309-311) after querying the DB, showing a delayed "This item is out of stock" toast — but the card gives zero visual indication.

**Where**: `ProductListingCard.tsx` line 80, line 196. `ProductCard.tsx` line 46, line 98/136.

**Why critical**: Buyer taps "Add", waits for a network round-trip, gets a toast error. This creates a "bait and switch" feeling. At scale, products frequently hit 0 stock before the seller marks them unavailable. Every such interaction erodes trust.

**Impact analysis**:
- `ProductListingCard.tsx` — add `stock_quantity === 0` to `isOutOfStock` check
- `ProductCard.tsx` — add `stockLimit <= 0` to `isDisabled` check
- `ProductDetailSheet.tsx` — verify stock check on the detail sheet's Add button

**Risks**:
1. Products with `stock_quantity: null` (unlimited stock) must NOT be treated as out-of-stock — guard with `!= null && === 0` check.
2. The "low stock" badge logic at line 87 already guards `> 0`, so no conflict.

**Fix plan**:
- `ProductListingCard.tsx` line 80: `const isOutOfStock = !product.is_available || (product.stock_quantity != null && product.stock_quantity <= 0);`
- `ProductCard.tsx` line 46: `const isDisabled = !product.is_available || isStoreClosed || stockLimit <= 0;`
- `ProductCard.tsx`: Add visual "Out of Stock" overlay when `stockLimit <= 0` (same as existing `!product.is_available` overlay)

---

## Bug 2: Self-Pickup Orders Get Empty Delivery Address

**What**: `useCartPage.ts` line 312-314 constructs the delivery address text. For self-pickup, it falls back to `[profile.block, profile.flat_number].filter(Boolean).join(', ')`. Marketplace users without a society (null block/flat) get an empty string `''` saved as `delivery_address`. The seller sees a blank address in their order detail.

**Where**: `useCartPage.ts` line 312-314, used in `createOrdersForAllSellers`.

**Why critical**: Seller sees an order with a blank delivery address. For self-pickup, the address is used as a pickup reference (where the buyer is from). Empty address makes the seller question the order's legitimacy.

**Impact analysis**:
- `useCartPage.ts` — fix fallback address construction
- `OrderDetailPage.tsx` — verify it handles empty delivery_address gracefully (already conditional on sellerProfile fields, but the order's own `delivery_address` field may render blank)

**Risks**:
1. Changing the address format could affect existing orders' display — mitigate by only modifying future order creation, not rendering.
2. For self_pickup, the address is reference-only (not for navigation) — a fallback like the user's profile name is sufficient.

**Fix plan**: In `useCartPage.ts` line 314, add a fallback:
```typescript
const deliveryAddressText = fulfillmentType === 'delivery' && selectedDeliveryAddress
  ? [selectedDeliveryAddress.flat_number && `Flat ${selectedDeliveryAddress.flat_number}`, selectedDeliveryAddress.block && `Block ${selectedDeliveryAddress.block}`, selectedDeliveryAddress.building_name, selectedDeliveryAddress.landmark].filter(Boolean).join(', ')
  : [profile.block && `Block ${profile.block}`, profile.flat_number].filter(Boolean).join(', ') || profile.name || 'Self Pickup';
```

---

## Bug 3: Coupon Discount Shown on Confirm Dialog Even When Cart Changed

**What**: `CartPage.tsx` line 434 shows the confirm dialog with `c.finalAmount`. The `effectiveCouponDiscount` recalculates dynamically (line 190-199 in useCartPage), but there is no re-validation that the coupon is still valid at confirmation time. The `min_order_amount` auto-removal effect (line 182-188) only triggers on `totalAmount` change, but if the buyer modifies quantities *after* opening the confirm dialog (via the cart stepper), the dialog shows a stale total.

After deeper analysis: the confirm dialog reads `c.finalAmount` which recalculates each render, so the amount is correct. However, the available coupons list (`CouponInput`) fetches on mount and doesn't refetch when `totalAmount` changes — meaning a coupon that was ineligible at first load (below min_order_amount) stays ineligible in the UI even after the buyer adds more items. The `canApplyCoupon` check at line 91 uses the `totalAmount` prop correctly, but `availableCoupons` is fetched once on mount (line 53-78) and `userRedemptions` is also static.

**Revised finding**: Actually, `canApplyCoupon` rechecks dynamically against `totalAmount` prop. The available coupons list fetch only runs once per seller. If a coupon was added between page load and checkout (seller adds new coupon), it won't appear. This is low-severity.

Let me re-examine for a stronger bug.

**Revised Bug 3: ProductDetailSheet Allows Add When Stock is 0**

**What**: `useProductDetail.ts` line 73 sets `stockLimit = canonicalStockQty ?? 99`. Line 74: `canIncrement = quantity < stockLimit`. But the initial "Add" action (line 78-94 `handleAdd`) never checks if `stockLimit <= 0`. It calls `addItem` unconditionally for cart-type products. The useCart `addItem` catches it after a DB query, but the detail sheet shows a fully enabled action button even when canonical stock is 0.

**Where**: `useProductDetail.ts` line 78 (`handleAdd`), `ProductDetailSheet.tsx` action button.

**Why critical**: The detail sheet is the highest-intent surface — buyer has explicitly opened the product. Allowing them to tap "Add to Cart" on a zero-stock item, only to get a delayed error toast, is the worst UX at the highest-intent moment.

**Impact analysis**:
- `useProductDetail.ts` — add stock guard to `handleAdd`
- `ProductDetailSheet.tsx` — show "Out of Stock" state when `stockLimit <= 0` and `canonicalStockQty !== null`

**Risks**:
1. `canonicalStockQty` is null until the async fetch completes — guard must only apply when `canonicalStockQty !== null && canonicalStockQty <= 0`.
2. The action button is shared across action types — only apply stock guard for `isCartAction` products.

**Fix plan**:
- `useProductDetail.ts` line 78: Add early return: `if (isCartAction && canonicalStockQty != null && canonicalStockQty <= 0) { toast.error('This item is out of stock'); return; }`
- Export a `isStockEmpty` flag: `const isStockEmpty = canonicalStockQty != null && canonicalStockQty <= 0`
- `ProductDetailSheet.tsx`: Disable add button and show "Out of Stock" when `d.isStockEmpty`

---

## Bug 4: Realtime Order Updates Not Scoped to Buyer's Order

**What**: `OrderDetailPage.tsx` has a realtime subscription for order updates. Looking at `useOrderDetail.ts`:

Let me verify this properly.

Actually, looking more carefully at the code, let me check a different area. Let me look at what happens after a successful order with COD — the cart is cleared asynchronously:

**Revised Bug 4: COD Order Success Navigates Before Cart Clear — Back Button Shows Stale Cart**

**What**: `useCartPage.ts` line 526-531 — on COD success, the code navigates to the order page FIRST, then clears the cart in the background (`clearCartAndCache().catch(() => {})`). If the buyer taps the back button quickly, they return to the cart page and see the same items (cache not yet cleared). Tapping "Place Order" again would create a duplicate order, but the idempotency key was already reset (line 360 — `if (!result.deduplicated) idempotencyKeyRef.current = null`).

**Where**: `useCartPage.ts` line 526-531 (COD flow), line 360 (idempotency reset).

**Why critical**: A buyer who navigates back to cart within ~1 second sees the same items and total. If they instinctively tap "Place Order" again (muscle memory), a second order is created. The idempotency key was reset, so the RPC treats it as a new order.

**Impact analysis**:
- `useCartPage.ts` — ensure cart is cleared BEFORE navigation for COD
- Idempotency key reset timing — should only reset after cart clear succeeds

**Risks**:
1. Clearing cart before navigation adds latency to the success moment (~200ms for DB delete + cache clear) — mitigate by clearing cache optimistically (set to []) before the DB call.
2. If cart clear fails, user could be stuck with items in cart and no clear feedback — already handled by `clearCartAndCache` which sets cache to empty arrays.

**Fix plan**: In `useCartPage.ts` COD flow (line 519-533):
```typescript
// Clear cart BEFORE navigation to prevent back-button duplicate
queryClient.setQueryData(['cart-items', user.id], []);
queryClient.setQueryData(['cart-count', user.id], 0);
navigate(orderIds.length === 1 ? `/orders/${orderIds[0]}` : '/orders');
clearCartAndCache().catch(() => {}); // DB cleanup in background
```
This optimistically empties the cache so back-button shows empty cart instantly.

---

## Bug 5: Delivery Address Card Shows Profile Fallback Instead of Order's Saved Address

**What**: On `OrderDetailPage.tsx` lines 694-700, the address section shows `sellerProfile?.block` / `buyer?.block`. But orders have their own `delivery_address` text field (set at checkout). For delivery orders, the page should show the order's delivery address (which may be a separate saved address, not the buyer's profile block/flat). Currently, the page shows the buyer's profile address, which may differ from where the order is actually being delivered.

**Where**: `OrderDetailPage.tsx` line 688-700 — Seller/Buyer info card.

**Why critical**: If a buyer has a saved delivery address (different building, friend's place), the order detail page shows their profile block/flat instead of the actual delivery destination. The seller sees the wrong address. For delivery orders, this is a delivery-to-wrong-location risk.

**Impact analysis**:
- `OrderDetailPage.tsx` — add delivery address display from `order.delivery_address`
- The info card currently shows profile block/flat; for delivery orders, it should show the order's delivery address

**Risks**:
1. `order.delivery_address` is a concatenated text string, not structured data — it may look less clean than the block/flat format. Acceptable as it's what the buyer confirmed at checkout.
2. Self-pickup orders shouldn't show delivery address prominently — gate on `fulfillment_type`.

**Fix plan**: In `OrderDetailPage.tsx` around line 688-700, add a delivery address section for delivery orders:
```tsx
{/* Delivery Address — only for delivery orders, from the order itself */}
{isDeliveryOrder && (order as any).delivery_address && (
  <div className="mt-2 pt-2 border-t border-border">
    <p className="text-xs text-muted-foreground flex items-center gap-1">
      <MapPin size={11} /> Delivering to: {(order as any).delivery_address}
    </p>
  </div>
)}
```
This renders inside the existing info card, below the seller/buyer name.

---

## Summary

| # | Bug | File(s) | Severity | Effort |
|---|-----|---------|----------|--------|
| 1 | Zero-stock products show active "Add" button | ProductListingCard.tsx, ProductCard.tsx | High — false positive | ~15 min |
| 2 | Self-pickup orders get blank delivery address | useCartPage.ts | Medium — seller confusion | ~5 min |
| 3 | ProductDetailSheet allows add on zero-stock | useProductDetail.ts, ProductDetailSheet.tsx | High — highest-intent surface | ~10 min |
| 4 | COD back-button exposes duplicate order risk | useCartPage.ts | High — financial | ~10 min |
| 5 | Order detail shows profile address, not delivery address | OrderDetailPage.tsx | Medium — wrong delivery risk | ~10 min |

All fixes are surgical — no new features, no schema changes, no refactoring.

