

# Implement Generic OTP — Admin Can Gate Any Step

## Summary

Add `otp_type = 'generic'` alongside existing `'delivery'`. Generic OTP works at any step without requiring a delivery assignment. A new `order_otp_codes` table stores codes, new RPCs handle generation and verification, and the DB trigger enforces both types.

## Technical Details

### 1. Database Migration

**New table: `order_otp_codes`**
- Columns: `id`, `order_id` (FK orders), `target_status` (text), `otp_code` (text), `otp_hash` (text), `verified` (boolean default false), `created_at`, `expires_at` (default now + 30 min)
- Unique constraint: `(order_id, target_status)` — prevents duplicate codes
- RLS: authenticated users can read/insert their own order codes

**New RPC: `generate_generic_otp(_order_id uuid, _target_status text)`**
- Generates a random 4-digit code
- Inserts into `order_otp_codes` with `ON CONFLICT (order_id, target_status) DO UPDATE` (regeneration)
- Returns the plaintext code to caller
- Only callable by buyer/seller of that order

**New RPC: `verify_generic_otp_and_advance(_order_id uuid, _otp_code text, _target_status text)`**
- Verifies code matches, not expired, not already verified
- Sets `app.otp_verified = 'true'` session var
- Advances order status atomically (like `verify_delivery_otp_and_complete`)
- Marks code as `verified = true`

**Update trigger: `enforce_delivery_otp_gate` → `enforce_otp_gate`**
- Current: only checks `status = 'delivered'`
- New: for ANY status transition, look up `otp_type` from `category_status_flows` for `NEW.status`
  - If `otp_type = 'delivery'` → existing delivery code check
  - If `otp_type = 'generic'` → check `order_otp_codes` for verified entry
  - If `null` → pass through
- Keeps backward compat: still checks `app.otp_verified` session var

### 2. New Component: `GenericOtpDialog.tsx`

- Mirrors `DeliveryCompletionOtpDialog` structure
- 4-digit input, calls `verify_generic_otp_and_advance` RPC
- Props: `orderId`, `targetStatus`, `open`, `onOpenChange`, `onVerified`

### 3. New Component: `GenericOtpCard.tsx`

- Shows the OTP code to the party who needs to SHARE it
- Calls `generate_generic_otp` RPC on mount (generates code if not yet created)
- Shows: "Share this code: **4829**" with copy button
- Displayed when the current step's NEXT step has `otp_type = 'generic'`
- Visible to the actor who is NOT advancing (e.g., buyer sees code, seller enters it)

### 4. Update `OrderDetailPage.tsx`

**Seller action bar (line 644):**
```
const nextOtpType = getStepOtpType(o.flow, o.nextStatus);
const needsDeliveryOtp = (nextOtpType === 'delivery' && deliveryAssignmentId) || (hasDeliveryOtpGate && sellerNextIsTerminal);
const needsGenericOtp = nextOtpType === 'generic';
```
- `needsDeliveryOtp` → existing `DeliveryCompletionOtpDialog`
- `needsGenericOtp` → new `GenericOtpDialog`
- else → normal advance button

**Buyer action bar (line 668):** Same pattern.

**OTP code display:** When current status's NEXT step has `otp_type = 'generic'`, show `GenericOtpCard` to the non-advancing actor (buyer sees code if seller advances, seller sees code if buyer advances).

### 5. Update `AdminWorkflowManager.tsx`

**OTP Type dropdown (line 652-655):**
Add `'generic'` option:
```
<SelectItem value="none">None</SelectItem>
<SelectItem value="delivery">🔐 Delivery OTP</SelectItem>
<SelectItem value="generic">🔑 Generic OTP</SelectItem>
```

**Remove pre-tracking restriction for generic:** The existing warning about "delivery OTP before tracking" only applies to `otp_type = 'delivery'`. Generic OTP has no such restriction — it works anywhere.

### 6. Update `workflow/types.ts`

Already has `otp_type: string | null` — no change needed.

### 7. Update `WorkflowEngineDocs.tsx`

Add section explaining the two OTP types and when to use each.

## Files

| File | Change |
|---|---|
| DB migration | `order_otp_codes` table, 2 RPCs, updated trigger |
| `src/components/order/GenericOtpDialog.tsx` | New — code verification dialog |
| `src/components/order/GenericOtpCard.tsx` | New — code display for sharer |
| `src/pages/OrderDetailPage.tsx` | Route generic OTP to new dialog + show code card |
| `src/components/admin/AdminWorkflowManager.tsx` | Add 'generic' to dropdown |
| `src/components/docs/WorkflowEngineDocs.tsx` | Document both OTP types |

## Guardrails (per user feedback)

1. **One code per (order, target_status)** — UNIQUE constraint, upsert on regeneration
2. **Expiry** — 30 min default, rejected if expired, regeneration allowed
3. **Who sees vs enters** — determined by step `actor` field: the actor advancing enters the code, the other party sees it
4. **No reuse** — `verified = true` blocks re-verification
5. **Trigger isolation** — delivery logic untouched, generic logic is a separate branch in the same trigger

