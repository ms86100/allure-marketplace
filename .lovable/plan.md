

# Redesign Store Location Search — Top-Anchored Full-Screen Flow

## Problem

The current implementation uses a bottom Drawer for the location search. On mobile, when the keyboard opens, it covers the search input and predictions dropdown, making it impossible to see what is being typed. The `useKeyboardViewport` adjustments are insufficient — the input remains obscured.

## Solution

Replace the bottom Drawer `pick` step with a **full-screen fixed overlay** that anchors the search input at the **top** of the screen. This guarantees visibility above the keyboard on all devices.

```text
┌──────────────────────────┐
│ ← Back    Set Location   │  ← Fixed top bar
│ ┌──────────────────────┐ │
│ │ 🔍 Search location...│ │  ← Input at top, always visible
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ Suggestion 1         │ │  ← Scrollable predictions list
│ │ Suggestion 2         │ │
│ │ Suggestion 3         │ │
│ └──────────────────────┘ │
│                          │
│ ─── or ───               │
│ [📍 Use Current Location]│
│                          │
│ (keyboard area)          │
└──────────────────────────┘
```

The `confirm` step (map + pin drag) stays in a Drawer since it has no text input and doesn't trigger the keyboard.

## Changes

**File: `src/components/seller/SetStoreLocationSheet.tsx`**

1. When `step === 'pick'`, render a **full-screen fixed overlay** (`fixed inset-0 z-50 bg-background`) portaled to `document.body` instead of a Drawer.
2. Pin the search input to the top with a header bar containing a back/close button and title.
3. Predictions render directly below the input in a scrollable list (not an absolute dropdown).
4. "Use Current Location" button sits below predictions.
5. Remove the `useKeyboardViewport` hook and all the complex viewport height/top calculations — they are no longer needed for the pick step.
6. When `step === 'confirm'`, continue using the Drawer for the map confirmation (no keyboard involved).
7. Auto-focus the search input when the overlay opens (safe since it's at the top).

This matches the standard mobile pattern (Google Maps, Uber, etc.) where location search is a full-screen page with input at top.

