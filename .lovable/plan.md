

# Blinkit Dark Aesthetic — Cosmetic-Only Restyling Plan

All content, labels, sections, routes, and functionality remain exactly as they are. Only colors, spacing, typography, shadows, border-radius, and visual treatments change.

---

## 1. CSS Variables — Dark Theme Overhaul

**File**: `src/index.css` (`.dark` block, lines 85-159)

Update dark mode CSS variables to match the specified palette:

```
--background: 0 0% 6%          → #0F0F0F (near-black)
--foreground: 0 0% 100%        → #FFFFFF

--card: 0 0% 15%               → #262626 range
--card-foreground: 0 0% 100%

--popover: 0 0% 15%
--popover-foreground: 0 0% 100%

--primary: 145 83% 34%         → #0FA84F (vibrant green)
--primary-foreground: 0 0% 100%

--secondary: 0 0% 17%          → dark gray cards
--secondary-foreground: 0 0% 82%

--muted: 0 0% 17%              → #2A2A2A
--muted-foreground: 0 0% 55%   → #888888-#AAAAAA range

--accent: 145 83% 34%          → same vibrant green
--accent-foreground: 0 0% 100%

--border: 0 0% 100% / 0.05     → rgba(255,255,255,0.05)
--input: 0 0% 17%              → #2A2A2A

--warning: 38 95% 52%          → keep gold
--info: 195 100% 45%           → #00A8E8 blue
--favorite: 0 84% 60%          → red heart when filled
```

Update shadow variables:
```
--shadow-card: 0 2px 8px rgba(0,0,0,0.4)
--shadow-elevated: 0 8px 24px rgba(0,0,0,0.6)
```

Also update the **light theme** similarly (slightly adjusted to keep light mode usable but aligned with the specified tones).

---

## 2. Typography — System Font + Weight Adjustments

**File**: `src/index.css` (line 168) + `tailwind.config.ts` (fontFamily)

