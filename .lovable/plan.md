
# Rework Category Cards with a New Visual Direction

## Why the current version still feels wrong
The card still uses a large `aspect-[4/3]` image block with edge-to-edge `object-cover` photos. Even with reduced corner radius, that makes the image feel tall, glossy, and “mirror-like.”

## New implementation approach
Instead of trying to tweak the current layout again, I would change the card structure in `src/components/home/CategoryImageGrid.tsx`:

### 1. Replace the tall image area with a short media strip
- Remove the `aspect-[4/3]` image block
- Use a fixed shallow height like `h-20` / `h-22`
- This immediately reduces the oversized image feel

### 2. Stop using full-bleed images
- Do **not** let photos fill the whole card area
- Render 1–2 product thumbnails inside smaller “glass capsules” or tiles
- Use `object-contain` or tightly framed thumbnail boxes instead of large `object-cover` panels
- This avoids the mirror/oval visual completely

### 3. Keep glassmorphism on the outer card only
- Outer tile stays frosted/glass:
  - tinted pastel background
  - `backdrop-blur`
  - soft highlight border
  - subtle glow/shadow
- Inner thumbnails should look like floating content inside the glass card, not like the card itself is an image frame

### 4. Move emphasis to label + category identity
- Make the bottom of the card the focus:
  - category name
  - optional product count / “Explore”
- Let the imagery become supporting decoration, not the dominant block

### 5. Improve visual proportions
Planned proportions:
```text
┌─────────────────────┐
│  [thumb]  [thumb]   │  ← short media strip
│                     │
│  Home Food          │
│  24 items     >     │
└─────────────────────┘
```

This will feel more like a compact discovery tile and less like a photo card.

## File to update
- `src/components/home/CategoryImageGrid.tsx`

## Exact code-level changes
- Replace `aspect-[4/3]` media wrapper with a short fixed-height row
- Remove edge-to-edge image rendering
- Wrap thumbnails in smaller rounded containers (`rounded-lg` / `rounded-xl`)
- Keep frosted glass only on the card shell
- Shift text into a dedicated lower content area
- Update skeleton state to match the new shorter card height

## Result
- Less image height
- No “mirror” look
- Stronger glassmorphism
- Cleaner, more premium category tiles
- Better match for a compact marketplace discovery UI

## Validation
I would verify:
- cards look shorter on desktop and mobile
- images no longer dominate the tile
- fallback icon still looks good when no product image exists
- category names remain readable with long labels
