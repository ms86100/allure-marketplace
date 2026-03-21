

# Fix Dynamic Island Compact Leading: SocivaIcon Visibility

## Problem

In the Dynamic Island compact view, the "SV" logo circle has two issues:
1. The "S" letter is invisible — it's likely a dark color (dark green or black) on the dark `Color.white.opacity(0.15)` background, making it blend in
2. The circle background is too dark/transparent to create proper contrast

The "V" appears green and visible because it happens to be a brighter shade, but the overall circle needs better contrast.

## Root Cause

The `compactLeading` view (lines 169-181) uses:
- `Circle().fill(Color.white.opacity(0.15))` — nearly invisible dark circle on the Dynamic Island's black background
- The `SocivaIcon` asset likely has dark-colored letters that don't contrast against this

## Fix

Replace the low-opacity circle with a more visible background that matches the brand. Two changes:

1. **Increase circle background opacity** from `0.15` to `0.25` to make the circle itself more visible
2. **Add a subtle border stroke** using the phase accent color so the circle "pops" on the black Dynamic Island surface

Apply the same fix to the `minimal` view (lines 196-203) for consistency.

### File: `native/ios/LiveDeliveryWidget.swift`

**compactLeading (lines 169-181):** Replace the ZStack with:
```swift
compactLeading: {
    let phase = OrderPhase.from(context.state.workflowStatus)
    ZStack {
        Circle()
            .fill(Color.white.opacity(0.25))
            .overlay(
                Circle()
                    .stroke(phase.accentColor.opacity(0.6), lineWidth: 1)
            )
            .frame(width: 24, height: 24)
        Image("SocivaIcon")
            .resizable()
            .scaledToFill()
            .frame(width: 20, height: 20)
            .clipShape(Circle())
    }
}
```

**minimal (lines 195-204):** Same treatment:
```swift
minimal: {
    let phase = OrderPhase.from(context.state.workflowStatus)
    ZStack {
        Circle()
            .fill(Color.white.opacity(0.25))
            .overlay(
                Circle()
                    .stroke(phase.accentColor.opacity(0.6), lineWidth: 1)
            )
        Image("SocivaIcon")
            .resizable()
            .scaledToFill()
            .clipShape(Circle())
            .padding(2)
    }
}
```

> **Note to user:** If the "S" is still hard to see after this change, the root issue is in the `SocivaIcon` asset itself in the widget extension's `Assets.xcassets`. You may need a variant of the icon with lighter/brighter letters specifically for the Dynamic Island's dark context (e.g., white "S" + green "V" on transparent background).

