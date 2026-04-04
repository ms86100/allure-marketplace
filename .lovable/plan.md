

# Gate ALL Polling Under Circuit Breaker + Recovery Jitter

## Problem
5 polling loops fire continuously regardless of backend health. With DB stress, these amplify load and prevent recovery. The circuit breaker exists but only gates React Query pollers — manual `setInterval` loops are ungated.

## Changes

### 1. `src/lib/circuitBreaker.ts` — Add `isAnyCircuitOpen()` + `'security'` domain

Add helper that checks if ANY domain's circuit is open. Add `'security'` domain for gate entry polling. Add `'auth'` domain for session health.

```typescript
export function isAnyCircuitOpen(): boolean {
  for (const [, s] of states) {
    if (s.openedAt && Date.now() - s.openedAt < COOLDOWN_MS) return true;
  }
  return false;
}
```

Update Domain type to include `'security'` and `'auth'`.

### 2. `src/hooks/useNewOrderAlert.ts` — Gate poll + record failures

In the polling `catch {}` block (~line 261): replace empty catch with `recordFailure('orders')`. On successful poll: `recordSuccess('orders')`. At top of `poll()`: early-return if `isCircuitOpen('orders')`, and set `pollDelayRef.current = COOLDOWN_MS` so the next tick respects cooldown.

### 3. `src/hooks/useLiveActivityOrchestrator.ts` — Gate 15s poll

At top of `poll()` (~line 398): early-return if `isCircuitOpen('orders')`. In `catch` (~line 442): `recordFailure('orders')`. After successful query: `recordSuccess('orders')`.

### 4. `src/components/security/ResidentConfirmation.tsx` — Gate 5s poll

Wrap `fetchPending()` in the 5s `setInterval` with `isCircuitOpen('security')` check. Add try/catch around the fetch with `recordFailure`/`recordSuccess`.

### 5. `src/hooks/useOrderDetail.ts` — Gate 45s heartbeat

In the 45s `setInterval` (~line 203): skip `invalidateOrder()` if `isCircuitOpen('orders')`.

### 6. `src/contexts/auth/useAuthState.ts` — Gate 5-min session health check

At top of the 5-min interval callback (~line 277): early-return if `isAnyCircuitOpen()`. Session health is pointless when DB is unreachable. In catch: `recordFailure('auth')`.

### 7. Recovery jitter (prevent half-open flood)

In `circuitBreaker.ts`, modify `isCircuitOpen()` to add random jitter (0-5s) when transitioning to half-open:

```typescript
if (Date.now() - s.openedAt >= COOLDOWN_MS + Math.random() * 5000) {
  // half-open
}
```

This staggers recovery across domains/components so they don't all resume simultaneously.

## Files changed

| File | Change |
|------|--------|
| `src/lib/circuitBreaker.ts` | Add `isAnyCircuitOpen()`, new domains, recovery jitter |
| `src/hooks/useNewOrderAlert.ts` | Gate poll, record failure/success |
| `src/hooks/useLiveActivityOrchestrator.ts` | Gate 15s poll, record failure/success |
| `src/components/security/ResidentConfirmation.tsx` | Gate 5s poll, record failure/success |
| `src/hooks/useOrderDetail.ts` | Gate 45s heartbeat |
| `src/contexts/auth/useAuthState.ts` | Gate 5-min session health check |

## Result
- DB healthy: zero behavior change
- DB stressed: ALL polling stops within 3 failures → DB gets breathing room → staggered recovery via jitter
- No new dependencies, no DB changes

