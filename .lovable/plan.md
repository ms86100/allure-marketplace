

# Add SOCIVA Branding to iOS Launch Screen

## Problem

The iOS launch screen (shown during app startup before React mounts) is a plain dark navy (`#1a1a2e`) rectangle — no logo, no text, no branding. The current Codemagic pipeline (line 156-184) intentionally removes the default Capacitor splash image and sets a solid background, but never adds the SOCIVA branding back.

Apple requires visual consistency between the app icon and launch screen. A blank colored screen risks rejection.

## Solution

Modify the Codemagic pipeline's "Patch LaunchScreen" step to inject a centered SOCIVA logo into the storyboard. Two approaches:

### Approach: Generate a branded splash PNG and inject it as a storyboard image

1. **Generate `splash-logo.png`** in the pipeline — use `sips` + `ImageMagick` (available on Codemagic macOS) to rasterize the SVG or compose a centered "SOCIVA" text image on the dark navy background at 3x resolution (1290×2796 for iPhone 15 Pro Max)
2. **Create a new `SplashLogo.imageset`** in `Assets.xcassets` with the generated PNG at 1x/2x/3x scales
3. **Inject an `<imageView>`** into the LaunchScreen storyboard XML positioned center-x, center-y with the `SplashLogo` image asset
4. **Add Auto Layout constraints** so the logo stays centered on all screen sizes

### Pipeline changes (`codemagic.yaml`, lines 156-184)

After the existing background color patch, add:

1. Create `SplashLogo.imageset/Contents.json` referencing 3 scale variants
2. Generate the splash logo PNG using ImageMagick `convert` — white "SOCIVA" text with green S and V on transparent background, sized ~200pt wide
3. Copy into the imageset at 1x (200px), 2x (400px), 3x (600px)
4. Inject `<imageView>` XML into the storyboard after the existing `<view>` tag, with `contentMode="scaleAspectFit"` and center constraints
5. The logo should match the app icon: "SOCIVA" with the S and V in emerald green (#10b981), rest in white/light gray (#e8e8e8)

### Alternative (simpler): Use a pre-built PNG

Instead of generating at build time, commit a `ios-config/splash-logo@3x.png` to the repo and have the pipeline copy it into the asset catalog. This is more reliable than runtime text rendering.

| File | Change |
|------|--------|
| `ios-config/splash-logo.png` | New: pre-rendered SOCIVA logo (transparent bg, ~600px wide) for launch screen |
| `codemagic.yaml` (lines 156-184) | Extend the LaunchScreen patch step: create SplashLogo.imageset, inject imageView + constraints into storyboard XML |

### Expected result

```text
┌─────────────────────┐
│                     │
│                     │
│                     │
│      SOCIVA         │  ← S and V in green, OCI A in white
│                     │     centered on dark navy #1a1a2e
│                     │
│                     │
└─────────────────────┘
```

Matches the app icon branding exactly. No more blank screen during load.

