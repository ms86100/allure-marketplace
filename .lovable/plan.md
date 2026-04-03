

# Search-First Seller Category Selection — Bulletproof MVP

## What Changes

Replace the 2-step onboarding (Step 1: pick parent group → Step 2: pick subcategories) with a single unified "What do you want to sell?" step. Sellers search across ALL categories/subcategories in one place, with smart suggestion, alias matching, and guaranteed fallback.

---

## Architecture

```text
┌─────────────────────────────────────────┐
│  🔍 What do you want to sell?           │
│  [ yoga classes                       ] │
├─────────────────────────────────────────┤
│  ✨ Suggested for you                   │
│  🧘 Yoga Classes · Education & Learning │
│  [Use this]                             │
├─────────────────────────────────────────┤
│  Other matches                          │
│  💆 Yoga Therapy · Personal Care        │
│  🧘 Power Yoga · Education & Learning   │
├─────────────────────────────────────────┤
│  Or browse by category:                 │
│  [🍽 Food] [📚 Education] [🔧 Home]...  │
└─────────────────────────────────────────┘
```

---

## Implementation (3 Changes)

### 1. Create `src/components/seller/CategorySearchPicker.tsx`

Unified search + browse + auto-suggest component.

**Data sources** (existing hooks, no new queries):
- `useCategoryConfigs()` → all category_config entries with parent groups
- `useSubcategories()` → all active subcategories (no filter)
- `parentGroupInfos` from `useSellerApplication` → group labels/icons

**Search logic** (client-side, no API):
- Builds flat index: every subcategory + every category_config across ALL groups
- Each item tagged with its parent group label/icon for context display
- Debounce 200ms, minimum 2 characters

**3-layer matching:**
1. Subcategory `display_name` match (exact=3, startsWith=2, contains=1)
2. Category `displayName` match (same scoring)
3. **Alias keywords** (inline map, no DB): covers ~50 common natural-language terms

```typescript
const ALIAS_MAP: Record<string, string[]> = {
  tiffin: ["home food", "dabba", "meal service", "lunch delivery"],
  yoga: ["meditation", "wellness", "mindfulness"],
  electrician: ["wiring", "repair", "electrical"],
  beauty: ["parlour", "parlor", "makeup", "facial"],
  maid: ["cleaning", "house cleaning", "home cleaning"],
  resume_writing: ["resume editing", "cv writing", "resume help"],
  // ~50 entries covering all active categories
};
```
Alias match scores 1.5 (between contains and startsWith).

**Auto-suggestion rules (bulletproof):**
- Show "Suggested for you" card ONLY when:
  - Top result score ≥ 2
  - AND `(topScore - secondScore) >= 1` (dominance check)
- If multiple results share the top score → show "Top matches" list (no single suggestion)
- Never bias toward wrong category

**UI states:**
- **Empty search**: "Popular" quick-picks (hardcoded top 8 subcategory slugs) + horizontal-scroll parent group pills + full browse grid (always visible, not collapsed)
- **Results found**: Ranked list with icon + name + parent group badge pill
- **No results**: Reassuring copy ("We couldn't find an exact match, but you can still list your service") + browse grid prominently shown
- **Selections**: Removable chips below search bar showing picks across groups with group label

**Multi-group warning:**
When seller selects across 2+ different parent groups, show a soft confirmation: "You're selecting services across different categories. Continue?"

**Selection behavior:**
- Tapping a subcategory result → opens existing `SubcategoryPickerDialog` scoped to that category with the item pre-selected
- Tapping a category with no subcategories → direct toggle
- Auto-resolves `selectedGroup` from first selection
- Reuses existing `SubcategorySelection` type and `subcategory_preferences` JSONB structure

### 2. Modify `src/pages/BecomeSellerPage.tsx`

- Replace Step 1 (parent group grid) + Step 2 (`GuidedStep2`) with `CategorySearchPicker`
- `TOTAL_STEPS`: 6 → 5
- Updated `STEP_META`:
  - Step 1: "What to Sell" (Search icon) — `CategorySearchPicker`
  - Step 2: "Store Details" (was Step 3)
  - Step 3: "Settings" (was Step 4)
  - Step 4: "Products" (was Step 5)
  - Step 5: "Review" (was Step 6)
- `selectedGroup` auto-set from picker's first selection (no manual group picking needed)
- All downstream step references shift by -1
- Context breadcrumb shows from Step 2+ instead of Step 3+
- Back button on Step 2 goes to Step 1 (picker)
- `GuidedStep2` function remains in file but is no longer rendered (can be removed in cleanup)

### 3. No Backend Changes

- No new database tables
- No new RPC functions
- No schema migrations
- All search runs client-side against pre-fetched cached data
- Existing `SubcategoryPickerDialog` reused as-is

---

## Edge Cases Handled

| Scenario | Behavior |
|---|---|
| Seller types "meditation" (not in subcategories) | Alias map resolves to "Yoga" results |
| Multiple equal-score results | "Top matches" list, no single suggestion |
| No results at all | Reassuring message + browse grid always visible |
| Cross-group selections (yoga + beauty) | Soft warning, allowed to continue |
| Seller doesn't type, just browses | Parent group pills + grid always visible |
| Single active parent group | Works same — search still covers all subcategories |

---

## Files Summary

| File | Action |
|---|---|
| `src/components/seller/CategorySearchPicker.tsx` | **Create** |
| `src/pages/BecomeSellerPage.tsx` | **Modify** — merge steps, update constants |

