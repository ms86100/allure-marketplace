

# Fix: Splash Video Not Filling Viewport

## Problem
The splash video uses `object-contain`, which letterboxes the video on viewports whose aspect ratio differs from the video's native ratio. On desktop (wide) the video appears small with large black bars. On mobile (tall) it would also not fill the screen.

## Fix
Change the video's `object-fit` from `object-contain` to `object-cover` in `AppSplashScreen.tsx` (line 87). This ensures the video always fills the entire viewport on any device — desktop or mobile — by scaling up and cropping edges if needed, rather than shrinking to fit.

Also set `background-color: #000` on the container (line 74) to match the video's black background, so any brief flash before the video loads blends seamlessly.

### File: `src/components/splash/AppSplashScreen.tsx`
- Line 74: Change `backgroundColor: '#1a1a2e'` → `backgroundColor: '#000000'`
- Line 87: Change `object-contain` → `object-cover`

Two lines, one file. The video will now fill the entire screen edge-to-edge on all aspect ratios.

