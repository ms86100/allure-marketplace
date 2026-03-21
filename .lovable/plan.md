

# Restructure Transition Rules to Show Only Active Transitions

## Problem
The current transition rules editor renders a **full N x N matrix** of every status against every other status (line 416: `possibleTargets = editSteps.filter(s => s.status_key !== fromStep.status_key)`). For Cart Purchase with 10 statuses, this creates 90 rows — most empty. It's confusing and wasteful.

## Current behavior
```text
placed →
  accepted    [buyer] [seller] [delivery] [system] [admin]
  preparing   [buyer] [seller] [delivery] [system] [admin]
  ready       [buyer] [seller] [delivery] [system] [admin]
  picked_up   [buyer] [seller] [delivery] [system] [admin]
  ... (9 rows, most with no actors selected)

accepted →
  placed      [buyer] [seller] [delivery] [system] [admin]
  preparing   [buyer] [seller] [delivery] [system] [admin]
  ... (9 rows again)

(repeat for every non-terminal status)
```

## Proposed behavior
```text
Transition Flow Diagram (visual, already built)
[Placed] ──→ [Accepted] ──→ [Preparing] ──→ [Ready] ──→ ...

Active Transitions (compact list, grouped by from_status)

placed →
  accepted     seller ✕
  cancelled    buyer · seller · admin ✕
  [+ Add transition]

accepted →
  preparing    seller ✕
  cancelled    buyer · seller · admin ✕
  [+ Add transition]

preparing →
  ready        seller ✕
  cancelled    admin ✕
  [+ Add transition]

... (only statuses that HAVE transitions)
```

## Changes — 1 file

### `src/components/admin/AdminWorkflowManager.tsx` (lines ~414-455)

1. **Replace the full matrix** with a filtered view that only renders rows where at least one actor is toggled ON (i.e., an active transition exists).

2. **For each `fromStep`**, filter `possibleTargets` to only those with at least one active actor. Show these compactly with actor badges and a remove (x) button.

3. **Add "+ Add transition" button** per `fromStep` that opens a small inline dropdown to pick a new target status + actor. This replaces the empty rows as the way to create new transitions.

4. **Keep the visual flow diagram** (`WorkflowFlowDiagram`) at the top as the primary overview. The compact list below serves as the editable detail view.

5. Actor toggle buttons remain clickable to add/remove actors on existing transitions — same `toggleTransition` function, just in a more compact layout.

## No database changes. No logic changes. Pure UI restructuring of the same data.

