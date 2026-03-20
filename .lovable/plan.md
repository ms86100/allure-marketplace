

# Root Cause: Missing `food_beverages/seller_delivery` Flow Data in DB

## Evidence Chain

1. **Order data**: Order `96b8e227` has `fulfillment_type='delivery'`, `delivery_handled_by=null`, seller `primary_group='food_beverages'`
2. **Transaction type resolution**: `resolveTransactionType('food_beverages', 'purchase', 'delivery', null)` → `'seller_delivery'`
3. **DB query**: `category_status_flows WHERE parent_group='food_beverages' AND transaction_type='seller_delivery'` → **EMPTY** (confirmed in network logs)
4. **DB query**: `category_status_transitions WHERE parent_group='food_beverages' AND transaction_type='seller_delivery'` → **EMPTY** (confirmed in network logs)
5. **Fallback**: Code falls back to `default/seller_delivery` which exists (10 flow rows, 18 transitions) — but this introduces async latency and a window where `flow=[]` and `transitions=[]`

## Why Previous Fixes Failed

The `isSellerView` fix was correct but insufficient. The real blocker is that during the async fallback window:
- `flow.length === 0` → `getNextStatus()` returns `null` → no Accept button renders
- `transitions.length === 0` → `canSellerReject` is `false` → no Reject button renders
- The action bar container renders (it only checks `isSellerView && !isTerminalStatus`) but is **completely empty** — no buttons inside

The fallback should eventually load data and trigger a re-render with buttons, but the `useCategoryStatusFlow` hook does NOT reset `isLoading` to `true` when deps change, and the page does NOT gate the action bar on `isFlowLoading`. This creates a persistent empty-bar state if the fallback is slow or fails silently.

## Fix (3 parts)

### Part 1: Insert missing `food_beverages/seller_delivery` data (SQL migration)
Copy the `default/seller_delivery` flow and transitions into `food_beverages/seller_delivery`. This eliminates the fallback entirely — the primary query returns data immediately.

### Part 2: Gate the action bar on flow loading (`OrderDetailPage.tsx`)
Change line 498 from:
```
{o.isSellerView && !isTerminalStatus(o.flow, order.status) && (
```
to:
```
{o.isSellerView && !o.isFlowLoading && o.flow.length > 0 && !isTerminalStatus(o.flow, order.status) && (
```
And show a loading indicator when `isFlowLoading` is true:
```
{o.isSellerView && (o.isFlowLoading || o.flow.length === 0) && !isTerminalStatus(o.flow, order.status) && (
  <div>Loading actions...</div>
)}
```

### Part 3: Reset loading state on dep change (`useCategoryStatusFlow.ts`)
At the top of the useEffect, add `setIsLoading(true)` so downstream consumers know data is stale and don't render empty bars.

## Files to Change
- New SQL migration (insert `food_beverages/seller_delivery` rows)
- `src/hooks/useCategoryStatusFlow.ts` — reset `isLoading` on dep change
- `src/pages/OrderDetailPage.tsx` — gate action bar on `isFlowLoading` and `flow.length > 0`

## Expected Result
- Seller clicks "View Order" → navigates to order detail
- Flow loads immediately (no fallback needed)
- Action bar shows "Reject" and "Mark Accepted" buttons
- Seller can accept and progress the order

