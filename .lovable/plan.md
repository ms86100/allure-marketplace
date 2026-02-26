

## Analysis: Admin-Configurable vs System-Driven Trust Settings

After reviewing `PlatformSettingsManager.tsx`, `useMarketplaceLabels.ts`, and how these settings are consumed across the codebase, here is a classification of all trust-related settings and a plan to redesign them.

---

### Current State

The admin panel exposes **~70 text fields** across groups like Trust Labels, Notify Labels, Checkout Labels, Group Buy Labels, Seller Dashboard Labels, Discovery Labels, and Visibility Thresholds. The vast majority are **static UI copy** (button text, empty-state messages) that almost no admin would ever change, mixed in with a handful of settings that genuinely affect business policy.

---

### Classification: What Should Stay vs What Should Go

#### Category 1 — Remove from Admin UI entirely (hard-code as app constants)

These are **UX copy strings** that are part of the product's identity. No admin should need to change "Notify Me" to something else. They belong in code defaults (already in `useMarketplaceLabels.ts` as `DEFAULTS`).

| Setting | Reason |
|---|---|
| `label_notify_me`, `label_notify_watching`, `label_notify_watching_long`, `label_notify_me_long` | Button text — product UX, not policy |
| `label_group_buy_join`, `label_group_buy_leave`, `label_group_buy_fulfilled` | Button text |
| `label_group_buy_empty`, `label_group_buy_empty_desc` | Empty-state copy |
| `label_reputation_empty`, `label_reputation_empty_desc` | Empty-state copy |
| `label_demand_insights_empty` | Empty-state copy |
| `label_reorder_prefix`, `label_reorder_success`, `label_reorder_unavailable` | Toast/UX copy |
| `label_analytics_active_buyers`, `label_analytics_views`, `label_analytics_conversion` | Stat labels — never changes |
| `label_analytics_fee_format`, `label_analytics_fee_desc` | Derived from `platform_fee_percent` already in Financial settings |
| `label_discovery_popular`, `label_discovery_new` | Section headings — product design |
| `label_group_buy_title`, `label_group_buy_subtitle` | Page headings |
| `label_demand_insights_title`, `label_analytics_intelligence_title` | Section headings |

**~25 settings removed from admin UI.**

#### Category 2 — System-computed (derive automatically from data)

These values should be **computed by algorithms**, not entered by admins.

| Setting | Current | Proposed Algorithm |
|---|---|---|
| `label_active_now` / `label_active_hours_ago` / `label_active_yesterday` | Admin types format strings | System computes from `sellers.last_active_at` timestamp using standard relative-time logic. Format is fixed in code. |
| `label_on_time_format` | Admin types `✓ On-time: {pct}%` | System computes `pct` from the seller's fulfillment ledger (`orders delivered on time / total orders`). The display format is fixed in code. |
| `label_social_proof_format` / `label_social_proof_singular` / `label_social_proof_plural` | Admin types the template | System already computes the count via `get_society_order_stats` RPC. The label format is product design, not policy. Hard-code the template. |
| `label_stable_price` | Admin types label | System computes from `price_history` — if price unchanged for N days, badge appears. The label is fixed; the **threshold** (`stable_price_days`) stays admin-configurable. |
| `label_in_your_society` / `label_your_neighbor` | Admin types label | System derives from `seller.society_id === buyer.society_id`. The label text is product copy, hard-coded. |
| `label_distance_m_format` / `label_distance_km_format` | Admin types format | System computes distance from coordinates. Display format (`Xm away` / `X km away`) is standard UX, hard-coded. |

**~12 settings become system-computed.**

#### Category 3 — Keep as Admin-configurable (genuine policy levers)

These affect **business rules and marketplace policy** and legitimately vary per deployment.

| Setting | Why It Stays |
|---|---|
| `on_time_badge_min_orders` | Policy: how many orders before showing reliability badge |
| `stable_price_days` | Policy: price stability window |
| `new_this_week_days` | Policy: freshness cutoff for discovery |
| `discovery_min_products` | Policy: minimum catalog size for visibility |
| `discovery_max_items` | Policy: controls discovery row density |
| `demand_insights_max_items` | Policy: limits demand signal exposure |
| `dispute_sla_warning_hours` | Policy: SLA enforcement timing |
| `dispute_categories_json` | Policy: what dispute types are available |
| `label_neighborhood_guarantee` / `_desc` / `_badge` / `_emoji` | Brand-specific trust framing — central to differentiation |
| `label_dispute_sla_notice` | Legal/policy notice |
| `label_checkout_community_support` / `_emoji` | Brand messaging — admin may want to customize |

**~15 settings remain admin-configurable.**

---

### Implementation Plan

#### Step 1 — Clean up PlatformSettingsManager

Remove the ~25 pure-UX-copy fields from `SETTING_FIELDS` in `PlatformSettingsManager.tsx`. They will continue to work via the existing `DEFAULTS` in `useMarketplaceLabels.ts` — no consumer code changes needed since the fallback mechanism already handles missing DB values.

#### Step 2 — Remove format-template fields for system-computed values

Remove `label_active_now`, `label_active_hours_ago`, `label_active_yesterday`, `label_on_time_format`, `label_social_proof_format`, `label_social_proof_singular`, `label_social_proof_plural`, `label_stable_price`, `label_in_your_society`, `label_your_neighbor`, `label_distance_m_format`, `label_distance_km_format` from `SETTING_FIELDS`. The consuming components already have hard-coded fallbacks that will take over.

#### Step 3 — Reorganize remaining settings into clearer groups

Rename the admin groups for clarity:

- **Marketplace Policy** — thresholds (`on_time_badge_min_orders`, `stable_price_days`, `new_this_week_days`, etc.)
- **Trust & Guarantee Branding** — neighborhood guarantee labels, community support copy
- **Dispute Configuration** — categories JSON, SLA notice

#### Step 4 — Add read-only "System Signals" info panel

Add a small read-only section in the admin UI that shows what the system computes automatically (trust score algorithm, activity detection, distance logic, social proof) so admins understand these are handled without their intervention. This is informational only — no editable fields.

---

### What Does NOT Change

- `useMarketplaceLabels.ts` — the hook, its `DEFAULTS`, and all consumer code remain untouched. The fallback mechanism means removing DB keys is safe.
- `useMarketplaceConfig.ts` — unchanged, handles currency/fulfillment/scarcity settings.
- All product cards, detail sheets, and trust badge components — they already consume labels via the hook with built-in defaults.
- The `system_settings` table — existing rows are not deleted; they simply become unused if not in the admin UI.

### Risk

Zero breaking changes. Every removed admin field already has a working default in `useMarketplaceLabels.ts`. The system continues to function identically; we are only reducing admin cognitive load.

