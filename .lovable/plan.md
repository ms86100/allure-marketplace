

# Round 4 Audit — Hidden Bugs

## Issue 1: CRITICAL — `get_seller_trust_snapshot` RPC Broken (Type Mismatch)

**Visible in console logs right now:**
```
Error fetching seller trust snapshot: {
  "code": "42804",
  "details": "Returned type integer does not match expected type numeric in column 5."
}
```

**Root cause**: The function signature declares column 5 (`avg_response_min`) as `numeric`, but the body returns `COALESCE(sp.avg_response_minutes, 0)` where `avg_response_minutes` is an `integer` column. PostgreSQL refuses to implicitly cast `integer → numeric` in a `RETURNS TABLE` context.

**Impact**: The Seller Trust Snapshot card (fulfillment rate, repeat buyers, response time, recent orders) **never renders** on any product detail page or seller page. The RPC always errors, data returns `null`, and the component silently hides itself (`if (!trust) return null`).

**Fix**: New migration to `CREATE OR REPLACE` the function, casting the COALESCE to `numeric`:
```sql
COALESCE((SELECT sp.avg_response_minutes FROM public.seller_profiles sp WHERE sp.id = _seller_id), 0)::numeric
```

## Issue 2: MEDIUM — `handleRazorpayFailed` Doesn't Clear Cart

**Location**: `src/hooks/useCartPage.ts` lines 226-236

**Bug**: When Razorpay payment fails and the order is cancelled, `clearCart()` is never called. The user sees stale cart items after the order was already created (and cancelled). If they try to place another order, they may create duplicate orders from the same cart items that the RPC already deleted server-side but the client still shows.

**Fix**: Add `clearCart()` in `handleRazorpayFailed` after cancelling orders (line 233), and similarly in `handleUpiDeepLinkFailed` (line 251).

## Issue 3: MEDIUM — Address Update Sends `id` in Payload Despite Deletion

**Location**: `src/hooks/useDeliveryAddresses.ts` lines 28-43

**Bug**: When editing an existing address, the code does `delete payload.id` (line 30) but then checks `if (addr.id)` (line 37) — this works. However, the `payload` still contains the original `addr` spread which may include unexpected fields from the database row (e.g., `created_at`, `updated_at`, `user_id` duplication). If the DB schema changes or adds computed columns, the update will fail with "column does not exist."

**Fix**: Explicitly pick only the editable fields into the payload rather than spreading the entire `addr` object.

## Issue 4: LOW — `useDeliveryAddresses` Default Race Condition

**Location**: `src/hooks/useDeliveryAddresses.ts` lines 32-35

**Bug**: When setting an address as default, the mutation first UNSETs all defaults (`update is_default=false WHERE user_id`), then SETs the new one. These are two separate queries with no transaction. If the second query fails, the user ends up with NO default address.

**Fix**: Wrap in a single RPC or reverse the order (set new default first, then unset others excluding the new one).

---

## Implementation Plan

1. **Fix `get_seller_trust_snapshot` RPC** — Migration to recreate the function with `::numeric` cast on column 5. This is the most impactful fix since the trust card is completely broken for all users.

2. **Clear cart on payment failure** — Add `clearCart()` in both `handleRazorpayFailed` and `handleUpiDeepLinkFailed` in `useCartPage.ts`.

3. **Sanitize address payload** — In `useDeliveryAddresses.ts`, explicitly destructure only the editable fields instead of spreading the raw address object.

All fixes are backward-compatible, no new features introduced.

