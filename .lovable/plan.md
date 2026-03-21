

# Fix Plan: Live Activity Icon, Status Mismatch, and Deep Link Navigation Trap

## Issue 1: SocivaIcon Invisible in Dynamic Island and Lock Screen Card

**Root cause:** The `SocivaIcon` image asset in the widget extension has a dark "S" that's invisible against the Dynamic Island's black surface and the dark card background. Previous styling fixes (opacity, border) weren't enough because the asset itself has poor contrast.

**Fix:** Generate a new high-contrast SV badge image using AI image generation (white "S" + green "V" on transparent/dark background, optimized for small sizes). Then:
- Create a new edge function to generate the badge programmatically and save it
- OR more practically: generate the image via AI, save it as a project asset, and update the Swift widget to use a programmatically drawn `Text`-based fallback instead of relying on the image asset

**Recommended approach — Programmatic SV badge in Swift:**
Replace all `Image("SocivaIcon")` references in `LiveDeliveryWidget.swift` with a custom SwiftUI view `SocivaBadge` that draws "S" in white and "V" in green on a dark circular background. This eliminates the asset dependency entirely and guarantees visibility at all sizes.

### File: `native/ios/LiveDeliveryWidget.swift`
- Add a `SocivaBadge` SwiftUI view that renders "S" in `.white` and "V" in `.green` with a dark circle background
- Replace all 4 `Image("SocivaIcon")` usages with `SocivaBadge(size:)` 
- Remove the `Circle().fill(Color.white.opacity(0.25))` wrapper since the badge has its own background

---

## Issue 2: Incorrect Status Label on Live Activity Card

**Root cause:** The Swift `OrderPhase.title` property uses **hardcoded** labels like "Ready for Pickup" for the `ready` status. But the DB `display_label` for `ready` is simply **"Ready"**. The phrase "for Pickup" misleads the buyer into thinking pickup already happened.

Additionally, the `progress_stage` field from `buildLiveActivityData` contains the DB-backed `display_label` (e.g., "Ready"), but the widget **ignores it** for the main title — it only uses `progressStage` in the `contextualSubtitle` for the `.preparing` phase.

**Fix:** Make the widget prefer the `progressStage` field (which carries the DB `display_label`) over the hardcoded `phase.title` when available. This ensures the lock screen card shows the same label as the web app.

### File: `native/ios/LiveDeliveryWidget.swift`
- In the lock screen view (Row 2, line 261): Replace `Text(phase.title)` with `Text(context.state.progressStage ?? phase.title)`
- In the Dynamic Island expanded leading (line 135): Same change — prefer `progressStage` over `phase.title`
- Update `OrderPhase.title` for `.ready` from "Ready for Pickup" to just "Ready" as a safe fallback

Also in `src/services/liveActivityMapper.ts`: The `mapProgressStage` function only returns DB `display_label` when the status is NOT a transit status. For `ready`, it correctly returns the DB label. But verify it's actually being passed through — the `progress_stage` field should carry "Ready" for the `ready` status. ✅ Confirmed: `mapProgressStage("ready", flowMap)` returns `entry.display_label` = "Ready" from the DB.

---

## Issue 3: Navigation Trap When Entering via Live Activity Card (Critical)

**Root cause:** When the user taps the Live Activity card, iOS opens the app via the deep link URL `sociva://orders/{id}`. The deep link handler in `useDeepLinks.ts` calls `navigate(path)` which **pushes** `/orders/{id}` onto the router. However, on a **cold start** (app was killed), the router has no prior history — so `window.history.length` is 1 or 2.

The back button logic on `OrderDetailPage.tsx` line 191:
```tsx
if (window.history.length > 1) { navigate(-1); } else { navigate('/'); }
```

On cold start from a deep link, `window.history.length` is 2 (initial page + deep link navigation), so `navigate(-1)` fires. But `-1` goes back to the **blank initial route** or the same deep link URL, causing a reload loop.

**Fix:** Instead of checking `window.history.length > 1`, use a more reliable detection: check if there's a meaningful previous route. The cleanest fix is:

1. **In `OrderDetailPage.tsx`**: Always navigate to a known safe route (`/orders` or `/`) when the back button is pressed from a deep-linked entry. Detect deep-link entry by checking if `window.history.state?.idx <= 1` (React Router stores the history index).

2. **Alternative (simpler)**: Change the back button to always go to `/orders` (the orders list) as a safe destination, since `navigate(-1)` is unreliable when entering via deep links. This aligns with the memory note about post-payment integrity preferring explicit routes.

### File: `src/pages/OrderDetailPage.tsx`
- Line 191: Replace `if (window.history.length > 1) { navigate(-1); } else { navigate('/'); }` with:
  ```tsx
  const historyIdx = (window.history.state as any)?.idx;
  if (typeof historyIdx === 'number' && historyIdx > 0) {
    navigate(-1);
  } else {
    navigate('/orders', { replace: true });
  }
  ```
  React Router's `history.state.idx` is `0` for the first entry and increments. If `idx` is 0 or undefined (cold start / deep link), we go to `/orders` instead of `-1`.

---

## Summary of Changes

| File | Change |
|------|--------|
| `native/ios/LiveDeliveryWidget.swift` | Replace `Image("SocivaIcon")` with programmatic `SocivaBadge` view; prefer `progressStage` over hardcoded `phase.title`; fix `.ready` fallback label to "Ready" |
| `src/pages/OrderDetailPage.tsx` | Fix back navigation to use `history.state.idx` instead of `history.length` for reliable deep-link detection |

