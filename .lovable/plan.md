

# Loyalty Points — Gap Analysis & Implementation Plan

## Current Situation (As-Is)

**Backend (fully working):**
- `loyalty_points` table exists with RLS, earning triggers, and RPCs
- Trigger `trg_earn_loyalty_on_delivery` awards 1 point per ₹10 when order status changes to `delivered`/`completed`
- Trigger `trg_earn_loyalty_on_review` awards 10 bonus points when a review is created
- `redeem_loyalty_points(_points, _order_id)` RPC exists — deducts points and returns discount
- `get_loyalty_balance()` and `get_loyalty_history()` RPCs work
- DB has 10 earned transactions for 1 user, 0 redemptions

**Frontend (display only — no redemption):**
- `LoyaltyCard` component on the Orders page shows balance and transaction history
- Card says "= ₹{balance} off" — implying points can be used as discount
- **No code anywhere in the checkout/cart flow calls `redeem_loyalty_points`**
- The `CartPage` and `useCartPage` have zero references to loyalty, redeem, or points

## To-Be Situation

1. During checkout, the buyer should see their available loyalty balance and have the option to **apply points as a discount** (1 point = ₹1)
2. Applied points should reduce the payable amount
3. After order placement, the `redeem_loyalty_points` RPC should be called to deduct the used points
4. The loyalty card should reflect the updated balance after redemption

## Gap

| Area | Status |
|------|--------|
| Earning points on order delivery | Working (trigger) |
| Earning points on review | Working (trigger) |
| Viewing balance & history | Working (UI) |
| **Applying points at checkout** | **Missing entirely** |
| **Deducting points after order** | **Missing entirely** |

## Implementation Plan

### Step 1: Create a `useLoyaltyRedeem` hook
- New file `src/hooks/useLoyaltyRedeem.ts`
- Exposes: `balance` (from `useLoyaltyBalance`), `applyPoints(amount)`, `redeemPoints(points, orderId)` mutation calling `redeem_loyalty_points` RPC
- Invalidates `loyalty-balance` and `loyalty-history` query keys on success

### Step 2: Add loyalty redemption UI to CartPage
- In the cart's order summary section (above the total), add a collapsible "Use Loyalty Points" row
- Shows available balance, a toggle or slider to apply points (capped at order total and available balance)
- Displays the discount amount when applied
- Wire into `useCartPage` state so the discount is reflected in the final total

### Step 3: Integrate redemption into order submission
- After the order is successfully placed (order ID available), call `redeemPoints(appliedPoints, orderId)`
- If redemption fails, show a toast but don't block the order (points can be reconciled later)
- The applied discount should be stored on the order (either as a note or in existing discount fields)

### Step 4: Adjust the payable amount
- Subtract loyalty discount from the amount sent to payment gateway (Razorpay/UPI)
- If loyalty fully covers the order, skip payment and mark as paid

### Technical Details
- Files to create: `src/hooks/useLoyaltyRedeem.ts`
- Files to modify: `src/pages/CartPage.tsx`, `src/hooks/useCartPage.ts` (add loyalty state), order summary section
- No database changes needed — the `redeem_loyalty_points` RPC already exists and works
- Need to inspect `useCartPage.ts` during implementation to find the exact order submission flow and total calculation

