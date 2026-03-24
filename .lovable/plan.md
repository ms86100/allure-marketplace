
# Generic OTP — Admin Can Gate Any Workflow Step

## What Changed

### DB Migration
- **New table**: `order_otp_codes` — stores generic OTP codes per (order, target_status) with UNIQUE constraint, 30-min expiry
- **New RPC**: `generate_generic_otp` — generates/regenerates 4-digit code, returns plaintext
- **New RPC**: `verify_generic_otp_and_advance` — verifies code, sets `app.otp_verified`, advances order atomically
- **Unified trigger**: `enforce_delivery_otp_gate` → `enforce_otp_gate` — checks `otp_type` from `category_status_flows`:
  - `delivery` → existing delivery assignment check
  - `generic` → checks `order_otp_codes` for verified entry
  - `null` → pass through

### Frontend
- **`GenericOtpDialog.tsx`** — 4-digit code entry dialog, calls `verify_generic_otp_and_advance`
- **`GenericOtpCard.tsx`** — shows generated code to the non-advancing party with copy + regenerate
- **`OrderDetailPage.tsx`** — routes `otp_type='generic'` to new dialog for both seller and buyer action bars; shows code card to the party who shares the code
- **`AdminWorkflowManager.tsx`** — added 🔑 Generic OTP to dropdown, updated tooltip

## OTP Type Behavior Matrix

| otp_type | Requires delivery? | Works at any step? | Who enters code? |
|---|---|---|---|
| `delivery` | Yes | Only post-tracking | Seller/rider enters buyer's delivery code |
| `generic` | No | Yes | The advancing actor enters the other party's code |
| `null` | N/A | N/A | No OTP gate |

## Guardrails
1. UNIQUE(order_id, target_status) — one code per step
2. 30-min expiry, rejected if expired, regeneration allowed
3. `verified = true` blocks reuse
4. DB trigger enforces both types — frontend cannot bypass
5. Delivery OTP logic unchanged — isolated branch in trigger
