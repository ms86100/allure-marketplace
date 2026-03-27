

# Fix Category Card Image Aspect Ratio — Blinkit Style

## Problem

The 2-image side-by-side layout inside an `aspect-square` container makes each individual image extremely tall and narrow (~1:2 ratio). This looks unnatural — stretched, oval-shaped product photos.

The Blinkit reference (image 2) uses: **single product image per card**, centered, with consistent square proportions and clean whitespace. Much cleaner.

## Fix — `src/components/home/CategoryImageGrid.tsx`

Replace the current 2-image split layout with a **single hero image** per card, matching Blinkit's clean proportions:

1. **Single image per card**: Show only the first image (not two side-by-side). This eliminates the narrow/stretched problem entirely.

2. **Fixed aspect ratio**: Use `aspect-square` on the single image container — one image filling a square, properly `object-cover`'d. No stretching possible.

3. **Rounded corners**: Use `rounded-xl` on images for a clean, modern look matching the card's `rounded-2xl`.

4. **Badge repositioned**: The "+X more" badge stays at bottom-right of the image.

5. **Fallback icon**: No change needed — already uses `aspect-square`.

### Code change (lines 111-142)

```tsx
{/* Image area */}
<div className="relative aspect-square">
  {images.length >= 1 ? (
    <img
      src={images[0]}
      alt={cat.displayName}
      className="w-full h-full object-cover rounded-xl"
      loading="lazy"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center rounded-xl bg-white/50">
      <DynamicIcon name={cat.icon} size={32} className="text-gray-500" />
    </div>
  )}

  {meta.count > 1 && (
    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
      +{meta.count - 1} more
    </div>
  )}
</div>
```

### Why this is bulletproof

- **One image = one aspect ratio**. No flex splitting, no half-width distortion.
- `aspect-square` + `object-cover` guarantees the image always fills a perfect square regardless of the source image dimensions.
- Works identically on every screen width — the grid column width determines the square size, the image just fills it.

| File | Change |
|------|--------|
| `src/components/home/CategoryImageGrid.tsx` | Replace 2-image split with single hero image; `aspect-square` + `object-cover` + `rounded-xl`; badge shows "+N more" based on total count minus 1 |

