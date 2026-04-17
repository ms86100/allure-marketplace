

## Root Cause

The `validate-upi-vpa` and `mark-upi-stale` edge functions exist in source but were **never deployed** to Supabase (curl returns `404 NOT_FOUND` on both, and there are zero logs/boots ever). The browser shows "Failed to send a request to the Edge Function" because `supabase.functions.invoke()` is hitting a non-existent endpoint.

Why deploy likely failed silently in the previous loop: `supabase/functions/_shared/credentials.ts` uses `jsr:@supabase/supabase-js@2`, while every other shared/edge file in this project uses `https://esm.sh/@supabase/supabase-js@2.93.3`. Mixed module resolvers (jsr + esm.sh) for the same package commonly cause edge-runtime deploy errors, leaving the function unregistered. This matches the documented "Edge Function Deploy Troubleshooting" pattern.

## Fix Plan (bulletproof, one shot)

1. **Normalize `_shared/credentials.ts`** to use the same `https://esm.sh/@supabase/supabase-js@2.93.3` import as every other shared file. Removes the jsr/esm.sh conflict.
2. **Force redeploy** both functions via `supabase--deploy_edge_functions(["validate-upi-vpa","mark-upi-stale"])`.
3. **Verify with `curl_edge_functions`** — POST a test VPA, confirm a `200` JSON response with `status` field (not 404).
4. **Tail logs** with `edge_function_logs` to confirm the function booted.
5. **Improve client error UX** in `src/hooks/useUpiValidation.ts`: when `supabase.functions.invoke` returns the FunctionsFetchError ("Failed to send a request"), surface a clearer message ("UPI verification service is offline") and set status to `unavailable` instead of `error`, so the existing "Save anyway" path still works as a safety net.

No DB changes, no schema changes, no new secrets. Razorpay keys are already in `admin_settings` per the existing credential helper.

### Files Changed

- `supabase/functions/_shared/credentials.ts` — swap `jsr:` → `https://esm.sh/...@2.93.3`
- `src/hooks/useUpiValidation.ts` — better error classification for fetch failures
- Redeploy: `validate-upi-vpa`, `mark-upi-stale`

### Verification

After deploy I will call `validate-upi-vpa` directly with a known invalid format and a known valid VPA to confirm it returns proper JSON, then check logs.

