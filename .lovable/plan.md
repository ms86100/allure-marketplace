

# Featured Banner System — Product Gap Analysis & Enterprise Upgrade Plan

## Current State Summary

The system has two banner types: **Classic** (static image/text carousels) and **Festival** (themed multi-section modules with product resolution). Supporting tables: `featured_items`, `banner_sections`, `banner_section_products`, `banner_analytics`, `banner_theme_presets` (279 presets), `festival_seller_participation`. An RPC `resolve_banner_products` handles society-aware product fetching.

---

## 1. GAP ANALYSIS

### A. Critical Gaps (P0 — Must Fix)

| # | Gap | Impact |
|---|-----|--------|
| 1 | **`p_banner_id` is accepted but ignored in the RPC** — `resolve_banner_products` has an overload with `p_banner_id` but the function body never references `festival_seller_participation`. Seller opt-in/opt-out is dead code. | Sellers who opt out still appear in festival banners. Trust violation. |
| 2 | **No seller eligibility enforcement on banners** — The RPC filters by seller availability, approval, and radius, but never checks if a seller opted into a specific festival campaign. | Festival participation toggle in seller dashboard is cosmetic only. |
| 3 | **No admin analytics dashboard** — `banner_analytics` collects impressions and clicks but admin has zero visibility into performance (CTR, conversion, section engagement). | Admin flies blind — cannot measure ROI of any banner campaign. |
| 4 | **Classic banners lack scheduling** — Schedule fields (`schedule_start`, `schedule_end`) exist in the DB but admin form only shows them for festival type. Classic banners cannot be time-boxed. | Admin must manually toggle banners on/off, leading to stale promotions. |
| 5 | **No duplicate/clone banner** — Admin must rebuild banners from scratch for recurring festivals (e.g., weekly specials). | High admin friction, error-prone repetition. |
| 6 | **Admin form is a single monolithic drawer** — All configuration crammed into one scrollable sheet. No wizard steps, no progressive disclosure. | Cognitive overload. High abandon rate on complex festival setups. |

### B. High-Priority Gaps (P1 — Should Fix)

| # | Gap | Impact |
|---|-----|--------|
| 7 | **No banner prioritization / ranking rules** — Only `display_order` (manual integer). No support for boost-by-engagement, recency, or contextual relevance scoring. | Static ordering; high-performing banners don't rise automatically. |
| 8 | **No cross-society targeting intelligence** — `target_society_ids` is a flat array with manual checkbox selection. No "nearby societies" or "same builder" grouping. | Admin must know society IDs. Scaling to 100+ societies is unusable. |
| 9 | **Seller has no visibility into WHERE they're featured** — The seller dashboard shows opt-in toggles but no preview of the banner, no impression/click stats, no visibility into which societies see them. | Seller trust gap — "I opted in but don't know if it's working." |
| 10 | **No product-level analytics** — `banner_analytics` tracks banner/section level events but `product_id` is optional and never populated on product clicks from festival collections. | Cannot measure which products drive banner engagement. |
| 11 | **Banner buyer-side filtering is client-side only** — Schedule filtering, society matching with `or()` clause happen partially client-side. At scale, this fetches expired/irrelevant banners and filters in JS. | Wasted bandwidth, slower TTFB as banner count grows. |
| 12 | **No A/B testing or variant support** — No way to create two versions of a banner and split traffic. | Cannot optimize creative/copy without manual coordination. |

### C. UX Gaps (P2 — Good to Have)

| # | Gap | Impact |
|---|-----|--------|
| 13 | **No image upload in admin** — Admin must paste URLs manually. No drag-drop, no Supabase Storage integration. | Friction. Non-technical admins cannot create banners independently. |
| 14 | **Classic banner CTA "Collection" action references a collection ID but there's no collection management UI** — Admin must type raw IDs. | Unusable for non-technical admins. |
| 15 | **No preview-on-device / "buyer view" toggle** — Admin sees a small in-drawer preview but cannot preview how it looks in the real home feed. | Gap between admin intent and buyer experience. |
| 16 | **No banner status lifecycle** — Only `is_active` boolean. No draft/published/archived/expired states. | Cannot save work-in-progress banners without exposing them. |
| 17 | **Festival section product resolution fires N+1 queries** — Each `SectionChip` independently calls `resolveProducts`. A festival with 8 sections fires 8+ RPCs on home page load. | Performance degradation with more sections. |
| 18 | **Seller participation table has no admin read policy** — Admin cannot view which sellers opted into which festivals. | Admin cannot audit participation or troubleshoot. |

---

## 2. PROPOSED ENTERPRISE-GRADE SOLUTION

### Phase 1 — Fix Broken Contracts (P0, ~3 days)

**1a. Fix `resolve_banner_products` RPC to enforce seller participation**

Migration: Update the overload that accepts `p_banner_id` to add a JOIN/filter:
```sql
-- When p_banner_id IS NOT NULL, only include sellers who opted in
AND (
  p_banner_id IS NULL
  OR EXISTS (
    SELECT 1 FROM festival_seller_participation fsp
    WHERE fsp.seller_id = sp.id
      AND fsp.banner_id = p_banner_id
      AND fsp.opted_in = true
  )
)
```

**1b. Enable scheduling for classic banners**

- Show `schedule_start` / `schedule_end` fields for both banner types in admin form
- Move schedule filtering server-side: add a DB view `active_banners` or update the buyer query to filter in SQL via `.gte('schedule_end', now).lte('schedule_start', now)`

