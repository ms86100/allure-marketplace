

# Restructure Workflow Manager — Group by 4 Workflow Types

## Problem
The workflow manager currently shows a flat list of every `parent_group × transaction_type` combination (14+ rows). The user expects to see only the 4 supported workflow types, with parent-group-specific overrides nested underneath.

## Current state (from screenshots)
- Default / Cart Purchase
- Default / Contact Enquiry
- Default / Request Service
- Default / Service Booking
- Domestic Help / Service Booking
- Education Learning / Request Service
- Education Learning / Service Booking
- Events / Service Booking
- Home Services / Service Booking
- Personal Care / Service Booking
- Pets / Service Booking
- Professional / Service Booking

## Proposed UI

```text
┌─────────────────────────────────────────────┐
│ 🔀 Cart Purchase          10 steps          │
│    Default                                   │
├─────────────────────────────────────────────┤
│ 🔀 Contact Enquiry        4 steps           │
│    Default                                   │
├─────────────────────────────────────────────┤
│ 🔀 Request Service        6 steps           │
│    Default · Education Learning (8 steps)    │
├─────────────────────────────────────────────┤
│ 🔀 Service Booking        5 steps           │
│    Default · Domestic Help · Education       │
│    Learning · Events · Home Services ·       │
│    Personal Care · Pets · Professional       │
│    (7 overrides)                             │
└─────────────────────────────────────────────┘
```

Each card is **one of the 4 workflow types**, grouped by `transaction_type`. The `default` parent_group is the primary entry. Parent-group overrides are shown as compact badges/chips below. Clicking the card opens the default workflow; clicking an override chip opens that specific variant.

## Changes — 1 file

### `src/components/admin/AdminWorkflowManager.tsx`

1. **Group workflows by `transaction_type`** instead of rendering a flat list. Create a map: `transaction_type → WorkflowGroup[]`, with `default` sorted first.

2. **Render 4 cards** (one per transaction_type). Each card shows:
   - Transaction type as the primary title (e.g., "Cart Purchase")
   - Default workflow step count
   - Override chips for non-default parent_groups (e.g., "Domestic Help · 10 steps")
   
3. **Click behavior**:
   - Clicking the card body → opens the `default` parent_group editor
   - Clicking an override chip → opens that specific parent_group editor
   - Clone/New buttons remain as-is

4. **"+ New Workflow" dialog** stays the same — it creates a new parent_group override for one of the 4 types.

No database changes needed.

