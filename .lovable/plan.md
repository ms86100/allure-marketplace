

# Add Visual Transition Flow Diagram to Workflow Editor

## Problem
When opening a workflow in the Drawer editor, the user sees raw text-based transition rules (status keys with actor toggle buttons). They want a **visual flow diagram** showing how statuses link to each other — directional arrows, bi-directional indicators — so the workflow structure is immediately understandable.

## Approach
Add a **visual flow diagram component** rendered above the existing editor content. It will use pure CSS/SVG (no external library) to draw status nodes connected by directional arrows based on the `transitions` data.

### UI Design
```text
┌─────────────────────────────────────────────────┐
│  [pending] ──→ [accepted] ──→ [completed] ⏹    │
│       │              ↑                          │
│       └──→ [rejected] ⏹                        │
│                                                  │
│  ←→ = bi-directional   → = one-way              │
│  Actor colors on arrows                          │
└─────────────────────────────────────────────────┘
```

- Each **status node** is a rounded pill/box showing the display_label
- **Arrows** connect from_status → to_status based on transitions data
- **Bi-directional** arrows shown when A→B and B→A both exist
- **Actor color coding** on arrows (buyer=blue, seller=amber, etc.)
- Terminal nodes get a distinct style (green border, stop icon)
- Current step 1 (first node) gets a start indicator

## Changes — 1 new file, 1 edit

### New: `src/components/admin/workflow/WorkflowFlowDiagram.tsx`
- Accepts `steps: FlowStep[]` and `transitions: Transition[]` as props
- Renders a horizontal/wrapped node-and-arrow layout using flexbox + SVG arrows
- Nodes positioned by sort_order; arrows drawn based on transition data
- Detects bi-directional pairs (A→B + B→A) and renders them as double-headed arrows
- Actor badges on each arrow edge
- Responsive: wraps on smaller screens

### Edit: `src/components/admin/AdminWorkflowManager.tsx`
- Import and render `WorkflowFlowDiagram` inside the Drawer, between the header and the "Status Pipeline" section (line ~321)
- Pass `editSteps` and `transitions` as props
- Wrapped in a collapsible section labeled "Transition Flow"

## No database changes. No logic changes. Read-only visualization of existing data.

