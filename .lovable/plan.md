

# Blinkit-Style Category Cards for CategoryImageGrid

## What changes

The `CategoryImageGrid` component gets a visual upgrade to match the Blinkit "Frequently bought" card pattern from the reference screenshot.

### Design principles from the reference
- **Colored card background**: Each category card has a distinct tinted background (using the category's `color` from DB)
- **2-image layout inside card**: Two product images side by side with rounded corners and padding inside the card
- **"+X more" badge**: A count badge overlaid at the bottom of the image area showing remaining items
- **Larger card size**: 3-column grid (not 4) — gives each card more breathing room and makes images scannable
- **Label below**: Bold, centered, multi-line text below the card
- **Consistent padding and rounded corners**: ~12px padding inside card, 2xl border radius

### Changes to `src/components/home/CategoryImageGrid.tsx`

1. **Grid**: Change from `grid-cols-4` to `grid-cols-3` on mobile (keep `md:grid-cols-4 lg:grid-cols-5`)
2. **Card background**: Use `cat.color` with low opacity as a gradient background (same pattern already used in `MarketplaceSection` line 375: `linear-gradient(160deg, ${catColor}18 ...)`)
3. **Image layout**: Always show 2 images side-by-side (instead of 2×2 grid) — simpler, more like the reference. Images get `rounded-xl` with a small gap
4. **"+X more" badge**: Show `+${meta.count - 2} more` as a small pill overlaid on the bottom-center of the image area when count > 2
5. **Aspect ratio**: Change from `aspect-[4/3]` to `aspect-square` for the card — taller cards like the reference
6. **Label styling**: Slightly larger text (`text-xs` instead of `text-[11px]`), with `mt-2` spacing

### Files

| File | Change |
|------|--------|
| `src/components/home/CategoryImageGrid.tsx` | Restyle cards to Blinkit pattern |

