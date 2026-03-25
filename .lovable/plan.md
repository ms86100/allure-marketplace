

# Resize Screenshots for App Store Submission

## What
Take your 10 iPhone 11 screenshots and resize them to all 3 required App Store sizes.

## Input
10 screenshots from iPhone 11 (828×1792 native resolution)

## Output
30 images total — each screenshot in 3 sizes:

| Size | Resolution | Folder |
|------|-----------|--------|
| 6.7" | 1290×2796 | `/mnt/documents/appstore-screenshots/6.7/` |
| 6.5" | 1284×2778 | `/mnt/documents/appstore-screenshots/6.5/` |
| 5.5" | 1242×2208 | `/mnt/documents/appstore-screenshots/5.5/` |

## Method
- Copy all 10 uploaded images to `/tmp/`
- Use Python Pillow to resize each image to the 3 target resolutions using high-quality Lanczos resampling
- Save as PNG to preserve quality
- Output to `/mnt/documents/` for download

## File Naming
Each screenshot will be numbered 01-10 matching the upload order:
- `screenshot_01.png` through `screenshot_10.png` in each size folder

