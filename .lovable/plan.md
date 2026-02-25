

# Hide Society Tab When No Features Are Enabled

## Problem
After the strict entitlement fix, societies without a package assignment have all features disabled. However, the "Society" tab in the bottom navigation is still visible, leading residents to a page with no functional content.

## Solution
Add a conditional check in `BottomNav` that hides the Society tab when the society has zero enabled features. The `useEffectiveFeatures` hook already provides the full feature list with `is_enabled` status.

## Implementation

### File: `src/components/layout/BottomNav.tsx`

**Change**: Filter out the Society nav item (`/society`) when no features are enabled for the current society.

Logic:
```
const hasAnyFeature = features.some(f => f.is_enabled);
```

Then in the `visibleItems` filter, additionally exclude the Society tab when `hasAnyFeature` is false.

The resident nav items array already marks Society without a `featureKey`, so the filtering needs a small addition: tag the Society item with a special marker (e.g., `requiresAnyFeature: true`) or handle it inline in the filter.

**Approach**: Inline filter — if `to === '/society'` and no features are enabled, exclude it. This avoids changing the nav item type definition.

### File: `src/components/home/SocietyQuickLinks.tsx`

**Change**: Also hide the "Your Society" quick links section on the home page when no features are enabled. The component already returns `null` when `visibleLinks.length === 0`, but since the feature check now returns all-disabled, this should already work. Will verify.

### No other files modified.

