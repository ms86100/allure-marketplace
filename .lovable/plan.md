

## Issue 1: Navigation Break from Activity Card (Critical App Store Blocker)

### Root Cause

The global `ErrorBoundary` in `src/App.tsx` wraps the entire component tree **including** `HashRouter`. When any error bubbles up from the order detail page (e.g., a rendering error in `DeliveryMapView`, `LiveDeliveryTracker`, or any hook failure during cold-start deep link navigation), the `ErrorBoundary` catches it and replaces the **entire app** — including the router — with its error UI.

Once the `ErrorBoundary` is in `hasError: true` state:
- The `HashRouter` is unmounted, so all React Router context is gone
- "Go Home" does `window.location.hash = '#/auth'` + `window.location.reload()` — this reloads the whole app, but if the underlying error persists (e.g., stale auth token, cache issue), it crashes again immediately
- There is **no way to recover without a full reload**, and the error state persists across navigation attempts

The specific crash likely originates from the order detail page during a cold-start deep link (Dynamic Island tap → `sociva://orders/{id}` → app launches → auth not yet hydrated → hooks try to use uninitialized context → error bubbles to global boundary).

Additionally, the `OrderDetailPage` route at line 348 does NOT have a `RouteErrorBoundary` wrapper, unlike Cart, Society pages, etc. This means any error in the order detail page bypasses the recoverable boundary and hits the global kill-all boundary.

### Fix

1. **Wrap `/orders/:id` route with `RouteErrorBoundary`** in `src/App.tsx` — this catches errors locally and allows retry/go-back without killing the entire app.

2. **Add error recovery to global `ErrorBoundary`** in `src/components/ErrorBoundary.tsx`:
   - "Go Home" should reset state (`hasError: false`) and navigate via `window.location.hash = '#/'` + reload, not `#/auth`
   - Add a `resetErrorBoundary` method that clears state so the app can re-render normally

3. **Guard the deep link consumer** in `AppRoutes` (line 321-331): the `consumePendingDeepLink` + `navigate` runs after only 100ms. If the order detail page's dependencies (auth, flow data) aren't ready, the page crashes. Increase the guard to check that `profile` is also loaded before navigating.

4. **Also wrap the `/orders` route** with `RouteErrorBoundary` for consistency.

### Files to Edit
- `src/App.tsx` — add `RouteErrorBoundary` to order routes + fix deep link timing
- `src/components/ErrorBoundary.tsx` — improve recovery flow

---

## Issue 2: Dynamic Island Display — "SV" Instead of "Sociva"

### Root Cause

Looking at the screenshot, the Dynamic Island compact leading view shows a circular image that appears to render as "SV" text rather than the Sociva icon. The `compactLeading` section (line 169-174 of `LiveDeliveryWidget.swift`) uses:

```swift
Image("SocivaIcon")
    .resizable()
    .scaledToFit()
    .frame(width: 20, height: 20)
    .clipShape(Circle())
```

The issue is that `Image("SocivaIcon")` looks for an image in the **widget extension's** asset catalog, not the main app's. If the `SocivaIcon` asset wasn't copied into the widget extension target's `Assets.xcassets`, iOS falls back to rendering a placeholder — which appears as the app's initials "SV" (from Sociva's first two characters or the app icon's monogram fallback).

The `compactLeading` area on the Dynamic Island is extremely small (~20pt circle). Even if the icon is found, it may be too detailed to be legible at that size. The "S" having low visibility suggests the icon's dark colors blend with the Dynamic Island's dark background.

### Fix

1. **Ensure `SocivaIcon` is in the widget extension's asset catalog** — this is a native Xcode configuration issue, not a code bug. Update the build instructions/CI pipeline to copy the asset.

2. **Add a high-contrast fallback** in `LiveDeliveryWidget.swift` for the compact view: use a simple text label with a colored background circle as a fallback when the image doesn't load, and ensure the icon has sufficient contrast for the tiny 20pt circle.

3. **Use `contentMode: .fill`** instead of `.scaledToFit()` for the compact leading — `.scaledToFit()` can leave empty space in a 20x20 frame if the aspect ratio doesn't match.

4. **Add padding to the compact icon** and consider using a solid background circle behind it for better visibility.

### Files to Edit
- `native/ios/LiveDeliveryWidget.swift` — update compact leading/minimal views with contrast-safe rendering and text fallback

---

## Technical Details

### Issue 1 — Specific code changes:

**`src/App.tsx` line 348** — wrap order detail:
```tsx
<Route path="/orders/:id" element={
  <ProtectedRoute>
    <RouteErrorBoundary sectionName="Order Details">
      <OrderDetailPage />
    </RouteErrorBoundary>
  </ProtectedRoute>
} />
```

**`src/App.tsx` lines 321-331** — strengthen deep link guard:
```tsx
useEffect(() => {
  if (!user || !profile) return; // Wait for full hydration
  const timer = setTimeout(() => {
    const pendingPath = consumePendingDeepLink();
    if (pendingPath) {
      deferredNavigate(pendingPath, { replace: true });
    }
  }, 300); // Increase from 100ms to 300ms
  return () => clearTimeout(timer);
}, [user, profile, deferredNavigate]);
```

**`src/components/ErrorBoundary.tsx`** — fix "Go Home" to navigate to root, not auth:
```tsx
private handleGoHome = () => {
  this.setState({ hasError: false, error: null });
  window.location.hash = '#/';
  // Force reload only if state reset doesn't recover
  setTimeout(() => window.location.reload(), 100);
};
```

### Issue 2 — Specific code changes:

**`native/ios/LiveDeliveryWidget.swift` compact leading** — add contrast background and text fallback:
```swift
compactLeading: {
    ZStack {
        Circle()
            .fill(Color.white.opacity(0.15))
            .frame(width: 24, height: 24)
        Image("SocivaIcon")
            .resizable()
            .scaledToFill()
            .frame(width: 20, height: 20)
            .clipShape(Circle())
    }
}
```

And update **minimal** view similarly.

Also add documentation note about ensuring `SocivaIcon` is added to the widget extension target's `Assets.xcassets` in Xcode — this is the most likely cause of the "SV" fallback.