- Change font-family from `'Plus Jakarta Sans'` to `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (SF Pro on iOS, Roboto on Android).
- Remove the Google Fonts import on line 1 of `index.css`.

No text content changes — only the font rendering changes.

---

## 3. Product Card Restyling

**File**: `src/components/product/ProductListingCard.tsx`

Visual-only changes to the card wrapper and inner elements:

- **Card container** (line 204-210): Change `rounded-lg` to `rounded-2xl`. Change `border-border/30` to `border-[rgba(255,255,255,0.05)]`. Add subtle hover: `hover:scale-[1.02]`.
- **Image container** (line 214): Change `bg-muted/20` to a warm beige in light / cream-tinted dark bg: `bg-[#F5F0E8] dark:bg-[#2A2520]`. Change `rounded-md` to `rounded-xl`.
- **ADD button** (line 285-289): Change `border border-accent text-accent bg-card` to `bg-[#0FA84F] text-white border-0 shadow-[0_2px_8px_rgba(15,168,79,0.3)]`. Increase padding to `px-5 py-1`. Change `rounded-md` to `rounded-lg`. Font weight `font-bold`.
- **Quantity stepper** (line 275-283): Change `bg-accent` to `bg-[#0FA84F]`. Keep `+/-` in white.
- **Price text** (line 345): Change `text-xs` to `text-sm font-bold` for larger price display.
- **MRP strikethrough** (line 349): Keep `text-muted-foreground line-through`.
- **Discount text** (line 339): Change `text-primary` to `text-[#FF9966]` for orange discount percentage.
- **Product name** (line 304): Change `text-[10px]` to `text-[11px] font-semibold`.
- **Variant text badge** (line 299): Keep as-is (already small muted pill).

---

## 4. Category Image Grid Restyling

**File**: `src/components/home/CategoryImageGrid.tsx`

- **Grid tiles** (line 52-58): Change `rounded-2xl` to `rounded-xl`. Change `bg-muted` to `bg-[#F5F0E8] dark:bg-[#242424]`. Change `border-border/30` to `border-[rgba(255,255,255,0.05)]`.
- **Category label** (line 70): Change `text-[10px]` to `text-[11px] font-semibold`.

---

## 5. Parent Group Tabs Restyling

**File**: `src/components/home/ParentGroupTabs.tsx`

- **Active tab** (line 52-54): Change from `bg-foreground text-background` to `bg-[#0FA84F] text-white shadow-[0_2px_8px_rgba(15,168,79,0.3)]`. Remove `scale-105`.
- **Inactive tab** (line 55): Change `bg-card` to `bg-[#242424] dark:bg-[#1C1C1C]`. Change border to `border-[rgba(255,255,255,0.05)]`.
- **Tab text** (line 51): Change `text-xs` to `text-[11px]`.

---

## 6. Header Restyling

**File**: `src/components/layout/Header.tsx`

- **Search bar container** (around line 165-174): Change `bg-muted rounded-xl px-3 py-2.5` to `bg-[#2A2A2A] dark:bg-[#1C1C1C] rounded-2xl px-4 py-3`. Increase search icon size. Change placeholder text color to lighter gray.
- **Right-side icon buttons**: Change `bg-muted` to `bg-[#242424] dark:bg-[#1C1C1C]` with `border border-[rgba(255,255,255,0.05)]`.
- **Header background**: Keep `bg-background` (will be near-black via CSS variable changes).

---

## 7. Bottom Navigation Restyling

**File**: `src/components/layout/BottomNav.tsx`

- **Nav background** (line 56): Change `bg-background border-t border-border` to `bg-[#1A1A1A] border-t border-[rgba(255,255,255,0.08)]`.
- **Active state** (line 64-66): Change `text-primary` to an orange/peach gradient circle behind the icon. Use `bg-gradient-to-br from-[#FF9966] to-[#FF5E62]` as a small circle behind the active icon, with text in the same orange.
- **Inactive state**: Change `text-muted-foreground` to `text-[#888888]`.
- **Label size** (line 72): Change `text-[9px]` to `text-[10px]`.
- **Cart badge**: Keep existing badge, change `bg-primary` to `bg-[#0FA84F]`.

---

## 8. Floating Cart Bar Restyling

**File**: `src/components/cart/FloatingCartBar.tsx`

- **Bar background** (line 42): Change `bg-primary` to `bg-gradient-to-r from-[#0FA84F] to-[#18B05C]`. Add `shadow-[0_4px_16px_rgba(15,168,79,0.4)]`.
- **Product thumbnails** (lines 48-52): Change `rounded-md` to `rounded-full`. Add `border-2 border-white/20`.
- **Bar border-radius**: Change `rounded-xl` to `rounded-2xl`.
- **Text styling**: Keep existing text, increase "View Cart" to `font-bold text-sm`.

---

## 9. Featured Banners Restyling

**File**: `src/components/home/FeaturedBanners.tsx`

- **Banner card** (line 77-79): Change `rounded-2xl` to `rounded-3xl`. Change border to `border-[rgba(255,255,255,0.05)]`.
- **Dot indicators**: Keep as-is (already primary-colored active, border-colored inactive).

---

## 10. Society Quick Links Restyling

**File**: `src/components/home/SocietyQuickLinks.tsx`

- **Card tiles** (line 48): Change `bg-card border border-border/40 rounded-xl` to `bg-[#242424] dark:bg-[#1C1C1C] border border-[rgba(255,255,255,0.05)] rounded-2xl`.
- **Icon circles** (line 49): Keep existing color classes, they already use semantic tokens.

---

## 11. Community Teaser Restyling

**File**: `src/components/home/CommunityTeaser.tsx`

- **Cards** (line 79): Change `bg-card border border-border/40 rounded-xl` to `bg-[#242424] dark:bg-[#1C1C1C] border border-[rgba(255,255,255,0.05)] rounded-2xl`.
- **Help request card** (line 67): Keep `bg-warning/10 border-warning/20`, just change `rounded-xl` to `rounded-2xl`.

---

## 12. Shop By Store Cards Restyling

**File**: `src/components/home/ShopByStoreDiscovery.tsx`

- **Seller cards** (line 170-175): Change `rounded-2xl` to `rounded-2xl` (keep). Change `bg-card border border-border/30` to `bg-[#242424] dark:bg-[#1C1C1C] border border-[rgba(255,255,255,0.05)]`.
- **Image area** (line 177): Change `bg-muted/50` to `bg-[#F5F0E8] dark:bg-[#2A2520]` (warm beige/cream).

---

## 13. MarketplaceSection Product Listings

**File**: `src/components/home/MarketplaceSection.tsx`

- **Product card width** (line 211): Change `w-[140px]` to `w-[150px]` for slightly more breathing room.
- **Section gaps** (line 193): Change `space-y-5` to `space-y-7` for 28px section spacing.
- **Gradient fade** (line 223): Change `from-background` — this will auto-update via CSS variable.

---

## 14. Global Card Component

**File**: `src/components/ui/card.tsx`

- **Card** (line 7): Change `rounded-lg` to `rounded-2xl`. Change `shadow-sm` to `shadow-[0_2px_8px_rgba(0,0,0,0.3)]` in dark mode. Add `border-[rgba(255,255,255,0.05)]` in dark.

---

## 15. Global Button — ADD button green

**File**: `src/components/ui/button.tsx`

- **Default variant** (line 12): Keep `bg-primary text-primary-foreground` — the CSS variable change to `#0FA84F` handles this.
- No structural changes needed; the vibrant green comes from the CSS variable update.

---

## 16. Tailwind Config Updates

**File**: `tailwind.config.ts`

- Update `fontFamily.sans` to remove `Plus Jakarta Sans`, use `[system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif]`.
- Keep all other config as-is.

---

## Files Modified (cosmetic only)

```text
src/index.css                                    — CSS variables, font, shadows
tailwind.config.ts                               — Font family
src/components/ui/card.tsx                        — Border radius, dark shadow
src/components/product/ProductListingCard.tsx     — Card colors, image bg, ADD button, spacing
src/components/home/CategoryImageGrid.tsx         — Tile colors, radius
src/components/home/ParentGroupTabs.tsx           — Tab active/inactive colors
src/components/layout/Header.tsx                  — Search bar, icon button colors
src/components/layout/BottomNav.tsx               — Nav bg, active state orange gradient
src/components/cart/FloatingCartBar.tsx            — Green gradient, thumbnails rounded
src/components/home/FeaturedBanners.tsx            — Banner radius
src/components/home/SocietyQuickLinks.tsx          — Card bg/border
src/components/home/CommunityTeaser.tsx            — Card bg/border
src/components/home/ShopByStoreDiscovery.tsx       — Seller card colors
src/components/home/MarketplaceSection.tsx         — Spacing, card width
```

## What does NOT change

- All text labels, section headings, button labels
- All routes, navigation targets
- All sections present (SocietyQuickLinks, MarketplaceSection, CommunityTeaser remain)
- All icons (no additions or removals)
- All business logic, data fetching, auth
- Component structure and hierarchy
- No new components created
- No components removed

