

## Root Cause

The workflow in the database is **100% correct**. The `seller_delivery` flow defines:

| sort_order | status_key | is_terminal | is_success |
|-----------|-----------|------------|-----------|
| 10-60 | placed → on_the_way | false | true |
| 70 | **delivered** | **true** | **true** |
| 80 | completed | true | true |
| 90 | cancelled | true | false |

The **only problem** is line 136 of `useCategoryStatusFlow.ts`:

```typescript
return flow.filter(s => !s.is_terminal && ...)
```

This blanket-removes ALL terminal statuses from the timeline. Since `delivered` is `is_terminal: true`, it's filtered out — so the timeline visually ends at "On the Way" (the last non-terminal step).

No manual status manipulation is needed. The workflow already defines everything correctly.

## Fix: One line change

**File**: `src/hooks/useCategoryStatusFlow.ts` — `getTimelineSteps` function

Change the filter to only hide **negative** terminals (cancelled, failed) while keeping **successful** terminals (delivered, completed):

```typescript
export function getTimelineSteps(flow: StatusFlowStep[], currentStatus?: string): StatusFlowStep[] {
  return flow.filter(s => {
    if (s.is_terminal && !s.is_success) return false;  // Hide cancelled/failed
    if (s.is_deprecated && s.status_key !== currentStatus) return false;
    return true;
  });
}
```

Then in `useOrderDetail.ts`, deduplicate `delivered` + `completed` in `displayStatuses` since auto-complete makes both redundant in the timeline:

```typescript
const displayStatuses = useMemo(() => {
  const steps = timelineSteps.map(s => s.status_key);
  if (steps.includes('delivered') && steps.includes('completed')) {
    return steps.filter(s => s !== 'completed');
  }
  return steps;
}, [timelineSteps]);
```

This keeps the system fully DB-driven — no hardcoded status names in the filter logic.

