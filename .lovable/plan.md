

# Fix: Service Order Lifecycle — Add Buyer Action Bar + Remove Remaining Hardcoded Statuses

## Root Cause

The order flow is correctly configured in the DB:
`enquired → quoted → accepted → preparing → ready → completed`

The transition `quoted → accepted` has `allowed_actor: buyer`. But the **OrderDetailPage only has a Seller Action Bar** — there is no Buyer Action Bar. So when it's the buyer's turn to act (accept quote), the UI shows nothing and the order is stuck.

## Changes

### 1. Add Buyer Action Bar (OrderDetailPage.tsx)

Add a new section below the Seller Action Bar that renders when:
- `!isSellerView` (buyer view)
- Order is not terminal
- There exists a valid next transition for `actor: 'buyer'`

Compute `buyerNextStatus` using `getNextStatusForActor(flow, order.status, 'buyer', transitions)` in useOrderDetail.

The bar shows a primary action button (e.g., "Accept Quote", "Confirm") with the label derived from the flow step's `display_label`. Also show a cancel button if `canBuyerCancel` is true.

### 2. Add `buyerNextStatus` to useOrderDetail.ts

Add a computed value:
```
const buyerNextStatus = getNextStatusForActor(flow, order.status, 'buyer', transitions);
```
Export it alongside `nextStatus` (which is seller-focused).

### 3. Remove remaining hardcoded status strings in OrderDetailPage.tsx

**Line 175**: `['delivered', 'completed'].includes(order.status)` for celebration banner
→ Replace with `isSuccessfulTerminal(o.flow, order.status)` (already available)

**Line 205**: `!['delivered', 'completed', 'cancelled'].includes(order.status)` for needs-attention banner  
→ Replace with `!isTerminalStatus(o.flow, order.status)` (terminal orders don't need attention)

**Line 222**: `order.status === 'cancelled'` for rejection reason display  
→ Replace with checking `is_terminal && !is_success` from flow, or check `order.rejection_reason` existence directly (if rejection_reason is set, show it regardless of status name)

### 4. Fix `seller.primary_group` NULL issue

The stuck order has `primary_group: null` on the seller. The fallback derivation (lines 55-64 in useOrderDetail) fetches parent_group from `category_config` via the order's product. This works but is async. Verify it resolves to the correct group for this order's category. If the seller simply has no `primary_group` set, the system correctly falls back to `'default'` which has the full `request_service` flow.

No code change needed here — the `default` flow already has the complete lifecycle. The buyer action bar is the missing piece.

## Files to Modify

1. **`src/hooks/useOrderDetail.ts`** — Add `buyerNextStatus` computed from transitions with actor='buyer'
2. **`src/pages/OrderDetailPage.tsx`** — Add Buyer Action Bar, replace 3 hardcoded status checks with flow helpers

## Implementation Detail

**Buyer Action Bar** (new section in OrderDetailPage.tsx after seller action bar):
```tsx
{o.isBuyerView && !isTerminalStatus(o.flow, order.status) && o.buyerNextStatus && (
  <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
    <div className="px-4 py-3 flex gap-3">
      {o.canBuyerCancel && (
        <Button variant="outline" className="flex-1 border-destructive ...">Cancel</Button>
      )}
      <Button className="flex-1 bg-accent ..." onClick={() => o.updateOrderStatus(o.buyerNextStatus!)}>
        {o.getFlowStepLabel(o.buyerNextStatus).label}
      </Button>
    </div>
  </div>
)}
```

This is fully DB-driven — if the admin removes the buyer acceptance step, the bar won't render. If they add new buyer-actionable steps, the bar will automatically show.

