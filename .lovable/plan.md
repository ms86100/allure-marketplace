

# Hardcoding Audit & Remediation Plan

This audit covers all 15 recently-implemented trust/differentiation features plus pre-existing violations found in the same files. Every violation is cataloged with its location, why it breaks configurability, and the DB-backed replacement.

---

## Audit Findings: 47 Violations Across 12 Files

### Category A: Hardcoded UI Labels & Copy (28 violations)

| # | Hardcoded String | File | Line(s) |
|---|---|---|---|
| A1 | `"In your society"` | `ProductListingCard.tsx` | 276 |
| A2 | `"Xm away"` / `"X km away"` format strings | `ProductListingCard.tsx` | 270-271 |
| A3 | `"Active now"`, `"Xh ago"`, `"Yesterday"` | `ProductListingCard.tsx` | 411-414 |
| A4 | `"✓ On-time: X%"` | `ProductListingCard.tsx` | 333 |
| A5 | `"X families ordered this week"` | `ProductListingCard.tsx` | 340 |
| A6 | `"Notify Me"`, `"Watching"`, `"We'll notify you"`, `"Notify Me When Available"` | `NotifyMeButton.tsx` | 64, 81 |
| A7 | `"Stable Price (30+ days)"` | `PriceHistoryChart.tsx` | 38, 67 |
| A8 | `"Active now"`, `"Active Xh ago"`, `"Active yesterday"` | `ProductDetailSheet.tsx` | 21-24 |
| A9 | `"Your neighbor"` | `ProductDetailSheet.tsx` | 137 |
| A10 | `"Xm away"` / `"X km away"` | `ProductDetailSheet.tsx` | 139 |
| A11 | `"This order supports N local businesses in your community"` | `CartPage.tsx` | 195 |
| A12 | `"Protected by Neighborhood Guarantee — disputes resolved by your society committee"` | `CartPage.tsx` | 186 |
| A13 | `"Neighborhood Guarantee"` (title) | `CreateDisputeSheet.tsx` | 89 |
| A14 | `"Your society committee will review this as a neutral party"` | `CreateDisputeSheet.tsx` | 92 |
| A15 | `"The committee will review within 48 hours."` | `CreateDisputeSheet.tsx` | 68 |
| A16 | `"Neighborhood Guarantee"` (title) | `DisputeDetailSheet.tsx` | 124 |
| A17 | `"Your society committee reviews this as a neutral party"` | `DisputeDetailSheet.tsx` | 125 |
| A18 | `"Community Group Buys"`, `"Pool orders with neighbors for better deals"` | `CollectiveBuyPage.tsx` | 110-111 |
| A19 | `"No active group buys"`, `"Group buys from your community will appear here"` | `CollectiveBuyPage.tsx` | 122-123 |
| A20 | `"✓ Target Reached"`, `"Expired"`, `"Join Group Buy"`, `"Leave Group Buy"` | `CollectiveBuyPage.tsx` | 148-179 |
| A21 | `"Started by"` | `CollectiveBuyPage.tsx` | 195 |
| A22 | `"What buyers are searching for"` | `DemandInsights.tsx` | 38 |
| A23 | `"No seller in your society offers these items yet — opportunity!"` | `DemandInsights.tsx` | 57 |
| A24 | `"No reputation history yet"`, `"Events will appear as orders are completed"` | `SellerReputationTab.tsx` | 62-63 |
| A25 | `"Reorder from"`, `"Cart rebuilt! Review and checkout."`, `"Items from this order are no longer available"` | `ReorderLastOrder.tsx` | 90, 72, 114 |
| A26 | `"Popular near you"`, `"New this week"` (discovery section titles) | `MarketplaceSection.tsx` | 118, 133 |
| A27 | `"30-Day Intelligence"`, `"Active Buyers"`, `"Views"`, `"Conversion"` | `SellerAnalytics.tsx` | 79, 84, 89, 94 |
| A28 | `"X% platform fee"`, `"Applied on each completed order"` | `SellerAnalytics.tsx` | 107-108 |

### Category B: Hardcoded Dropdown/Enum Options (3 violations)

| # | What | File | Line(s) |
|---|---|---|---|
| B1 | Dispute `CATEGORIES` array (`noise`, `parking`, `pet`, `maintenance`, `other`) | `CreateDisputeSheet.tsx` | 17-23 |
| B2 | Reputation `eventLabels` map (6 event types with labels/colors) | `SellerReputationTab.tsx` | 68-75 |
| B3 | Dispute status options (`acknowledged`, `under_review`, `resolved`, `escalated`, `closed`) | `DisputeDetailSheet.tsx` | 193-198 |

### Category C: Hardcoded Business Logic Constants (9 violations)

