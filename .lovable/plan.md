

# Generate AI-Powered Sociva App Icon

## Concept

A modern, minimal app icon that conveys **community + marketplace** using Sociva's brand palette (forest green #2D4A3E, emerald accents). The icon should work at all sizes (1024px down to 16px favicon) and look professional on both iOS and Android.

## Prompt Direction

A flat, modern app icon featuring an abstract leaf-and-community motif — interconnected shapes suggesting people/neighbors forming a circle or marketplace, rendered in deep forest green (#2D4A3E) and emerald (#10B981) on a clean white or soft cream background. Minimal, geometric, no text. Suitable for iOS/Android app stores. Rounded corners friendly.

## Execution Steps

1. **Generate the icon** using AI image generation (Gemini Pro Image model for highest quality) at 1024×1024
2. **QA the output** — inspect for clarity, color accuracy, and scalability
3. **Save to** `public/app-icon-1024x1024.png` (replacing current)
4. **Resize copies** for all required dimensions:
   - `android-chrome-512x512.png`
   - `android-chrome-192x192.png`
   - `apple-touch-icon.png` (180×180)
   - `favicon-32x32.png`
   - `favicon-16x16.png`

## Technical Details

- Uses `lovable_ai.py` script with `--image --model google/gemini-3-pro-image-preview`
- Resizing via Python PIL (`Pillow`) already available in sandbox
- All files written to `public/` directory, replacing existing placeholders
- No code changes needed — manifest.json already references these filenames

## Impact

- Zero risk — only replaces static image assets
- Codemagic CI already picks up `public/app-icon-1024x1024.png` for iOS builds

