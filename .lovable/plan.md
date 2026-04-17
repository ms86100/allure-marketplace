

## Root Cause

Razorpay returned **404 "The requested URL was not found on the server"** for `https://api.razorpay.com/v1/payments/validate/vpa`. 

This endpoint is **not available on standard Razorpay Payment Gateway accounts**. It's part of the **RazorpayX Fund Account Validation (FAV)** product, which must be separately activated and lives under a different API path (`/v1/fund_accounts/validations`). Your current Razorpay key is a standard PG key → 404 is expected and permanent for this URL.

The edge function itself is healthy. The endpoint we picked is wrong for the account type.

## Fix — Two-tier strategy (bulletproof, no external dependencies)

### Tier 1: Try RazorpayX FAV API (real name fetch)
Switch the call from `/v1/payments/validate/vpa` to:
```
POST https://api.razorpay.com/v1/fund_accounts/validations
{
  "account": { "vpa": { "address": "user@bank" }, "type": "vpa" },
  "currency": "INR"
}
```
- If the account has RazorpayX FAV enabled → returns `{ status: "completed", results: { account_status, registered_name } }` → status `valid` + `customer_name`.
- If account lacks FAV → Razorpay returns 400 with `code: BAD_REQUEST_ERROR` and a clear "feature not enabled" message → we cleanly fall to Tier 2.
- 404 / network → fall to Tier 2.

### Tier 2: Deterministic format + provider validation (always available)
When FAV is unavailable:
- Strict regex (already in place)
- **Provider whitelist** of known UPI handles (paytm, ybl, okaxis, oksbi, okhdfcbank, okicici, ibl, axl, upi, ptsbi, ptyes, fbl, jupiteraxis, slc, hdfcbank, sbi, icici, kotak, federal, idfcbank, abfspay, airtel, jio, freecharge, payzapp, postbank, allbank, andb, barodampay, cnrb, cboi, dlb, indianbank, indus, mahb, pingpay, rbl, sib, ubi, uco, vijb, yesbankltd, etc.)
- Status returns `valid` with `provider` set, but **no `customer_name`** and `upi_verification_status` is persisted as `unverified` (NOT `valid`) in the DB so buyer-side trust UI still treats it as unverified — exactly matching the existing failure-mode policy ("save allowed, payouts/buyer warnings stay on").
- The UI shows: "UPI format looks correct, but holder name could not be verified by your payment provider. You can save and complete verification later."

### What changes in code

**`supabase/functions/validate-upi-vpa/index.ts`**
- Replace endpoint URL with `/v1/fund_accounts/validations` and the new request shape
- Parse FAV response: `success` when `data.status === 'completed' && results.account_status === 'active'`
- Detect "feature not enabled" responses (HTTP 400 + `error.description` mentioning "fund account" / "not enabled" / "not activated") → return `unavailable`, NOT `invalid`
- Add Tier 2 fallback: if `status === 'unavailable'`, run provider-whitelist check; return `{ status: 'unavailable', provider, reason: 'Holder name verification unavailable for this payment provider' }` so the existing client UX paths (save with confirm, buyer warning) take over correctly.
- DO NOT mark the seller's `upi_verification_status` as `valid` unless we got a real `registered_name`. Tier 2 success persists as `unverified`.

**No client / DB changes needed** — the hook already handles `unavailable` and the trigger already enforces re-validation. The existing failure matrix already covers this scenario; we're just routing 404 into the correct bucket instead of letting it bubble as `invalid`.

### Verification
After deploy I'll curl the function with:
1. A well-formed VPA on a known provider → expect `status: 'unavailable'` (because FAV likely off) with `provider: 'oksbi'`, no `customer_name`
2. A garbage VPA → expect `status: 'invalid'` from regex pre-check
3. Tail logs to confirm Razorpay's actual response body (so we can refine the FAV-not-enabled detection if needed)

If FAV turns out to be enabled on this account, Tier 1 will simply succeed and return real names — no further changes needed.

### Files
- `supabase/functions/validate-upi-vpa/index.ts` — endpoint swap + 2-tier logic
- Redeploy `validate-upi-vpa`

### Optional (for later, not in this fix)
If you want guaranteed name verification, enable RazorpayX from the Razorpay dashboard (free to activate, charges per validation) — once enabled, Tier 1 starts returning `customer_name` automatically without further code changes. Alternative providers (Cashfree, Decentro, Setu) can be added behind the same `getCredential` abstraction later.

