

# Fix: Emojis Rendered as Raw Text Instead of Lucide Icons

## The Problem

The app has a dual icon system that's inconsistent. The database stores **two types of icon values**:
- **Lucide icon names** (e.g. `ChefHat`, `Wrench`, `GraduationCap`) — used by most categories
- **Raw emojis** (e.g. `📝`, `🧹`) — used by a few categories and parent groups

The `DynamicIcon` component handles both correctly — it detects emojis and renders them as `<span>`, and renders Lucide names as proper icons. **But many places in the codebase don't use `DynamicIcon` at all** — they render `{config.icon}` directly as text, which means:
- Lucide names like `ChefHat` display as the literal text "ChefHat" instead of the icon
- Emojis display fine since browsers render them natively

### Places where icons are rendered as raw text (not through DynamicIcon)

| File | What's broken |
|------|--------------|
| `SellerProductsPage.tsx` (line 60) | Category select dropdown shows `{config.icon}` as text |
| `SellerProductsPage.tsx` (line 112) | Product placeholder shows `{icon \|\| '📦'}` as text |
| `SellerDetailPage.tsx` (line 464) | Category badge shows `{categoryInfo?.icon}` as text |
| `BulkProductUpload.tsx` (line 88) | Category select shows `{c.icon}` as text |
| `WorkerCategoryManager.tsx` (line 136) | Worker category card shows `{cat.icon}` as text |
| `SubcategoryManager.tsx` (line ~425) | Subcategory form shows emoji as text |
| `CategoryManager.tsx` (lines 276-283) | Admin category editor labels icons as "Emoji" but DB stores Lucide names |

### Database has 2 emoji icons that should be Lucide names
- `resume_writing` category: icon = `📝` → should be `FileEdit` or `PenLine`
- `domestic_help` parent group: icon = `🧹` → should be `Sparkles` or keep as emoji (DynamicIcon handles it)

## Fix Plan

### 1. Replace all raw `{icon}` renders with `<DynamicIcon>`

In every file listed above, replace inline `{config.icon}` / `{cat.icon}` text renders with `<DynamicIcon name={...} size={...} />`.

### 2. Fix the Admin CategoryManager icon input

The admin UI currently shows emoji presets and labels the icon field as "Icon (Emoji)". But the DB actually stores Lucide icon names for most categories. Two options:
- **Keep it as-is** — `DynamicIcon` handles both emojis and Lucide names, so the admin can enter either
- **Update label** — Change "Icon (Emoji)" to "Icon (Emoji or Lucide name)" so admins know both are supported

I'll update the label to be accurate.

### 3. Fix the 2 emoji values in DB

Run a migration to update `resume_writing.icon` from `📝` to `PenLine` and `domestic_help` parent group icon from `🧹` to a Lucide name, for consistency.

### Files to modify
- `src/pages/SellerProductsPage.tsx` — Use DynamicIcon in category select + product placeholder
- `src/pages/SellerDetailPage.tsx` — Use DynamicIcon in category badge
- `src/components/seller/BulkProductUpload.tsx` — Use DynamicIcon in category select
- `src/components/workforce/WorkerCategoryManager.tsx` — Use DynamicIcon in card
- `src/components/admin/CategoryManager.tsx` — Update label text
- `src/components/admin/SubcategoryManager.tsx` — Update label text
- DB migration: fix 2 emoji icon values

