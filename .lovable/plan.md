

# Fix Category Card Proportions: Bigger Images, Smaller Card

## Problem
The thumbnails (w-12/h-12) are too small relative to the card padding, making the card feel bloated with empty teal space. The overall look isn't intuitive.

## Changes — `src/components/home/CategoryImageGrid.tsx`

### 1. Increase thumbnail sizes
- Two-image layout: `w-12 h-12` → `w-14 h-14`
- Single-image layout: `w-14 h-14` → `w-16 h-16`
- Fallback icon container: same increase

### 2. Reduce card padding to shrink the outer shell
- Media strip: `px-2.5 pt-2.5 pb-1` → `px-1.5 pt-1.5 pb-0.5`
- Label area: `px-2 pb-2 pt-0.5` → `px-1.5 pb-1.5 pt-0`
- This tightens the card around the content, reducing the empty teal "frame"

### 3. Reduce card corner radius
- Outer card: `rounded-2xl` → `rounded-xl` (less bulky feel)

### Result
Thumbnails take up more of the card area, the teal background becomes a thin accent rather than a dominant frame, and the overall tile feels tighter and more purposeful.

| File | Change |
|------|--------|
| `src/components/home/CategoryImageGrid.tsx` | Increase image sizes, reduce padding + corner radius |

