

# Fix: DeliveryArrivalOverlay — Center on screen and make compact

## Problem
The overlay is positioned with `items-end pb-24` which pushes it to the bottom. It's also too wide (`max-w-md`) and has oversized elements (large icon, generous padding).

## Fix — Single file change: `DeliveryArrivalOverlay.tsx`

1. **Center vertically**: Change `items-end pb-24 pt-4` → `items-center` on the outer container
2. **Reduce width**: `max-w-md` → `max-w-sm` (384px → 320px range)
3. **Compact header**: Shrink pulsing icon from `w-16 h-16` → `w-12 h-12`, MapPin from 28 → 20, reduce padding `p-4` → `p-3`, title from `text-lg` → `text-base`, margin `mb-3` → `mb-2`
4. **Compact body**: Reduce padding `p-4` → `p-3`, spacing `space-y-3` → `space-y-2`, OTP text from `text-2xl` → `text-xl`
5. **Smaller dismiss button**: `w-10 h-10` → `w-8 h-8`

These are purely CSS/sizing changes in one file.

