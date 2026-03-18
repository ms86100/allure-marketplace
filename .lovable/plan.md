

# Home & Category Pages — Data Integrity + Production Audit

## Audit Summary

After reviewing every component rendered on the Home and Category pages, I identified **14 issues** across 4 severity levels. The system is largely well-architected — most UI is genuinely DB-driven. The issues fall into three buckets: (A) hardcoded fallback strings that could mislead, (B) hardcoded UI labels that should come from `system_settings`, and (C) sections that render visual elements without sufficient data backing.

---

## CRITICAL Issues

### C1. Hardcoded `'Seller'` Fallback Across 6 Components
**Files:** `MarketplaceSection.tsx` (lines 117, 230), `ActiveOrderStrip.tsx` (line 74), `ReorderLastOrder.tsx` (line 49), `BuyAgainRow.tsx` (lines 45, 80), `SmartSuggestionBanner.tsx` (line 105)
**Problem:** When `seller.business_name` is null/missing, UI shows the word "Seller" — a fabricated label presented as if it's a real business name. User sees "by Seller" and trusts it as real data.
**Fix:** Replace `|| 'Seller'` with empty string or hide the seller name row entirely when missing. Never display a fake business name.

### C2. Hardcoded `'Local Seller'` in `ShopByStoreDiscovery.tsx` (line 20)
**Problem:** `sanitizeSellerName()` replaces numeric business names with `'Local Seller'` — a fabricated name shown as if real.
**Fix:** Show the first letter avatar with no name label, or show "Unnamed" in muted text with a visual indicator that the name is missing.

### C3. `AutoHighlightStrip` Badge Labels Are Hardcoded
**File:** `AutoHighlightStrip.tsx` (line 163)
**Problem:** `{card.type === 'bestseller' ? 'Bestseller' : card.type === 'top_seller' ? 'Top Rated' : 'Deal'}` — These labels are hardcoded strings, not from `system_settings` or `badge_configs`.
**Fix:** Use `badgeConfigs` for "Bestseller" label (already exists as `badge_label` on the `bestseller` tag_key). "Top Rated" and "Deal" should be added to `useMarketplaceLabels` as configurable keys.

---

## HIGH Issues

### H1. Hardcoded Section Headers Not in `system_settings`
**Locations:**
- `SocietyLeaderboard.tsx`: `"Top Sellers in Your Society"`, `"Most Ordered Products"`
- `MarketplaceSection.tsx`: `"Meet your neighbors who sell"`
- `AutoHighlightStrip.tsx`: `"Highlights"`
- `HomeSearchSuggestions.tsx`: `"Popular in your society"`
- `CommunityTeaser.tsx`: `"Community"`, `"Be the first to post!"`
- `SocietyQuickLinks.tsx`: `"Your Society"`

**Problem:** All visible user-facing section titles are hardcoded English strings. The `useMarketplaceLabels` system exists and works well for discovery labels, but these section headers bypass it entirely.
**Fix:** Add new keys to `useMarketplaceLabels` (e.g., `label_section_leaderboard_sellers`, `label_section_leaderboard_products`, `label_section_store_discovery`, `label_section_highlights`, `label_section_search_popular`, `label_section_community`, `label_section_society_links`). This makes them admin-configurable and i18n-ready.

### H2. `SocietyLeaderboard` Medal Emojis Are Hardcoded
**File:** `SocietyLeaderboard.tsx` (line 99)
**Problem:** `const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']` — rank indicators are hardcoded emojis.
**Fix:** Use numbered rank badges (CSS-styled circles with 1/2/3) or make medal set configurable via `system_settings`. The podium structure itself is fine since it's driven by real `completed_order_count` data.

### H3. Empty State Messages Are Hardcoded
**Files:** `MarketplaceSection.tsx` (lines 358-372), `CategoriesPage.tsx` (lines 281-294)
**Problem:** Messages like `"Your marketplace is getting ready!"`, `"Sellers from your community are setting up shop"`, `"Stay tuned — we're growing!"`, `"New listings appear here automatically"` are hardcoded. While they are only shown when genuinely no data exists (correct behavior), they should still be configurable.
**Fix:** Add to `useMarketplaceLabels`: `label_empty_marketplace_title`, `label_empty_marketplace_desc`, `label_empty_categories_title`, `label_empty_categories_desc`.

### H4. `CategoryImageGrid` / `CategoriesPage` Hardcoded Metadata Labels
**Files:** `CategoryImageGrid.tsx` (lines 193-209), `CategoriesPage.tsx` (lines 378-392)
**Problem:** `"sellers"`, `"seller"`, `"items"`, `"Explore →"`, `"Sellers setting up"` — these are hardcoded pluralization and fallback labels.
**Fix:** Add to `useMarketplaceLabels`: `label_seller_count_singular`, `label_seller_count_plural`, `label_item_count`, `label_explore_cta`, `label_sellers_setting_up`.

---

## MEDIUM Issues

### M1. `SmartSuggestionBanner` Hardcoded `₹` Currency Symbol
**File:** `SmartSuggestionBanner.tsx` (line 106)
**Problem:** `` {suggestion.product?.price ? ` · ₹${suggestion.product.price}` : ''} `` — Uses hardcoded `₹` instead of `useCurrency().formatPrice()`.
**Fix:** Import and use `formatPrice()` like every other component does.

