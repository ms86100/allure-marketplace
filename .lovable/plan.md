

# Bulletproof Cart: Eliminate False Empty State Forever

## Root Cause (confirmed)

Line 522: `refresh` calls `reconcile()`, which is called on cart page mount (line 74-76 of useCartPage.ts). The `reconcile` function at line 210-244 can still overwrite valid state with empty in edge cases where `currentItems` is undefined/empty during hydration.

Additionally, line 514-518 syncs count from items — so if items briefly becomes `[]`, count gets set to `0`, blinding the recovery system.

## Plan (6 changes across 2 files)

### 1. Replace destructive `refresh()` on cart page mount

**File**: `src/hooks/useCartPage.ts` lines 73-76

Replace `refresh()` with a safe `invalidateQueries` that lets React Query refetch without overwriting cache mid-hydration:

```ts
useEffect(() => {
  queryClient.invalidateQueries({ queryKey: ['cart-items'] });
  queryClient.invalidateQueries({ queryKey: ['cart-count'] });
}, []);
```

### 2. Never trust empty without server count verification in `reconcile()`

**File**: `src/hooks/useCart.tsx` lines 210-244

Change the reconcile guard: when `freshItems` is empty, **always** verify with a count query before accepting — regardless of whether `currentItems` exists or not:

```ts
if (freshItems.length === 0) {
  const verifyCount = await fetchCartItemCount(user.id);
  if (verifyCount > 0) {
    // Server has items — don't trust empty result
    queryClient.refetchQueries({ queryKey: cartKey(), exact: true });
    queryClient.refetchQueries({ queryKey: countKey(), exact: true });
    return;
  }
  // Genuinely empty — safe to write
  queryClient.setQueryData(cartKey(), []);
  queryClient.setQueryData(countKey(), 0);
  return;
}
```

This removes the conditional guard that only worked when `currentItems` was non-empty.

### 3. Never downgrade count from item sync during uncertain states

**File**: `src/hooks/useCart.tsx` lines 513-518

Add a guard: don't sync count to 0 from items if we haven't verified it server-side:

```ts
useEffect(() => {
  if (hasHydrated && user && !hasCartCountMismatch) {
    // Never downgrade count to 0 from item sync — only server verification can do that
    if (itemCount === 0 && fallbackItemCount > 0) return;
    queryClient.setQueryData(['cart-count', user.id], itemCount);
  }
}, [hasHydrated, user, itemCount, queryClient, hasCartCountMismatch, fallbackItemCount]);
```

### 4. Add `isVerified` state to prevent premature empty rendering

**File**: `src/hooks/useCart.tsx`

Add a `cartVerified` flag that only becomes `true` after the first successful non-transient fetch or after server count confirms 0:

- New state: `const [cartVerified, setCartVerified] = useState(false)`
- Set `true` when items arrive (`items.length > 0`) or when reconcile confirms genuine empty
- Expose via context

### 5. Gate empty state on verification

**File**: `src/pages/CartPage.tsx` line 50

Add `c.cartVerified` (or equivalent) to the empty state condition:

```ts
if (c.items.length === 0 && !c.hasActivePaymentSession && c.pendingMutations === 0 
    && !c.isFetching && !c.isRecoveringCart && c.cartVerified) {
```

Until verified, the loading state shows instead.

### 6. Expose `refresh` as safe invalidation (not reconcile)

**File**: `src/hooks/useCart.tsx` line 522

Change `refresh` from calling `reconcile()` to safe invalidation:

```ts
refresh: async () => {
  if (user) {
    await queryClient.invalidateQueries({ queryKey: cartKey() });
    await queryClient.invalidateQueries({ queryKey: countKey() });
  }
},
```

This ensures no external caller can trigger a destructive reconcile. Reconcile remains internal, used only after successful mutations where we know the state is fresh.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useCart.tsx` | Harden reconcile (always verify before accepting empty), add `cartVerified` flag, protect count sync from blind downgrade, make `refresh` non-destructive |
| `src/hooks/useCartPage.ts` | Replace mount `refresh()` with safe `invalidateQueries` |
| `src/pages/CartPage.tsx` | Gate empty state on `cartVerified` |

## Why This Is Actually Bulletproof

- **Rule 1**: Empty is never written without server count confirmation — no transient glitch can cause false empty
- **Rule 2**: Count can never be downgraded to 0 except by server verification — recovery system stays alive
- **Rule 3**: No route navigation can trigger destructive state mutation — mount is safe
- **Rule 4**: UI never shows "empty" until the system has positively confirmed emptiness — loading state covers all uncertainty
- **Rule 5**: `reconcile` is internal-only, triggered after known-good mutations — not exposed to timing-sensitive mount effects

