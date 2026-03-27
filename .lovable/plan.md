

# Fix LaunchScreen: Remove Capacitor Logo + Apply Dark Navy Background

## Problem

The current `codemagic.yaml` sed patch only changes the background color in the storyboard XML, but **does not remove the Capacitor splash image** (`imageView` element). Capacitor's default `LaunchScreen.storyboard` contains an `<imageView>` referencing a "Splash" asset — that's the blue "X" logo you're seeing on a white screen.

The background color sed replacements may also not be matching because the actual XML uses a different color format than expected.

## Fix

Update the "Patch LaunchScreen" step in `codemagic.yaml` to:

1. **Remove the imageView entirely** — use `sed` to delete lines containing the Capacitor splash imageView (the `<imageView` through its closing tag)
2. **Force the background color** — instead of trying to match exact color strings, use a more aggressive pattern that catches any `backgroundColor` element and replaces it
3. **Delete the Splash image asset** — remove `ios/App/App/Assets.xcassets/Splash.imageset/` so Xcode doesn't even have the image available

### Concrete sed approach

```bash
# Delete the imageView block (splash logo)
sed -i '' '/<imageView.*image="Splash"/,/<\/imageView>/d' "$STORYBOARD"

# Also remove any standalone imageView reference
sed -i '' '/image="Splash"/d' "$STORYBOARD"

# Force background color by replacing ANY backgroundColor element
sed -i '' 's|<color key="backgroundColor"[^/]*/> |<color key="backgroundColor" red="0.102" green="0.102" blue="0.180" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>|g' "$STORYBOARD"

# Remove the Splash image asset entirely
rm -rf ios/App/App/Assets.xcassets/Splash.imageset/
```

## Result

After this fix:
- Launch screen = solid dark navy (#1a1a2e) with no logo — clean, matches the app icon background
- No Capacitor branding visible
- No toolsVersion mismatch (we're still patching, not replacing)

## File

| File | Change |
|------|--------|
| `codemagic.yaml` | Rewrite the "Patch LaunchScreen" step to remove imageView + force color + delete Splash asset |

