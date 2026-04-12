

# Remaining Banner Upgrade Items — Implementation Plan

## Already Implemented (skip)
- ✅ RPC seller participation enforcement (`p_banner_id` filter in DB)
- ✅ Classic banner scheduling (shown for all types)
- ✅ Server-side `active_banners_for_society` RPC
- ✅ Admin RLS for `festival_seller_participation` + `banner_analytics`
- ✅ Banner clone/duplicate
- ✅ Banner analytics dashboard component
- ✅ `status` lifecycle column on `featured_items`
- ✅ Seller festival visibility with stats

## Still Missing — To Implement Now

### 1. Multi-Step Wizard (Phase 2a)
Refactor `AdminBannerManager.tsx` from a single monolithic drawer into a 4-step wizard:
- **Step 1**: Type & Theme — banner type, preset/template selection
- **Step 2**: Content — title, subtitle, image, CTA, sections (for festival)
- **Step 3**: Targeting & Schedule — society picker with search, date range, fallback
- **Step 4**: Review & Publish — summary preview, save as draft or publish

Implementation: Add a `wizardStep` state, render step-specific content, add back/next navigation buttons.

### 2. Smart Society Targeting (Phase 2c)
Enhance the society picker in the admin form:
- Fetch societies grouped by `builder_name` field
- Add "Select all by builder" toggle
- Add search/filter input for society names
- Show count of selected societies

### 3. Seller Cross-Society Consent (Phase 3b)
In `SellerFestivalParticipation.tsx`:
- When a festival's `target_society_ids` includes societies beyond the seller's own, show a clear message: "Your products will be visible to buyers in [Society X, Y]"
- Fetch society names for display
- If seller has `sell_beyond_community = false`, show disabled opt-in with explanation

### 4. Batch Section Product Resolution (Phase 4a)
- Create new RPC `resolve_banner_section_products(p_banner_id, p_society_id, p_buyer_lat, p_buyer_lng, p_limit_per_section)` that returns all sections' products in one query
- Update `FestivalBannerModule.tsx` to call this single RPC instead of N separate `resolveProducts` calls
- Update `bannerProductResolver.ts` with a `resolveBannerSections()` batch function

### 5. Product-Level Analytics (Phase 4b)
In `FestivalCollectionPage.tsx`:
- When a buyer clicks a product card, insert a `banner_analytics` row with `event_type: 'product_click'` and `product_id`
- Wire up click handler on product cards

### 6. Personalization Scoring (Phase 4d) — Deferred
This requires significant backend logic (scoring RPC, weighted click counts). Recommend deferring to a future iteration since it has minimal user impact now.

### 7. A/B Testing (Phase 5) — Deferred
Future iteration as planned.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/AdminBannerManager.tsx` | Refactor into 4-step wizard, add smart society picker |
| `src/components/seller/SellerFestivalParticipation.tsx` | Cross-society consent messaging |
| `src/components/home/FestivalBannerModule.tsx` | Use batch product resolution |
| `src/lib/bannerProductResolver.ts` | Add `resolveBannerSections()` batch function |
| `src/pages/FestivalCollectionPage.tsx` | Add product-click analytics tracking |
| New migration | `resolve_banner_section_products` RPC |

## Safety
- No RLS changes needed (admin policies already in place)
- Backward compatible — existing banners keep working
- Wizard defaults to same save behavior, just organized into steps
- Batch RPC returns same data shape as individual calls

