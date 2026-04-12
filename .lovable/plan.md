

# Round 2 — Honest Status Check

## Already Implemented (Verified in Code & DB)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | FestivalCollectionPage passes `bannerId` | ✅ Done | Line 54: `bannerId: bannerId || undefined` |
| 2 | Auto-archive trigger | ✅ Done | `active_banners_for_society` RPC auto-expires banners before returning |
| 3 | Image upload (BannerImageUpload) | ✅ Done | Component exists with drag-drop + Storage bucket `banner-images` confirmed |
| 4 | `resolve_banner_section_products` checks `verification_status` | ✅ Done | RPC body: `AND sp.verification_status = 'approved'` |
| 5 | Participation enforcement (opt-in) | ✅ Done | RPC uses `EXISTS (... fsp.opted_in = true)` — explicit opt-in required |
| 8 | Save as Draft vs Publish | ✅ Done | Step 4 has "Save as Draft" button confirmed in code |
| 9 | Seller analytics filter by product | ✅ Done | Queries with `product_id.in.(sellerProductIds)` filter |

## Still Missing (P2 — UX Improvements)

| # | Gap | Detail |
|---|-----|--------|
| 6 | **No time-series analytics** | Dashboard shows only aggregate totals. No daily/weekly trend visualization. Admin cannot see if a banner is gaining or losing engagement over time. |
| 7 | **No per-section breakdown** | Analytics only show per-banner totals. No drill-down into which sections perform best within a festival banner. |

These are the ONLY two remaining items. Everything else from the Round 2 plan is fully implemented and verified.

---

## Implementation Plan for Remaining Items

### 1. Time-Series Analytics Chart (Gap #6)

Create a simple daily aggregation view in the analytics dashboard. No charting library needed — use a lightweight CSS-based bar chart or Recharts (already common in React projects).

**Approach:**
- Create a new RPC `get_banner_analytics_daily` that returns `date, banner_id, impressions, clicks` grouped by `DATE(created_at)`
- Add a "Trends" section to `BannerAnalyticsDashboard.tsx` with a mini bar chart showing daily impressions/clicks for the last 14 days
- Allow clicking a banner row to expand and see its daily trend

**Files:**
- New migration: `get_banner_analytics_daily` RPC
- Modify: `src/components/admin/BannerAnalyticsDashboard.tsx` — add trend chart section

### 2. Per-Section Analytics Breakdown (Gap #7)

Show which sections within a festival banner get the most clicks.

**Approach:**
- Create a new RPC `get_banner_section_analytics` that returns `section_id, section_title, impressions, clicks` by joining `banner_analytics` with `banner_sections`
- Add an expandable section within each banner card in the dashboard showing section-level stats

**Files:**
- New migration: `get_banner_section_analytics` RPC
- Modify: `src/components/admin/BannerAnalyticsDashboard.tsx` — add expandable per-section rows

### Technical Details

**RPC: `get_banner_analytics_daily`**
```sql
SELECT DATE(ba.created_at) as event_date, ba.banner_id, fi.title,
  COUNT(*) FILTER (WHERE ba.event_type = 'impression') as impressions,
  COUNT(*) FILTER (WHERE ba.event_type IN ('click','section_click','product_click')) as clicks
FROM banner_analytics ba
JOIN featured_items fi ON fi.id = ba.banner_id
WHERE ba.created_at >= now() - interval '14 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC;
```

**RPC: `get_banner_section_analytics`**
```sql
SELECT ba.banner_id, ba.section_id, bs.title as section_title,
  COUNT(*) FILTER (WHERE ba.event_type = 'impression') as impressions,
  COUNT(*) FILTER (WHERE ba.event_type IN ('click','section_click','product_click')) as clicks
FROM banner_analytics ba
LEFT JOIN banner_sections bs ON bs.id = ba.section_id
WHERE ba.section_id IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY clicks DESC;
```

**UI:** Use Recharts (install if not present) for a small area/bar chart in the trends section. Each banner card gets a collapsible "Sections" sub-table.

