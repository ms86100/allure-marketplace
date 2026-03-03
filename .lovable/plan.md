

# Fix: Stop Old Orders from Flooding the Alert Queue

## Problem
The `useNewOrderAlert` hook's initial poll fetches **all orders in `placed`/`enquired`/`quoted` status from the last 24 hours**. There are 10+ test orders stuck in `placed` from yesterday. Every app open triggers alerts for all of them.

## Solution (Two-Part)

### Part 1: Cancel the stale test orders in the database
Run a migration to cancel all 10 orders currently stuck in `placed` status from March 2nd (they are clearly test orders that were never fulfilled).

### Part 2: Change the alert logic to only alert on NEW orders
The current "DEFECT 6 FIX" comment says "fetch ALL actionable orders" on first poll — this is the root cause. On cold start, the hook should **only** alert on orders created **after the app opened**, not retroactively.

Changes to `src/hooks/useNewOrderAlert.ts`:
- Record the hook mount timestamp (`mountedAtRef`)
- On the **first poll** (when `lastSeenAtRef.current` is null), only fetch orders with `created_at > mountedAt` instead of the last 24 hours
- This means: realtime subscription catches live orders, and the poll fallback only catches orders that arrived after this session started
- Subsequent polls continue using `lastSeenAtRef.current` as before (no change)

This ensures old unfulfilled orders never trigger alerts. Sellers can still see them in their orders list — they just won't get intrusive full-screen popups for stale orders.

### Technical Detail
```
// Before (line ~178):
const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
query = query.gt('created_at', twentyFourHoursAgo);

// After:
query = query.gt('created_at', mountedAtRef.current);
```

One new ref: `const mountedAtRef = useRef(new Date().toISOString());`