| # | What | File | Line(s) |
|---|---|---|---|
| C1 | `completed_order_count > 5` threshold for showing on-time badge | `ProductListingCard.tsx` | 331 |
| C2 | `30 * 24 * 60 * 60 * 1000` (30 days) stable price threshold | `PriceHistoryChart.tsx` | 31 |
| C3 | `diffHours < 1` / `< 24` / `< 48` activity bucket thresholds | `ProductListingCard.tsx` | 411-414 |
| C4 | `7 * 24 * 60 * 60 * 1000` (7 days) for "new this week" | `MarketplaceSection.tsx` | 41 |
| C5 | `> 3` minimum products to show "Popular near you" | `MarketplaceSection.tsx` | 116 |
| C6 | `.slice(0, 10)` max items in discovery rows | `MarketplaceSection.tsx` | 44, 51 |
| C7 | `.limit(30)` price history chart points | `PriceHistoryChart.tsx` | 23 |
| C8 | `.slice(0, 5)` max demand insights shown | `DemandInsights.tsx` | 41 |
| C9 | `48` hours SLA warning threshold for disputes | `DisputeDetailSheet.tsx` | 157 |

### Category D: Hardcoded Emojis & Icons (7 violations)

| # | What | File | Line(s) |
|---|---|---|---|
| D1 | `💚` emoji for checkout emotional copy | `CartPage.tsx` | 194 |
| D2 | `🛡️` emoji for neighborhood guarantee | `CartPage.tsx` | 185 |
| D3 | `👥` emoji for social proof | `ProductListingCard.tsx` | 340 |
| D4 | `✓` checkmark for on-time badge | `ProductListingCard.tsx` | 333 |
| D5 | `🛒` fallback cart emoji in search placeholder | Already in MARKETPLACE_FALLBACKS (ok) |
| D6 | `🛍️` fallback product emoji | `ProductDetailSheet.tsx` | 56, 161 |
| D7 | `⚠` / `✓` in dispute timeline | `DisputeDetailSheet.tsx` | 151, 159 |

---

## Remediation Plan

### Step 1: Expand `system_settings` with new keys (DB migration)

Add the following keys to `system_settings` to back all hardcoded strings:

**Trust Signal Labels:**
- `label_in_your_society` → "In your society"
- `label_distance_m_format` → "{distance}m away"
- `label_distance_km_format` → "{distance} km away"
- `label_your_neighbor` → "Your neighbor"
- `label_active_now` → "Active now"
- `label_active_hours_ago` → "{hours}h ago"
- `label_active_yesterday` → "Yesterday"
- `label_on_time_format` → "✓ On-time: {pct}%"
- `label_social_proof_format` → "👥 {count} {unit} ordered this week"
- `label_social_proof_singular` → "family"
- `label_social_proof_plural` → "families"
- `label_stable_price` → "Stable Price (30+ days)"

**Notify Me Labels:**
- `label_notify_me` → "Notify Me"
- `label_notify_watching` → "Watching"
- `label_notify_watching_long` → "Watching — We'll notify you"
- `label_notify_me_long` → "Notify Me When Available"

**Checkout Trust Labels:**
- `label_checkout_community_support` → "This order supports {count} local business{suffix} in your community"
- `label_checkout_community_emoji` → "💚"
- `label_neighborhood_guarantee` → "Neighborhood Guarantee"
- `label_neighborhood_guarantee_desc` → "Your society committee will review this as a neutral party"
- `label_neighborhood_guarantee_badge` → "Protected by Neighborhood Guarantee — disputes resolved by your society committee"
- `label_neighborhood_guarantee_emoji` → "🛡️"
- `label_dispute_sla_notice` → "The committee will review within 48 hours."

**Group Buy Labels:**
- `label_group_buy_title` → "Community Group Buys"
- `label_group_buy_subtitle` → "Pool orders with neighbors for better deals"
- `label_group_buy_empty` → "No active group buys"
- `label_group_buy_empty_desc` → "Group buys from your community will appear here"
- `label_group_buy_join` → "Join Group Buy"
- `label_group_buy_leave` → "Leave Group Buy"
- `label_group_buy_fulfilled` → "✓ Target Reached"

**Seller Intelligence Labels:**
- `label_demand_insights_title` → "What buyers are searching for"
- `label_demand_insights_empty` → "No seller in your society offers these items yet — opportunity!"
- `label_reputation_empty` → "No reputation history yet"
- `label_reputation_empty_desc` → "Events will appear as orders are completed"

**Discovery Section Labels:**
- `label_discovery_popular` → "Popular near you"
- `label_discovery_new` → "New this week"

**Reorder Labels:**
- `label_reorder_prefix` → "Reorder from"
- `label_reorder_success` → "Cart rebuilt! Review and checkout."
- `label_reorder_unavailable` → "Items from this order are no longer available"

