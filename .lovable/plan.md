

# Fix: Order Status DB-Driven Engine, Navigation Trap & Auto-Completion

## Changes

### 1. Fix Navigation Trap (OrderDetailPage.tsx, line 160)
Replace `window.history.back()` with `navigate('/orders')`. This guarantees the buyer always navigates to a valid in-app route, regardless of browser history state after UPI deep links.

### 2. Auto-Complete in RPC (New Migration)
Update `verify_delivery_otp_and_complete` to perform **two** atomic status transitions:
1. `→ delivered` (existing, with `app.otp_verified = true`)
2. `→ completed` immediately after (reset `app.otp_verified` first since the OTP gate only applies to the `→ delivered` transition; `delivered → completed` is allowed for `system` actor per the transitions table)

Set `delivered_at = now()` on the second update. Return `'completed'` as `new_status`.

### 3. Remove Local State Override & Reload (OrderDetailPage.tsx, lines 509-512)
Replace:
```typescript
onVerified={() => {
  o.setOrder({ ...order, status: 'completed' } as any);
  window.location.reload();
}}
```
With:
```typescript
onVerified={() => {
  o.setOrder({ ...order, status: 'completed' } as any);
  // Realtime subscription handles final DB state sync
}}
```
Remove `window.location.reload()`. The existing realtime subscription (postgres_changes on orders table) will refetch and reconcile. The local `setOrder` provides instant feedback matching the new RPC return value.

### 4. Remove Hardcoded Transit Fallback (useOrderDetail.ts, line 240)
The fallback `['picked_up', 'on_the_way', 'at_gate'].includes(order.status)` violates the DB-driven principle. Replace with `return false` — if the flow data and tracking config are both unavailable, we should not assume transit state.

### Files Modified
- `src/pages/OrderDetailPage.tsx` — navigation fix + remove reload
- `src/hooks/useOrderDetail.ts` — remove hardcoded transit fallback
- New SQL migration — auto-complete in `verify_delivery_otp_and_complete` RPC

