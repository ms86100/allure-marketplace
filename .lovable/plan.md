

# Scoped Circuit Breaker + Resilient Polling

## Problem
5 components poll every 30s with static `refetchInterval`. When the DB is under stress, these create a retry amplification storm. No circuit breaker exists yet (previous plan was proposed but never implemented).

## Changes

### 1. New file: `src/lib/circuitBreaker.ts`

**Scoped** circuit breaker (~50 lines) that tracks failures per domain, not globally:

- Domains: `'notifications'`, `'orders'`, `'admin'`, `'general'`
- `recordFailure(domain)` — increments consecutive failure count for that domain
- `recordSuccess(domain)` — requires 2 consecutive successes before closing circuit (prevents premature recovery)
- `isCircuitOpen(domain)` — returns true after 3 consecutive failures; auto-enters half-open after 60s cooldown (allows 1 test request)
- `isDomainFor(queryKey): domain` — maps query keys to domains (e.g. `['notifications', ...]` → `'notifications'`, `['active-orders-strip', ...]` → `'orders'`)

### 2. Update `src/App.tsx` QueryCache

Wire into existing `onError`:
```typescript
onError: (error, query) => {
  console.error('[Query Error]', error);
  if (isAuthSessionError(error)) { handleAuthError(); return; }
  recordFailure(isDomainFor(query.queryKey));
},
onSuccess: (_data, query) => {
  recordSuccess(isDomainFor(query.queryKey));
},
```

### 3. Update 5 polling locations

Replace `refetchInterval: 30_000` with:
```typescript
refetchInterval: (query) =>
  query.state.status === 'error' || isCircuitOpen(DOMAIN) ? false : 30_000
```

| File | Domain |
|------|--------|
| `useUnreadNotificationCount.ts` | `'notifications'` |
| `useNotifications.ts` (2 places) | `'notifications'` |
| `ActiveOrderStrip.tsx` | `'orders'` |
| `AdminAIReviewLog.tsx` | `'admin'` |
| `FestivalCollectionPage.tsx` | `'general'` |

Also add `placeholderData: keepPreviousData` to `ActiveOrderStrip` and `useUnreadNotificationCount` for cache fallback during failures.

### 4. Cold-start protection

Add `refetchOnMount: false` to `ActiveOrderStrip` and `useUnreadNotificationCount` (they already have short staleTime/polling — no need to also fire on mount).

## Key design decisions
- **Scoped, not global**: notifications failure won't kill order polling
- **Multi-success recovery**: 2 consecutive successes required to close circuit (prevents flapping)
- **60s cooldown**: half-open state allows one test request before resuming
- **No max-silence cap needed**: 60s cooldown already prevents "stuck forever"
- **Existing retry config unchanged**: already `failureCount < 1` globally

## Execution order
1. Create `src/lib/circuitBreaker.ts`
2. Update `App.tsx` QueryCache hooks
3. Update all 5 polling files