**Business Logic Thresholds:**
- `on_time_badge_min_orders` → "5"
- `stable_price_days` → "30"
- `new_this_week_days` → "7"
- `discovery_min_products` → "3"
- `discovery_max_items` → "10"
- `price_history_max_points` → "30"
- `demand_insights_max_items` → "5"
- `dispute_sla_warning_hours` → "48"

**Configurable Enums (new tables or JSON settings):**
- `dispute_categories_json` → JSON array of `{value, label}` for dispute categories
- `reputation_event_labels_json` → JSON map of event_type → `{label, color}`
- `dispute_status_options_json` → JSON array of `{value, label}` for admin status dropdown

### Step 2: Create a new hook `useMarketplaceLabels`

A single hook that fetches all the label keys above via `useSystemSettingsRaw` and returns a typed object. All components will consume labels from this hook instead of inline strings. This keeps the existing `useSystemSettings` focused on core platform config and avoids bloating it further.

### Step 3: Refactor each component

For every file listed in the audit:

1. **Import** `useMarketplaceLabels` (or receive labels via props for memoized components)
2. **Replace** every hardcoded string with the corresponding label from the hook
3. **Replace** every hardcoded threshold with the corresponding numeric setting
4. **Replace** hardcoded dropdown arrays with DB-fetched arrays

### Step 4: Admin UI for label management

Extend the existing `PlatformSettingsManager` component (already in `src/components/admin/PlatformSettingsManager.tsx`) to include grouped sections for:
- Trust Signal Labels
- Checkout & Guarantee Labels
- Group Buy Labels
- Seller Intelligence Labels
- Discovery Labels
- Business Logic Thresholds
- Dispute Configuration (categories, status options, event labels)

Each setting renders as an editable text input or number input, persisted on change via upsert to `system_settings`.

### Step 5: Verification Checklist

For each remediated item:
- Stored in `system_settings` table
- Editable via Admin → Platform Settings UI
- Reflected dynamically in buyer/seller UI
- Updates require zero code changes
- Survives refresh, logout, redeploy

---

## Implementation Order

1. **DB Migration**: Insert ~50 new `system_settings` keys with defaults matching current hardcoded values. Add 3 JSON-type settings for dispute categories, reputation labels, dispute statuses.
2. **New hook**: `useMarketplaceLabels.ts` — fetches all label keys, returns typed object with fallbacks.
3. **Component refactors** (parallel):
   - `ProductListingCard.tsx` (A1-A5, C1, C3, D3-D4)
   - `ProductDetailSheet.tsx` (A8-A10, D6)
   - `CartPage.tsx` (A11-A12, D1-D2)
   - `NotifyMeButton.tsx` (A6)
   - `PriceHistoryChart.tsx` (A7, C2, C7)
   - `CreateDisputeSheet.tsx` (A13-A15, B1)
   - `DisputeDetailSheet.tsx` (A16-A17, B3, C9, D7)
   - `CollectiveBuyPage.tsx` (A18-A21)
   - `DemandInsights.tsx` (A22-A23, C8)
   - `SellerReputationTab.tsx` (A24, B2)
   - `ReorderLastOrder.tsx` (A25)
   - `MarketplaceSection.tsx` (A26, C4-C6)
   - `SellerAnalytics.tsx` (A27-A28)
4. **Admin UI**: Add label/threshold management sections to `PlatformSettingsManager.tsx`.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `supabase/migrations/...` | New migration: insert ~50 system_settings keys + 3 JSON settings |
| `src/hooks/useMarketplaceLabels.ts` | **New** — label fetcher hook |
| `src/components/product/ProductListingCard.tsx` | Replace 8 hardcoded items |
| `src/components/product/ProductDetailSheet.tsx` | Replace 4 hardcoded items |
| `src/components/product/NotifyMeButton.tsx` | Replace 4 labels |
| `src/components/product/PriceHistoryChart.tsx` | Replace 2 labels + 2 thresholds |
| `src/pages/CartPage.tsx` | Replace 4 labels + 2 emojis |
| `src/components/disputes/CreateDisputeSheet.tsx` | Replace 3 labels + DB-source categories |
| `src/components/disputes/DisputeDetailSheet.tsx` | Replace 3 labels + DB-source statuses |
| `src/pages/CollectiveBuyPage.tsx` | Replace 7 labels |
| `src/components/seller/DemandInsights.tsx` | Replace 2 labels + 1 threshold |
| `src/components/seller/SellerReputationTab.tsx` | Replace 2 labels + DB-source event labels |
| `src/components/seller/SellerAnalytics.tsx` | Replace 4 labels |
| `src/components/home/ReorderLastOrder.tsx` | Replace 3 labels |
| `src/components/home/MarketplaceSection.tsx` | Replace 2 labels + 3 thresholds |
| `src/components/admin/PlatformSettingsManager.tsx` | Add label/threshold management sections |

