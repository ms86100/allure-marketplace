

# Fix Category Cards: Light Pastel Backgrounds + Correct Image Proportions

## Problems

1. **Dark card backgrounds**: The gradient uses `${catColor}20` (8% opacity overlay on dark card background) — on dark theme this is barely visible, losing all visual separation
2. **Images too tall**: `aspect-square` card with images filling `h-full` makes them vertically stretched
3. **No visual grouping**: Cards blend into the dark background without distinct colored containers

## Fix — Single file change: `CategoryImageGrid.tsx`

### 1. Category color map (light pastels)
Add a mapping from category slug → pastel background color. These are always light regardless of theme:

```typescript
const CATEGORY_PASTELS: Record<string, string> = {
  home_food: '#E8F5E9',
  bakery: '#FFF3E0',
  snacks: '#FFF8E1',
  groceries: '#E3F2FD',
  beverages: '#E0F2F1',
};
const DEFAULT_PASTEL = '#F5F5F5';
```

### 2. Card background
Replace the dark gradient with a solid light pastel + subtle shadow:
- `backgroundColor: pastelColor`
- Add `shadow-sm` for depth
- Keep `rounded-2xl` and `p-3`

### 3. Fix image proportions
- Change image container from `h-full` (fills square) to a fixed height: `h-20` (80px)
- Images use `object-cover` with `rounded-xl` and `aspect-square` constraint
- This prevents the tall/stretched look

### 4. "+X more" badge
- Dark overlay style: `bg-black/60 text-white text-[10px]`

### 5. Title styling
- `text-[13px] font-medium text-gray-900` (always dark text on light pastel card — not theme-dependent)

### Card structure after fix:
```text
┌─────────────────────────┐  ← pastel bg, rounded-2xl, p-3, shadow-sm
│  ┌──────┐  ┌──────┐     │
│  │ IMG1 │  │ IMG2 │     │  ← h-20, object-cover, rounded-xl
│  └──────┘  └──────┘     │
│                  +8 more │
│   Category Name          │  ← 13px, medium weight, dark text
└─────────────────────────┘
```

## File

| File | Change |
|------|--------|
| `src/components/home/CategoryImageGrid.tsx` | Pastel backgrounds, fixed image height, dark-on-light text, badge restyle |