**1c. Add admin RLS for `festival_seller_participation`**

Migration: Add `SELECT` policy for admins on `festival_seller_participation`.

**1d. Add banner clone/duplicate action**

- Add "Duplicate" button on each banner card in admin list
- Pre-fills form with existing config, clears ID, appends "(Copy)" to title

### Phase 2 — Admin Experience Upgrade (P1, ~5 days)

**2a. Multi-step wizard for banner creation**

Replace single drawer with a 4-step flow:
1. **Type & Theme** — Banner type, preset selection (festival) or template (classic)
2. **Content** — Title, subtitle, image, CTA config
3. **Targeting & Schedule** — Society picker (with search + "same builder" grouping), date range, fallback mode
4. **Review & Publish** — Full preview, validation summary, save as draft or publish

**2b. Banner analytics dashboard**

New admin tab/section showing per-banner:
- Impressions, unique viewers, section clicks, CTR
- Top-performing sections and products
- Time-series chart (daily impressions over campaign lifetime)
- Query from `banner_analytics` table, aggregated server-side via RPC

**2c. Smart society targeting**

- Add "Select by builder" option — auto-selects all societies under a builder
- Add "Nearby societies" — given a base society, select all within N km
- Search/filter in society picker

**2d. Banner lifecycle states**

Add `status` column to `featured_items`: `draft | published | archived | expired`
- `is_active` derived from `status = 'published'` + schedule window
- Admin can save drafts without publishing
- Auto-archive when `schedule_end` passes (via DB trigger or cron)

### Phase 3 — Seller Experience (P1, ~3 days)

**3a. Seller festival visibility panel**

Extend `SellerFestivalParticipation` to show:
- Banner preview (gradient + title)
- Which societies will see it
- Impression + click counts for their products in that banner (from `banner_analytics`)
- Opt-in/out toggle (already exists)

**3b. Seller cross-society consent**

When a festival targets societies beyond the seller's own:
- Show clear messaging: "Your products will be visible to buyers in [Society X, Y]"
- Respect `sell_beyond_community` flag — if false, auto-exclude from cross-society banners

### Phase 4 — Buyer Experience & Performance (P2, ~4 days)

**4a. Batch section product resolution**

Replace N+1 `SectionChip` queries with a single batched RPC:
```sql
resolve_banner_section_products(p_banner_id, p_society_id, p_limit_per_section)
```
Returns all sections' products in one call, grouped by `section_id`.

**4b. Product-level analytics tracking**

When buyer clicks a product from a festival collection page, fire:
```ts
banner_analytics.insert({ banner_id, section_id, product_id, event_type: 'product_click', user_id })
```

**4c. Server-side banner filtering view**

Create a `public.active_banners_for_society(p_society_id)` function that returns only currently active, schedule-valid, society-matched banners. Eliminates client-side filtering entirely.

**4d. Personalization readiness**

Add `banner_analytics`-based scoring: banners where the buyer previously engaged get a boost. Requires a lightweight scoring RPC — not full ML, just recency-weighted click counts.

### Phase 5 — A/B & Experimentation (P3, future)

- Add `variant_group` column to `featured_items`
- Buyer assigned to variant via hash of `user_id % variant_count`
- Admin creates variants, system splits traffic
- Analytics dashboard shows per-variant metrics

---

## 3. IMPLEMENTATION PRIORITY

```text
Phase 1 (P0 — Week 1)
├── Fix RPC seller participation enforcement
├── Enable classic banner scheduling
├── Admin RLS for participation table
└── Banner clone/duplicate

Phase 2 (P1 — Week 2-3)
├── Multi-step wizard
├── Analytics dashboard
├── Smart society targeting
└── Banner lifecycle states

Phase 3 (P1 — Week 3)
├── Seller visibility panel
└── Cross-society consent UX

Phase 4 (P2 — Week 4)
├── Batch product resolution
├── Product-level analytics
├── Server-side filtering
└── Personalization scoring

Phase 5 (P3 — Future)
└── A/B testing framework
```

---

## 4. FILES TO CREATE / MODIFY

| File | Action |
|------|--------|
| Migration: `resolve_banner_products` v2 | Update RPC to enforce `festival_seller_participation` |
| Migration: `active_banners_for_society` RPC | New server-side banner filtering |
| Migration: `featured_items.status` column | Add lifecycle states |
| Migration: RLS for `festival_seller_participation` admin read | Add policy |
| `src/components/admin/AdminBannerManager.tsx` | Refactor into wizard, add clone, add scheduling for classic |
| `src/components/admin/BannerAnalyticsDashboard.tsx` | New component |
| `src/components/seller/SellerFestivalParticipation.tsx` | Extend with preview + stats |
| `src/components/home/FestivalBannerModule.tsx` | Batch product loading |
| `src/components/home/FeaturedBanners.tsx` | Use server-side filtering RPC |
| `src/lib/bannerProductResolver.ts` | Add batch mode |
| `src/pages/FestivalCollectionPage.tsx` | Add product-click analytics |

---

## 5. SAFETY CONSTRAINTS

- No relaxation of existing RLS policies
- `sell_beyond_community = false` sellers are never shown cross-society
- All analytics are append-only, no PII exposure
- Draft banners are never visible to buyers
- Backward compatible — existing banners continue working without migration of content

