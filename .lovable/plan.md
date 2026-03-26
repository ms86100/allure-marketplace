

# Replace App Icon With the Uploaded SVG Design

## What you gave me

A clean, dark-background wordmark: **SOCIVA** with the **S** and **V** in emerald green (#10b981), rest in light gray, on a deep navy gradient (#1a1a2e → #16213e). Rounded corners. Minimal, professional.

## What I'll do

1. **Copy the SVG** to `public/sociva_app_icon_2.svg`
2. **Generate all required PNG sizes** from it using a script (PIL/cairosvg):
   - `app-icon-1024x1024.png` — master icon (Codemagic CI uses this)
   - `android-chrome-512x512.png`
   - `android-chrome-192x192.png`
   - `apple-touch-icon.png` (180×180)
   - `favicon-32x32.png`
   - `favicon-16x16.png`
   - `favicon.ico`
3. **Update `index.html`** — add proper `<link rel="icon">` tags if missing
4. **No code changes** — `manifest.json` already references the correct filenames

## Technical Note

The SVG uses `system-ui` font, which renders differently across platforms. The PNG rasterization will use a clean sans-serif fallback. The text-based wordmark icon works well at 192px+ but may become hard to read at 16px favicon size — at that scale I'll just use the "S" letter in green on the dark background for legibility.

## Files touched

| File | Action |
|------|--------|
| `public/sociva_app_icon_2.svg` | Copy from upload |
| `public/app-icon-1024x1024.png` | Regenerate |
| `public/android-chrome-*.png` | Regenerate |
| `public/apple-touch-icon.png` | Regenerate |
| `public/favicon-*.png` | Regenerate |
| `public/favicon.ico` | Regenerate |
| `index.html` | Add favicon link if missing |

