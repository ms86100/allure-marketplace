

# Fix Circuit Breaker: Deterministic Jitter, Scoped Checks, True Interval Pause

## Problem
Three design flaws in the current circuit breaker implementation:
1. `isCircuitOpen()` calls `Math.random()` on every check — non-deterministic read operation
2. Intervals still fire every 5s/15s/45s even when circuit is open (CPU waste, fragile)
3. `isAnyCircuitOpen()` in auth health check over-couples domains (orders failure blocks auth)

## Changes

### 1. `src/lib/circuitBreaker.ts` — Deterministic jitter

**a)** Add `nextAttemptAt: number | null` to `DomainState`.

**b)** In `recordFailure()`, when opening circuit, compute `nextAttemptAt = Date.now() + COOLDOWN_MS + Math.random() * JITTER_MS`. Jitter is set once at transition time, not on every read.

**c)** Rewrite `isCircuitOpen()`:
```typescript
if (!s.openedAt) return false;
if (Date.now() >= s.nextAttemptAt!) {
  s.nextAttemptAt = Date.now() + COOLDOWN_MS + Math.random() * JITTER_MS; // next half-open window
  return false; // allow one test request
}
return true;
```

**d)** Replace `isAnyCircuitOpen()` with `isCircuitOpen('auth')` usage. Keep the function but add a deprecation comment — only used as a last-resort global kill switch, not for domain-scoped checks.

### 2. `src/contexts/auth/useAuthState.ts` — Scope to `isCircuitOpen('auth')`

Line 279: Replace `isAnyCircuitOpen()` with `isCircuitOpen('auth')`. Auth health check should only be blocked by auth-domain failures, not by unrelated orders/notifications failures.

Add `recordFailure('auth')` in the catch block (line 311) so the auth circuit actually opens on repeated failures.

### 3. `src/hooks/useNewOrderAlert.ts` — True interval pause

Instead of early-return inside the poll callback, clear the timeout/interval when circuit opens and schedule a re-check after `COOLDOWN_MS`. When circuit closes (on successful test request), resume normal polling cadence.

### 4. `src/hooks/useLiveActivityOrchestrator.ts` — True interval pause

Same pattern: skip scheduling the next poll tick when `isCircuitOpen('orders')` returns true. Schedule a single delayed re-check instead.

### 5. `src/components/security/ResidentConfirmation.tsx` — True interval pause

In the 5s `setInterval` effect: when `isCircuitOpen('security')`, clear the interval. Add a separate effect that watches for circuit recovery and restarts polling.

### 6. `src/hooks/useOrderDetail.ts` — True interval pause

Same pattern for the 45s heartbeat: clear interval when circuit is open, restart when closed.

## Files changed

| File | Change |
|------|--------|
| `src/lib/circuitBreaker.ts` | Deterministic jitter (set at transition, not at check) |
| `src/contexts/auth/useAuthState.ts` | `isCircuitOpen('auth')` + `recordFailure('auth')` |
| `src/hooks/useNewOrderAlert.ts` | True interval pause when circuit open |
| `src/hooks/useLiveActivityOrchestrator.ts` | True interval pause when circuit open |
| `src/components/security/ResidentConfirmation.tsx` | True interval pause when circuit open |
| `src/hooks/useOrderDetail.ts` | True interval pause when circuit open |

## Result
- `isCircuitOpen()` is now a pure deterministic check
- Zero CPU waste during circuit-open state (intervals stopped, not skipped)
- Auth not blocked by unrelated domain failures
- No new dependencies, no DB changes

