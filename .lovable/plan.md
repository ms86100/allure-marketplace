

# Fix: "Add Business / New Store" redirects back to seller dashboard

## Root Cause

In `src/hooks/useSellerApplication.ts` (lines 134-138), there is a redirect that does NOT exist in the reference project:

```typescript
const approved = data.find((s: any) => s.verification_status === 'approved');
if (approved) {
  navigate('/seller', { replace: true });
  return;
}
```

When a seller with an approved store visits `/become-seller` to add a second store, this code finds their existing approved profile and immediately redirects them back to `/seller`. The reference project does NOT have this redirect — it only handles `rejected` profiles.

## Fix

Remove the approved-seller redirect block (lines 134-138) and align with the reference project's logic, which only sets `existingSeller` for `rejected` profiles. This allows approved sellers to proceed with the onboarding wizard to create a new store.

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useSellerApplication.ts` | Remove the `approved → navigate('/seller')` redirect block (lines 134-138), align with reference logic |

## What stays the same
- Draft resume logic — unchanged
- Rejected/pending seller handling — will match reference (only rejected shown)
- SellerRoute guard — unchanged
- SellerSwitcher multi-store UI — unchanged

