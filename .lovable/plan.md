

# UI/UX Fixes + Data Integrity Audit

## 1. Bottom Sheet Swipe-to-Dismiss

**Problem**: 47 components use Radix `Sheet` with `side="bottom"`. Radix Sheet does NOT support swipe/pull-down to dismiss -- only the `Drawer` (vaul) component does.

**Fix**: Replace all `Sheet side="bottom"` usages with `Drawer` from vaul (already installed). The `Drawer` component already exists in `src/components/ui/drawer.tsx` and supports native swipe-to-dismiss.

**Approach**:
- Create a migration guide: every `<Sheet>` + `<SheetContent side="bottom">` becomes `<Drawer>` + `<DrawerContent>`, with matching header/title/footer replacements
- Update all 47 files that use bottom sheets (bulk find-and-replace with manual verification)
- The existing `ProductDetailSheet.tsx` already uses `Drawer` correctly -- use it as the pattern

## 2. ActiveOrderStrip -- Show ALL Active Orders

**Problem**: The strip already queries up to 3 orders and renders them as horizontal-scroll chips. The network response confirms 3 active orders are returned. The issue is likely the `limit(3)` cap and possibly the chips being too wide on small screens.

**Actual finding**: The code at line 124-125 already renders all fetched orders in a horizontal scroll. The `maxWidth: '70vw'` per chip may cause the 3rd chip to be off-screen. The real issue is the query already works correctly -- the "single banner" the user sees is likely the `ArrivalSuggestionCard` or `HomeNotificationBanner`, not the ActiveOrderStrip.

**Fix**:
- Increase limit from 3 to 5 for better coverage
- Shrink chip max-width to `60vw` so more orders are visible
- Add a count badge (e.g., "3 active orders") when orders > 1 to signal scrollability

## 3. Duplicate Delivery OTP on Order Detail Page

**Problem**: Confirmed -- TWO OTP display blocks exist in `OrderDetailPage.tsx`:
- **Line 362-368**: Inside the delivery tracking section (shows when `isInTransit`)
- **Line 391-397**: "Persistent OTP card" below the tracking section (shows for all non-terminal delivery statuses)

Both render simultaneously when the order is in transit, creating a duplicate.

**Fix**: Remove the first OTP block (lines 362-368). Keep only the persistent one (lines 391-397) which has broader, correct visibility logic.

## 4. Hardcoded vs Database-Driven Audit

| Section | Source | Status |
|---------|--------|--------|
| **ActiveOrderStrip** | DB (`orders` + `category_status_flows`) | Database-driven |
| **HomeNotificationBanner** | DB (`user_notifications`) | Database-driven |
| **FeaturedBanners / AutoHighlightStrip** | DB (`featured_items`) | Database-driven |
| **ParentGroupTabs** (top category carousel) | DB (`parent_groups` table) | Database-driven |
| **CategoryImageGrid** | DB (`category_configs` + `products`) | Database-driven |
| **BuyAgainRow** | DB (past orders) | Database-driven |
| **ForYouSection** (Smart Suggestion, Arrival, Appointments) | DB | Database-driven |
| **Discovery Rows** (Popular, New This Week) | DB (`products` with ordering logic) | Database-driven |
| **ShopByStoreDiscovery** | DB (`seller_profiles`) | Database-driven |
| **SocietyLeaderboard** | DB (`seller_profiles`, order counts) | Database-driven |
| **CommunityTeaser** | DB (`bulletin_posts`, `help_requests`) | Database-driven |
| **RecentlyViewedRow** | LocalStorage product IDs, then DB fetch | Hybrid (localStorage + DB) |
| **SocietyQuickLinks** | **Hardcoded array** of 6 links (Visitors, Parking, Finances, Bulletin, Maintenance, Disputes) with feature-flag filtering | **Partially hardcoded** -- links are static, but visibility is feature-flag controlled |
| **Profile completion card** | DB (`profiles` table) | Database-driven |
| Section labels/headings | DB via `useMarketplaceLabels` (`system_settings`) | Database-driven |
| Thresholds (new_this_week_days, etc.) | DB via `useMarketplaceLabels` | Database-driven |

**Verdict**: The only hardcoded section is **SocietyQuickLinks** (link definitions). Everything else is database-driven.

## 5. Top Carousel Categories -- Already Dynamic

**Finding**: The `ParentGroupTabs` component pulls from the `parent_groups` database table via `useParentGroups()` hook. Each group has configurable: `name`, `icon`, `sort_order`, `is_active`, `color`, `description`, `layout_type`. The `CategoryImageGrid` pulls sub-categories from `category_configs` DB table.

**Already supported**: Name, icon, ordering, visibility (`is_active`). Admin can manage via the existing admin panel.

**No changes needed** for this item -- the system is already fully dynamic.

## Implementation Plan

| # | Task | Files |
|---|------|-------|
| 1 | Remove duplicate OTP block | `src/pages/OrderDetailPage.tsx` (delete lines 362-368) |
| 2 | Improve ActiveOrderStrip visibility | `src/components/home/ActiveOrderStrip.tsx` |
| 3 | Migrate all 47 bottom Sheets to Drawer | All files using `SheetContent side="bottom"` |

### Technical Details

**Task 1 -- OTP dedup**: Delete the first OTP block (lines 361-368 in OrderDetailPage.tsx). The second block at line 391 already covers all non-terminal delivery statuses including transit.

**Task 2 -- ActiveOrderStrip**: Increase query limit to 5, reduce chip maxWidth to `55vw`, add a subtle "N orders" indicator when multiple orders exist.

**Task 3 -- Sheet-to-Drawer migration**: For each of the 47 files:
- `Sheet` -> `Drawer`
- `SheetContent side="bottom"` -> `DrawerContent`
- `SheetHeader` -> `DrawerHeader`
- `SheetTitle` -> `DrawerTitle`
- `SheetDescription` -> `DrawerDescription`
- `SheetFooter` -> `DrawerFooter`
- `SheetTrigger` -> `DrawerTrigger`
- `SheetClose` -> `DrawerClose`
- Remove `side="bottom"` prop
- Imports updated accordingly

This is a large but mechanical change. The Drawer component already has the pull-handle and swipe-dismiss built in.

