

# Root Cause Found: `confirm-razorpay-payment` Edge Function Is NOT Deployed (404)

## Definitive Answer

**Payment confirmation from Razorpay was NOT received by the backend.**

I just tested the edge function endpoint directly — it returns **HTTP 404 Not Found**. The function code exists in the repository but was **never successfully deployed to production**.

This means:
- Every client-side call to `confirm-razorpay-payment` after payment success → **silently fails** (404)
- Every order-detail reconciliation attempt → **silently fails** (404)
- The webhook (`razorpay-webhook`) shows no logs either, suggesting it may also not be deployed or Razorpay is not configured to call it

**This single fact explains every symptom**: stuck orders, no DB update, no seller notification, contradictory UI.

## Evidence

| Check | Result |
|-------|--------|
| `curl POST /confirm-razorpay-payment` | **404 Not Found** |
| Edge function logs for `confirm-razorpay-payment` | **No logs** |
| Edge function logs for `razorpay-webhook` | **No logs** |
| Client code calls the function | ✅ Yes (line 572 of useCartPage.ts) |
| Reconciliation calls the function | ✅ Yes (line 152 of OrderDetailPage.tsx) |
| Function code exists in repo | ✅ Yes (`supabase/functions/confirm-razorpay-payment/index.ts`) |

## Why Previous Fixes Didn't Work

Every previous fix improved the **logic inside the function** — but the function itself was never deployed. No amount of code improvement matters if the endpoint doesn't exist on the server.

## Fix Plan

### Step 1: Deploy both payment edge functions
Deploy `confirm-razorpay-payment` and verify `razorpay-webhook` is also deployed. Test each returns a non-404 response.

### Step 2: Verify end-to-end
After deployment, the existing code should work immediately because:
- Client success handler already calls `confirm-razorpay-payment` with payment ID + order IDs
- The function already verifies with Razorpay API, upserts payment_records, advances order status, and queues seller notification
- OrderDetailPage reconciliation already triggers for stuck `payment_pending` orders
- UI gating for `payment_pending` vs `placed` is already correct in the current code

### Step 3: Repair stuck orders
After deployment, simply opening any stuck order's detail page will trigger the reconciliation effect, which will call the now-deployed function and auto-recover.

## Files Changed
| File | Action |
|------|--------|
| `supabase/functions/confirm-razorpay-payment/index.ts` | **Deploy** (no code changes needed) |
| `supabase/functions/razorpay-webhook/index.ts` | **Verify deployed** |

## Bottom Line
This is a deployment gap, not a code bug. The function must be deployed, then the entire payment confirmation pipeline will work as designed.