### M2. `SocietyQuickLinks` Labels Are Hardcoded
**File:** `SocietyQuickLinks.tsx` (lines 16-22)
**Problem:** `'Visitors'`, `'Parking'`, `'Finances'`, `'Bulletin'`, `'Maintenance'`, `'Disputes'` are hardcoded. The feature keys are DB-driven (correct), but display labels are not.
**Fix:** These labels should come from the features configuration or a `system_settings` key. Since these are society features, they could be derived from a `feature_labels` system setting or from the feature config table if one exists.

### M3. `CategoriesPage` Static Copy
**File:** `CategoriesPage.tsx` (lines 189-190)
**Problem:** `"Explore Categories"` and `"Find what you love"` are hardcoded page title/subtitle.
**Fix:** Add to `useMarketplaceLabels`: `label_categories_page_title`, `label_categories_page_subtitle`.

### M4. `ProductListingCard` Location Fallback
**File:** `ProductListingCard.tsx` (line 112)
**Problem:** `if (distanceLabel) return 'Nearby · ${distanceLabel}'` — The word "Nearby" is hardcoded. However, this IS already handled by `useMarketplaceLabels` for the society label. The "Nearby" fallback should use a label key too.
**Fix:** Add `label_nearby` to `useMarketplaceLabels`.

---

## VERIFIED AS CORRECT (No Issues)

| Component | Data Source | Verdict |
|-----------|-----------|---------|
| `FeaturedBanners` | `featured_items` table, returns `null` when empty | PASS |
| `ActiveOrderStrip` | `orders` table + `category_status_flows`, returns `null` when no active orders | PASS |
| `SocietyTrustStrip` | `seller_profiles` count + `societies` table, returns `null` when no society | PASS |
| `HomeSearchSuggestions` | `useCommunitySearchSuggestions` (real search data), returns `null` when empty | PASS |
| `ParentGroupTabs` | `category_parent_groups` table, colors from DB | PASS |
| `CategoryImageGrid` | Real product images, counts, prices from `useProductsByCategory` | PASS |
| `ProductListingCard` badges | `badge_configs` table, `is_bestseller` from products table | PASS |
| `SocietyLeaderboard` data | Real `completed_order_count`, `rating` from `seller_profiles` + RPC | PASS |
| `ShopByStoreDiscovery` data | Real sellers from `useLocalSellers`/`useNearbySocietySellers` | PASS |
| `CommunityTeaser` data | Real `bulletin_posts` and `help_requests` counts | PASS |
| `ForYouSection` | All sub-components query real user order history | PASS |
| Discovery rows ("Popular", "New") | Labels from `useMarketplaceLabels`, thresholds configurable | PASS |
| Product card price/discount | Real `price`, `mrp`, computed `discount_percentage` | PASS |
| Seller activity labels | Real `last_active_at`, labels from `useMarketplaceLabels` | PASS |

---

## Implementation Plan

### Step 1: Eliminate Fake Business Name Fallbacks
**Files:** `MarketplaceSection.tsx`, `ActiveOrderStrip.tsx`, `ReorderLastOrder.tsx`, `BuyAgainRow.tsx`, `SmartSuggestionBanner.tsx`, `ShopByStoreDiscovery.tsx`
- Replace all `|| 'Seller'` with empty string
- Hide the "by ..." line when seller_name is empty/missing
- Replace `'Local Seller'` in `sanitizeSellerName` with returning empty string and hiding the name display

### Step 2: Add Missing Label Keys to `useMarketplaceLabels`
**File:** `src/hooks/useMarketplaceLabels.ts`
Add ~15 new keys to `LABEL_KEYS` and `DEFAULTS`:
- Section headers: `label_section_leaderboard_sellers`, `label_section_leaderboard_products`, `label_section_store_discovery`, `label_section_highlights`, `label_section_search_popular`, `label_section_community`, `label_section_society_links`
- Empty states: `label_empty_marketplace_title`, `label_empty_marketplace_desc`, `label_empty_categories_title`, `label_empty_categories_desc`
- Metadata: `label_seller_count_singular`, `label_seller_count_plural`, `label_item_count`, `label_explore_cta`, `label_sellers_setting_up`, `label_nearby`
- Page titles: `label_categories_page_title`, `label_categories_page_subtitle`
- Highlight types: `label_highlight_bestseller`, `label_highlight_top_rated`, `label_highlight_deal`

### Step 3: Wire All Components to Use Label Keys
**Files:** All components listed above
- Replace every hardcoded string with `ml.label('key_name')`
- The defaults in `useMarketplaceLabels` ensure backward compatibility — existing behavior is unchanged unless admin overrides via `system_settings`

### Step 4: Fix Currency Hardcoding
**File:** `SmartSuggestionBanner.tsx`
- Replace `₹${price}` with `formatPrice(price)`

### Step 5: Replace Hardcoded Medal Emojis
**File:** `SocietyLeaderboard.tsx`
- Replace emoji medals with CSS-styled rank badges (numbered circles with gold/silver/bronze colors from design tokens)

---

## Impact Assessment

| Step | Severity Fixed | Files Changed | Risk |
|------|---------------|---------------|------|
| 1. Remove fake names | Critical | 6 files | Low — just removes misleading text |
| 2. Add label keys | High | 1 file | None — additive only |
| 3. Wire labels | High | 8 files | Low — defaults match current strings |
| 4. Fix currency | Medium | 1 file | None |
| 5. Medal badges | Medium | 1 file | Low — visual only |

All changes are backward-compatible. Current behavior is preserved via defaults. No DB migrations needed — uses existing `system_settings` table.

