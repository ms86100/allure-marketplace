

# Fix: Copy exact `useSellerApplication.ts` logic from reference project

## The Problem
The `checkGroupConflict` effect (lines 199-203) redirects approved sellers away, causing the "This entry already exists" error when they try to create a new store in a group where they already have an approved store. The reference project does NOT have this redirect.

## The Fix
One change in one file — remove lines 199-203 to match the reference project exactly.

### File: `src/hooks/useSellerApplication.ts`

**Replace lines 199-204** (the checkGroupConflict body after the query):

```typescript
// Current (REMOVE the if block):
if (data && (data as any).verification_status === 'approved') {
  navigate('/seller', { replace: true });
  return;
}
setExistingSeller(data ? data as any : null);

// Replace with (matches reference exactly):
setExistingSeller(data ? data as any : null);
```

This is a 4-line deletion. No other files change. The rest of the hook is identical between both projects.

## Result
- Selecting a group where seller already has an approved store → `existingSeller` is set → `BecomeSellerPage` renders the "Store Approved" screen with option to register another category
- No more redirect loop, no more unique constraint violation from auto-save racing against the redirect

