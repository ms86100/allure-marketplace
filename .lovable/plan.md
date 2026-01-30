
# Real UPI Payment Integration Plan

## Current State Analysis

Your app currently uses **UPI Intent-based payments** which:

| Aspect | Current Behavior |
|--------|------------------|
| Payment Flow | Opens UPI app via `upi://pay?pa=...` URL |
| Verification | Manual confirmation (`window.confirm`) |
| Money Flow | Directly to seller's UPI ID |
| Status Tracking | None - relies on user honesty |
| Refunds | Not possible |
| Platform Fee | Cannot be collected |

**Problem**: There's no way to verify if payment actually happened. A buyer could click "Yes, I paid" without paying.

---

## Options for Real UPI Payments

### Option 1: Razorpay Route (Recommended for Marketplaces)

**How it works**:
- Buyer pays to Razorpay's payment page
- Razorpay splits payment automatically: Seller gets X%, Platform gets Y%
- Webhook confirms payment status
- Automatic settlement to seller's bank account

| Feature | Details |
|---------|---------|
| Setup | Business account required, KYC |
| Pricing | 2% per transaction + GST |
| Settlement | T+2 days (can be T+1 with premium) |
| Refunds | Fully supported |
| UPI Methods | GPay, PhonePe, Paytm, all UPI apps |

**Requirements**:
- Razorpay business account
- Each seller needs to be onboarded as "linked account"
- API Keys (Key ID and Key Secret)

---

### Option 2: Cashfree Payouts

Similar to Razorpay Route but with different pricing and features.

| Feature | Details |
|---------|---------|
| Setup | Business account required |
| Pricing | 1.9% per transaction + GST |
| Settlement | T+1 days |
| Seller Onboarding | Via API |

---

### Option 3: Enhanced UPI Intent with Verification (Hybrid)

**How it works**:
- Keep current UPI intent flow (buyer pays directly to seller)
- After payment, buyer enters UTR/Transaction Reference Number
- System verifies via SMS parsing or manual seller confirmation
- No platform fee collection possible

| Feature | Details |
|---------|---------|
| Setup | Minimal - just UI changes |
| Pricing | Free (no gateway fees) |
| Settlement | Instant (P2P) |
| Verification | Semi-manual (seller confirms receipt) |
| Refunds | Manual between buyer/seller |

---

## Recommended Approach: Razorpay Route

For a marketplace where you want:
- Real payment verification
- Platform fee collection (optional)
- Refund capability
- Seller payouts management

### Implementation Architecture

```text
Buyer → Razorpay Checkout → Payment Captured → Webhook → Update Order
                                    ↓
                            Split Payment
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
              Seller Account                  Platform Account
              (via Route)                     (if fee enabled)
```

---

## Implementation Steps

### Phase 1: Razorpay Setup (Manual by Admin)

1. **Create Razorpay Business Account**
   - Go to https://razorpay.com
   - Complete business KYC
   - Enable "Route" feature (requires approval)

2. **Generate API Keys**
   - Dashboard → Settings → API Keys
   - Copy Key ID and Key Secret

3. **Store Keys as Secrets**
   - RAZORPAY_KEY_ID
   - RAZORPAY_KEY_SECRET

### Phase 2: Seller Onboarding Flow

| Step | Description |
|------|-------------|
| 1 | When seller registers, collect bank account details |
| 2 | Create "Linked Account" in Razorpay via API |
| 3 | Store `razorpay_account_id` in `seller_profiles` table |
| 4 | Razorpay handles seller KYC and verification |

**Database Change**:
```sql
ALTER TABLE seller_profiles
ADD COLUMN razorpay_account_id text,
ADD COLUMN razorpay_onboarding_status text DEFAULT 'pending';
```

### Phase 3: Payment Edge Function

Create `supabase/functions/create-razorpay-order/index.ts`:

```typescript
// 1. Create Razorpay Order
// 2. Include transfer details for Route (seller's account)
// 3. Return order_id for frontend checkout
```

