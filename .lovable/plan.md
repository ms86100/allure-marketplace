

## Fix: Fulfillment Type Defaulting to Self-Pickup

### Root Cause

The order `ff0d3449` (and all 3 orders placed today) have `fulfillment_type: self_pickup`, even though the seller "Fresh Mart Express" has `fulfillment_mode: pickup_and_seller_delivery`. All previous orders from this seller were `delivery`.

The code at `useCartPage.ts:80` initializes `fulfillmentType` to `'self_pickup'`:
```js
const [fulfillmentType, setFulfillmentType] = useState<'self_pickup' | 'delivery'>('self_pickup');
```

A `useEffect` at line 158 is supposed to auto-switch to `'delivery'` for `pickup_and_*` sellers. However, this effect depends on `[sellerGroups.length, firstSeller]` where `firstSeller` is an object reference. Due to react-query structural sharing, if cart data is cached from a previous visit, `firstSeller` may be the exact same reference across re-renders — meaning the effect may not re-trigger on subsequent CartPage visits after the initial one. Additionally, the `self_pickup` initial state is visible for one render frame before the effect fires, creating a window where the user sees and can interact with a stale default.

**The confirm dialog DOES show "Pickup from" vs "Deliver to"**, but users may not notice the subtle text difference before tapping "Confirm Order."

### Fix Plan

**File 1: `src/hooks/useCartPage.ts`** — Make default fulfillment robust

1. Replace the `useEffect`-based default with a `useRef` guard + immediate initialization pattern:
   - Add `hasSetDefaultFulfillment` ref
   - When `sellerGroups` first populates, compute the correct default ONCE and set it
   - Prevent the effect from continuously overriding user's manual selection (current effect runs on every `firstSeller` reference change, potentially resetting a user's deliberate choice)

2. Change the `useState` initializer: keep `'self_pickup'` as safe default but add the ref guard so the effect only fires ONCE per cart session

**File 2: `src/components/delivery/FulfillmentSelector.tsx`** — Make current selection unmistakable

1. Add a colored pill/badge showing the active mode: "📦 Self Pickup" or "🚚 Delivery" above the selector
2. When mode is `pickup_and_*` and delivery is available, add subtle "Recommended" label on the Delivery option

**File 3: `src/pages/CartPage.tsx`** — Reinforce fulfillment in confirm dialog

1. Add a prominent fulfillment type badge in the confirmation dialog (colored, not just text) so the user clearly sees whether they're choosing pickup or delivery before confirming

### Files Changed
| File | Change |
|---|---|
| `src/hooks/useCartPage.ts` | Use ref guard for one-time default, prevent re-override of user selection |
| `src/components/delivery/FulfillmentSelector.tsx` | Add "Recommended" hint on delivery for dual-mode sellers |
| `src/pages/CartPage.tsx` | Add prominent fulfillment badge in confirm dialog |

