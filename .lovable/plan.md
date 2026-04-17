

## Bulletproof UPI Validation v2 — Production-Grade

Incorporating all 7 critical gaps you raised. This is the locked spec.

### 1. Verification State Machine (deterministic)

New column on `seller_profiles`:
```
upi_verification_status: 'unverified' | 'valid' | 'invalid' | 'stale' | 'unavailable'
```
Plus: `upi_holder_name`, `upi_verified_at`, `upi_provider`.

Status transitions are the single source of truth — every UI surface (settings, dashboard, checkout, payouts) reads this enum, never re-derives.

### 2. Edge Function `validate-upi-vpa` (hardened)

`supabase/functions/validate-upi-vpa/index.ts`
- Auth via `withAuth` (Bearer token required)
- **Rate limit** via existing `_shared/rate-limiter.ts`: `5 req / 60s` per `userId`, plus `30 req / 60s` per IP fallback
- Strict regex pre-check: `^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,254}[a-zA-Z0-9])?@[a-zA-Z][a-zA-Z0-9]{1,63}$` (no leading/trailing dots, no consecutive specials at edges, provider must start with letter, min 2 chars)
- Calls Razorpay `POST /v1/payments/validate/vpa` with Basic auth (`getCredential` → DB → env)
- Returns `{ status, customer_name, vpa, provider, reason }` where `status ∈ valid|invalid|unavailable|error`
- **Provider extraction**: `vpa.split('@')[1].toLowerCase()`
- Always writes one row to `upi_validation_logs` (audit trail) — never blocks response if log insert fails

### 3. Audit Log Table

```sql
CREATE TABLE upi_validation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seller_id uuid,
  vpa text NOT NULL,
  status text NOT NULL,
  customer_name text,
  provider text,
  reason text,
  created_at timestamptz DEFAULT now()
);
-- RLS: users see own rows; service role inserts; admins read all
CREATE INDEX idx_upi_logs_user_created ON upi_validation_logs(user_id, created_at DESC);
```

### 4. Lifecycle Re-validation

Staleness window: **30 days** (constant `UPI_REVALIDATION_DAYS`).

Re-validation triggers:
| Trigger | Action |
|---|---|
| `upi_id` text changed | Mandatory revalidate, status reset to `unverified` until passed |
| `upi_verified_at` > 30 days old | Status auto-flips to `stale` (computed in hook + nightly cron) |
| Payment attempt fails with UPI error | Edge function `mark-upi-stale` flips status to `stale`, notifies seller |

A daily cron (`pg_cron`) runs `UPDATE seller_profiles SET upi_verification_status='stale' WHERE upi_verified_at < now() - interval '30 days' AND upi_verification_status='valid'`.

### 5. Save-Time Enforcement (no abuse path)

In `useSellerSettings.handleSave` and `BecomeSellerPage` submit:
| Status | Save behavior |
|---|---|
| `valid` | Allow |
| `invalid` | **Hard block** (toast error) |
| `unavailable` / `error` | Allow, but force `upi_verification_status='unavailable'`, persistent dashboard banner, payouts blocked |
| `unverified` (never validated) | Allow only if user explicitly confirms in modal; same restrictions as `unavailable` |

Bypass impossible: server-side trigger on `seller_profiles` BEFORE UPDATE rejects rows where `upi_id` changed but `upi_verification_status` is still `valid` with old `upi_holder_name` — forcing the client to call validate first.

### 6. Buyer-Side Trust at Checkout

`UpiDeepLinkCheckout.tsx`:
- `valid` + fresh → "Paying to: ANANYA GUPTA" (green check)
- `stale` → amber: "Seller UPI verification expired — proceed with caution"
- `unverified` / `unavailable` → red: "Seller UPI is not verified. We cannot guarantee the recipient. Proceed at your own risk." + "Choose another payment method" CTA
- `invalid` → UPI option hidden entirely

Future hook (not built now, but reserved): unverified sellers get a `trust_score` penalty in ranking RPCs.

### 7. Client Pieces

**Hook** `src/hooks/useUpiValidation.ts`:
- Debounced 700ms, in-memory cache by VPA
- States mirror DB enum: `idle | checking | valid | invalid | unavailable | error | stale`
- `validate(vpa)`, `reset()`, exposes `customerName`, `provider`, `reason`

**Component** `src/components/payment/UpiVpaInput.tsx`:
- Status icon (spinner / green check / red x / amber warn)
- Verified name line + provider badge
- Soft mismatch warning vs `business_name` (Levenshtein, non-blocking)
- "Re-verify" button always visible if status ≠ `valid`

### Files

**New**
- `supabase/functions/validate-upi-vpa/index.ts`
- `supabase/functions/mark-upi-stale/index.ts` (called from payment failure handler)
- `src/hooks/useUpiValidation.ts`
- `src/components/payment/UpiVpaInput.tsx`

**Migration (additive + trigger + cron)**
- Add `upi_holder_name`, `upi_verified_at`, `upi_provider`, `upi_verification_status` to `seller_profiles`
- Create `upi_validation_logs` + RLS
- BEFORE UPDATE trigger on `seller_profiles` enforcing revalidation when `upi_id` changes
- `pg_cron` job for daily stale flip

**Edited**
- `src/pages/SellerSettingsPage.tsx`, `src/pages/BecomeSellerPage.tsx` — replace bare input
- `src/hooks/useSellerSettings.ts` — enforce status-based save gating
- `src/components/payment/UpiDeepLinkCheckout.tsx` — buyer trust UI
- Payout-blocking check wherever payouts are issued (lookup needed at impl time)

### Failure Matrix

| Scenario | Outcome |
|---|---|
| Bad format | Inline red, save blocked |
| Razorpay invalid | Status `invalid`, save blocked |
| Razorpay keys missing | Status `unavailable`, save allowed w/ confirm, payouts blocked |
| Network error | Status `error`, retry button, same restrictions as `unavailable` |
| Holder ≠ business name | Amber non-blocking note |
| Edit after verify | Status reset to `unverified`, must re-validate |
| 30 days passed | Auto `stale`, buyer warning, seller nudged |
| Payment fails (UPI) | Backend flips to `stale`, forces re-verify |
| Spam validate calls | Rate-limited 5/min/user |
| Bypass attempt via direct DB | Blocked by trigger |

### Scope

- 2 new edge functions, 2 new client files, 1 migration (additive + trigger + cron), 4 edits
- No breaking changes; existing sellers default to `unverified` and are prompted on next settings visit
- Razorpay keys already configured — no secret request needed

