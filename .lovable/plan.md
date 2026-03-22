

## Bug Fix: Buyers Can't Read Payment Gateway Mode (RLS Block)

### Root Cause
The `admin_settings` table has a single RLS policy: `"Only admins can manage settings"` (ALL operations, admin-only). When a buyer's `usePaymentMode` hook queries this table, RLS blocks it silently. The hook defaults to `'upi_deep_link'`, so buyers always see "UPI Payment" even when Razorpay is enabled.

### Fix
Add a **read-only SELECT policy** on `admin_settings` for authenticated users, scoped to non-secret keys that the frontend needs to read (like `payment_gateway_mode`). Secret keys (API keys, credentials) must remain admin-only.

**Database migration:**
```sql
CREATE POLICY "Authenticated users can read non-secret settings"
ON public.admin_settings
FOR SELECT
TO authenticated
USING (
  key IN ('payment_gateway_mode')
);
```

This keeps secret credentials (razorpay_key_id, razorpay_key_secret, etc.) hidden from non-admins while allowing buyers to read the payment mode toggle.

### Files Changed

| File | Change |
|---|---|
| Database migration | Add SELECT policy for authenticated users on `admin_settings` for specific non-secret keys |

No code changes needed — `usePaymentMode` already handles the query correctly; it just couldn't read the data.

