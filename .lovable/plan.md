

# Glassy Dark UI — Blinkit-Style Redesign Plan

## Reference Analysis

The screenshots show a **dark-mode-first** design with these distinctive visual traits:

1. **Background**: Near-black (`#0D0D0D` / `#121212`), NOT the current slate-blue (`230 18% 7%`)
2. **Category tiles**: Dark charcoal cards (`#1A1A1A` / `#1E1E1E`) with subtle rounded borders, product images centered, labels below in white
3. **Search bar**: Semi-transparent warm-toned pill with brownish/amber border tint — a "frosted glass" feel
4. **Header**: Dark background blending into a blurred hero gradient (red/amber bokeh effect behind search bar)
5. **BuyAgainRow ("Frequently bought")**: Teal/dark-green cards (`~#1B4D3E`) with product thumbnails and "+N more" badges
6. **Section headers**: Bold white, large (`~18-20px`), left-aligned, generous top margin
7. **Tab bar (ParentGroupTabs)**: White icons/text on dark bg, active tab has a thick white underline below, NOT colored highlight
8. **Featured banners**: Themed with deep colors (green for Ramzan, orange for Ugadi), scalloped/decorative edges
9. **Overall feel**: High contrast, minimal borders, depth through background color differences rather than shadows

## What Needs to Change

### 1. Dark Theme Color System (`src/index.css`)
The current dark `--background` is slate-blue (`230 18% 7%`). The reference uses a warmer, nearly true-black tone.

- `--background`: Change from `230 18% 7%` → `0 0% 5%` (near `#0D0D0D`)
- `--card`: Change from `230 16% 11%` → `0 0% 11%` (warm dark grey `#1A1A1A`)
- `--secondary`: Change from `230 14% 15%` → `0 0% 14%`
- `--muted`: Change from `230 12% 15%` → `0 0% 13%`
- `--border`: Change from `230 12% 18%` → `0 0% 16%` (subtle grey borders)
- `--input`: Match secondary
- Remove blue/slate hue shifts — go neutral/warm-black throughout

### 2. Header — Glassy Search Bar (`src/components/layout/Header.tsx`)
- Add a warm-tinted glass effect to the search bar: `bg-amber-900/20 border-amber-700/30 backdrop-blur-sm`
- The header background should be transparent/dark with a subtle warm gradient overlay (simulating the bokeh blur from the reference)
- Remove the solid `bg-background` from header, use `bg-background/95 backdrop-blur-xl` instead for glass effect

### 3. Category Tiles — Dark Cards (`src/components/home/CategoryImageGrid.tsx`)
Current tiles use `bg-card` with `shadow-sm border border-border/30`. The reference shows:
- Darker card backgrounds: use `bg-[#1A1A1A] dark:bg-[#1A1A1A]` or simply `bg-card` (once card color is updated)
- Remove `shadow-sm` — reference has no visible shadow, depth comes from bg contrast
- Keep `rounded-2xl`, add `border border-white/5` for ultra-subtle edge
- Labels: white, `font-semibold text-[12px]`, centered below

### 4. BuyAgainRow — Teal Glass Cards (`src/components/home/BuyAgainRow.tsx`)
Current uses `bg-accent/40 dark:bg-accent/20`. Reference shows a rich teal (`~#1B4D3E`):
- Change card background to `bg-emerald-900/40 border border-emerald-700/20`
- "+N more" badge: use `bg-emerald-800/60 text-white text-[10px] font-bold` pill
- Category label below: white, semibold, centered

### 5. ParentGroupTabs — White Underline (`src/components/home/ParentGroupTabs.tsx`)
- Active state: white text + thicker underline (`h-[2px] w-8 bg-white`)
- Inactive: `text-white/50`
- Remove `text-primary` coloring on active — use plain white in dark mode

### 6. Section Headers
- Already `font-extrabold text-base` — increase to `text-lg` to match reference's bolder sizing
- Remove the icon containers next to headers (the colored squares) — reference shows plain bold text only

### 7. FeaturedBanners — Remove Border
- Remove `border border-border` from banner cards — reference shows borderless banners that bleed into the dark bg
- Keep `rounded-3xl overflow-hidden`

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Update dark theme CSS variables: shift from slate-blue to warm black |
| `src/components/layout/Header.tsx` | Glass header bg, warm-tinted search bar |
| `src/components/home/CategoryImageGrid.tsx` | Remove shadow, use subtle white/5 border, keep clean tile style |
| `src/components/home/BuyAgainRow.tsx` | Teal/emerald card bg, styled "+N more" badge |
| `src/components/home/ParentGroupTabs.tsx` | White underline active indicator, neutral text colors |
| `src/components/home/FeaturedBanners.tsx` | Remove border from banner cards |
| `src/components/home/MarketplaceSection.tsx` | Increase section header size to `text-lg`, remove icon containers from discovery headers |

## Constraints
- No new DB tables or data changes
- All visual — CSS variables + Tailwind classes only
- Light mode remains unaffected (changes scoped to `.dark` or dark-mode-aware utilities)
- No hardcoded data, no dummy content