Create `supabase/functions/razorpay-webhook/index.ts`:

```typescript
// 1. Verify webhook signature
// 2. Handle payment.captured event
// 3. Update order status to 'paid'
// 4. Handle payment.failed event
```

### Phase 4: Frontend Integration

| Component | Changes |
|-----------|---------|
| `CartPage.tsx` | Load Razorpay checkout script |
| `UpiPaymentSheet.tsx` | Replace with Razorpay Checkout modal |
| New: `useRazorpay.ts` | Hook to handle Razorpay initialization |

**Payment Flow**:
1. User clicks "Pay with UPI"
2. Frontend calls `create-razorpay-order` edge function
3. Edge function returns `order_id`
4. Frontend opens Razorpay Checkout (user sees GPay/PhonePe options)
5. User completes payment in UPI app
6. Razorpay sends webhook to `razorpay-webhook` function
7. Webhook updates order status
8. Frontend polls or uses realtime to show success

### Phase 5: Seller Settings Update

| Field | Description |
|-------|-------------|
| Bank Account Number | Required for payouts |
| IFSC Code | Required for payouts |
| Account Holder Name | Must match bank records |
| Razorpay Onboarding | Auto-triggered on save |

---

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `supabase/functions/create-razorpay-order/index.ts` | Create order with Route transfer |
| `supabase/functions/razorpay-webhook/index.ts` | Handle payment confirmations |
| `src/hooks/useRazorpay.ts` | Frontend SDK integration |
| `src/components/payment/RazorpayCheckout.tsx` | Checkout component |
| `src/pages/CartPage.tsx` | Update payment flow |
| `src/pages/SellerSettingsPage.tsx` | Add bank details form |
| DB Migration | Add `razorpay_account_id` to sellers |

---

## Alternative: Quick Verification Without Gateway

If you want to keep direct P2P payments without a payment gateway:

| Step | Implementation |
|------|----------------|
| 1 | Buyer pays via UPI intent (current flow) |
| 2 | Buyer enters UTR number after payment |
| 3 | Seller sees UTR in order details |
| 4 | Seller confirms payment received |
| 5 | Order status updates to "paid" |

**Pros**: No gateway fees, instant settlement
**Cons**: No automated verification, relies on seller honesty

---

## Cost Comparison

| Method | Transaction Fee | Settlement | Verification |
|--------|-----------------|------------|--------------|
| Current (P2P) | Free | Instant | None |
| Razorpay Route | 2% + GST | T+2 days | Automatic |
| Cashfree | 1.9% + GST | T+1 day | Automatic |
| P2P + UTR | Free | Instant | Manual |

---

## Secrets Required

For Razorpay integration:
- `RAZORPAY_KEY_ID` - Public key for frontend
- `RAZORPAY_KEY_SECRET` - Secret for backend webhook verification

---

## Technical Summary

### Edge Functions to Create

1. **create-razorpay-order**
   - Input: order details, seller's razorpay account id
   - Output: razorpay order_id
   - Creates order with Route transfer configuration

2. **razorpay-webhook**
   - Handles: payment.captured, payment.failed, refund.created
   - Verifies: Webhook signature
   - Updates: Order payment_status in database

### Frontend Components

1. **RazorpayCheckout.tsx**
   - Loads Razorpay script dynamically
   - Opens checkout modal with UPI options
   - Handles success/failure callbacks

2. **useRazorpay.ts**
   - Manages Razorpay instance
   - Provides createOrder, openCheckout functions

### Database Updates

```sql
-- Track Razorpay linked accounts for sellers
ALTER TABLE seller_profiles
ADD COLUMN razorpay_account_id text,
ADD COLUMN bank_account_number text,
ADD COLUMN bank_ifsc_code text,
ADD COLUMN bank_account_holder text,
ADD COLUMN razorpay_onboarding_status text DEFAULT 'pending';

-- Track gateway order IDs
ALTER TABLE orders
ADD COLUMN razorpay_order_id text,
ADD COLUMN razorpay_payment_id text;
```
