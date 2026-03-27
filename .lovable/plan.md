

# Make Category Card Images More Rounded

## Problem
The current images use `rounded-xl` (12px border-radius). In the reference screenshot (image 1), the images have significantly more rounded corners — closer to 16–20px, giving a softer, pill-like look.

## Fix — `src/components/home/CategoryImageGrid.tsx`

Change image container corners from `rounded-xl` to `rounded-2xl` (16px) in three places:

| Line | Current | New |
|------|---------|-----|
| 115 | `rounded-xl` (2-image grid items) | `rounded-2xl` |
| 129 | `rounded-lg` (single image) | `rounded-2xl` |
| 133 | `rounded-lg` (icon fallback) | `rounded-2xl` |

One file, three class swaps. That's it.

| File | Change |
|------|--------|
| `src/components/home/CategoryImageGrid.tsx` | Replace `rounded-xl`/`rounded-lg` with `rounded-2xl` on all image containers |

