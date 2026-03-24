

# Workflow Editor: Full Delivery & OTP Transparency

## Problem

1. **`creates_tracking_assignment` is hidden** — only appears when `is_transit` is checked (line 693). Admin can't see or control where delivery starts independently.
2. **No visual indicator** showing "delivery starts here" in the workflow timeline/diagram.
3. **No step capability summary** — admin can't see at a glance whether delivery exists at each step and whether OTP is valid there.
4. **OTP validation uses toasts** — errors should be inline, persistent, and blocking rather than disappearing messages.
5. **No enforcement of single tracking start point** — multiple steps can have `creates_tracking_assignment = true`.

## Changes

### 1. Decouple `creates_tracking_assignment` from `is_transit` (`AdminWorkflowManager.tsx`)

Move the "Auto-create Tracking" checkbox out of the `{step.is_transit && (...)}` conditional (line 693). Make it a standalone toggle labeled **"🚚 Start Delivery Here"** visible on ALL non-terminal steps (for delivery-type workflows). Add enforcement: only one step can have this flag — toggling it on one step auto-clears it from all others.

### 2. Add per-step capability indicators (`AdminWorkflowManager.tsx`)

Below each step's behavior toggles, render a compact capability bar:

```text
Step: accepted
  ❌ Delivery not started — Delivery OTP unavailable
  ✅ Generic OTP available

Step: picked_up
  🚚 Delivery starts here
  ✅ Delivery OTP available
  ✅ Generic OTP available
```

Logic: walk `editSteps` in sort order, track whether `creates_tracking_assignment` has been seen. Show capability chips per step.

### 3. Replace OTP toast validation with inline blocking (`AdminWorkflowManager.tsx`)

Remove the save-time toast + return pattern (lines 222-238). Instead, show a persistent inline warning directly below the OTP Type dropdown when `otp_type = 'delivery'` is selected on a pre-tracking step. The save button itself should be disabled if any step has an invalid OTP configuration, with the reason shown.

### 4. Add "Delivery starts here" marker to `WorkflowFlowDiagram.tsx`

In the flow diagram node rendering, if a step has `creates_tracking_assignment = true`, show a 🚚 badge/label below the node: "Delivery starts". This makes the delivery start point visible at a glance in the visual timeline.

### 5. Smart guidance in OTP dropdown (`AdminWorkflowManager.tsx`)

When admin selects "Delivery OTP" on a step, if no prior step has tracking, show an inline helper directly in the dropdown area:

```text
⚠️ Delivery OTP cannot work here.
Delivery starts at: [step name] (or "not configured")
→ Use Generic OTP instead, or move this to a later step.
```

This replaces the current tooltip-only warning (lines 659-681) with a visible, always-rendered message block.

## Files

| File | Change |
|---|---|
| `src/components/admin/AdminWorkflowManager.tsx` | Decouple tracking toggle, add capability indicators, inline OTP validation, smart guidance, single-tracking enforcement |
| `src/components/admin/workflow/WorkflowFlowDiagram.tsx` | Add "Delivery starts" marker on nodes with `creates_tracking_assignment` |

## What stays the same
- All DB triggers and RPCs unchanged
- `OrderDetailPage.tsx` unchanged
- Generic OTP components unchanged
- Transition rules editor unchanged

