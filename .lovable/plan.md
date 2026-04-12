

# Round 2 — Featured Banner Gap Analysis & Remaining Fixes

## Current State After Round 1

Most items from the original plan are implemented: 4-step wizard, batch RPC, smart society targeting, seller consent UX, analytics dashboard, lifecycle states, clone/duplicate, scheduling for all types, server-side filtering. The core architecture is enterprise-grade.

## Remaining Gaps (Ordered by Severity)

### P0 — Critical Bug

| # | Gap | Detail |
|---|-----|--------|
| 1 | **FestivalCollectionPage does NOT pass `bannerId` to `resolveProducts`** | When a buyer opens a festival section, the collection page calls `resolveProducts` without `bannerId` (line 47-54). This means **seller opt-out is NOT enforced on the actual product listing page** — only on the home page chips (which use the batch RPC). A seller who opted out will still see their products shown when a buyer taps into a section. |

### P1 — Missing Functionality

| # | Gap | Detail |
|---|-----|--------|
| 2 | **No auto-archive trigger** | Plan called for auto-archiving banners when `schedule_end` passes. No trigger exists on `featured_items`. Expired banners stay as "published" until admin manually toggles them. |
| 3 | **Image upload not integrated** | Admin still pastes raw URLs. No Supabase Storage integration or drag-drop upload. Non-technical admins cannot create banners independently. |
| 4 | **`resolve_banner_section_products` doesn't check `sp.verification_status`** | The batch RPC checks `sp.is_active = true` but NOT `sp.verification_status = 'approved'` — unlike `resolve_banner_products` which checks both. Unverified sellers could appear in festival banners. |
| 5 | **Participation enforcement logic is lenient** | Both RPCs use "if no participation row exists, show the seller." This means sellers appear by default unless they explicitly opt out. The plan intended opt-in enforcement: sellers should only appear if they explicitly opted in. Currently it's opt-out. |

### P2 — UX Improvements

| # | Gap | Detail |
|---|-----|--------|
| 6 | **No time-series analytics** | Dashboard shows totals but no daily/weekly trend chart. Admin cannot see if a banner is gaining or losing traction over time. |
| 7 | **Analytics dashboard doesn't show per-section breakdown** | Only per-banner totals. No drill-down into which sections perform best. |
| 8 | **No "Save as Draft" vs "Publish" distinction in wizard** | Step 4 has a single "Save" button. The plan called for explicit "Save as Draft" and "Publish" buttons to give admin clear control. |
| 9 | **Seller analytics show banner-level stats, not seller-specific** | `SellerFestivalParticipation` queries `banner_analytics` by `banner_id` — this shows ALL impressions/clicks for the banner, not just the seller's products. Misleading. |

### P3 — Deferred (Confirm Skip)

| # | Item | Status |
|---|------|--------|
| 10 | Personalization scoring | Deferred — no action needed now |
| 11 | A/B testing framework | Deferred — no action needed now |

---

## Implementation Plan

### 1. Fix `FestivalCollectionPage` — pass `bannerId` (P0)
Add `bannerId` to the `resolveProducts` call so seller participation is enforced.

**File**: `src/pages/FestivalCollectionPage.tsx` (line 47-54)

### 2. Fix `resolve_banner_section_products` — add `verification_status` check (P1)
Add `AND sp.verification_status = 'approved'` to the batch RPC.

**File**: New migration

### 3. Auto-archive trigger (P1)
Create a DB trigger/function that sets `status = 'expired'` and `is_active = false` when `schedule_end < now()`. Fire on UPDATE of `schedule_end` or via a periodic check. A simpler approach: modify the `active_banners_for_society` RPC to also UPDATE expired banners on read (self-healing), or create a simple cron-like edge function.

Better approach: Add the expiry logic directly into `active_banners_for_society` — before returning results, update any banners where `schedule_end < now()` and `status = 'published'`.

**File**: New migration to update `active_banners_for_society`

### 4. Image upload with Supabase Storage (P1)
- Create a `banner-images` storage bucket
- Add an `ImageUploadField` component with drag-drop
- Replace raw URL input in wizard Step 2 with the upload component

**Files**: New migration for bucket, new component `src/components/admin/BannerImageUpload.tsx`, update `AdminBannerManager.tsx`

### 5. Save as Draft vs Publish buttons (P2)
In wizard Step 4, replace single "Save" with two buttons:
- "Save as Draft" — sets `status: 'draft'`, `is_active: false`
- "Publish" — sets `status: 'published'`, `is_active: true`

**File**: `src/components/admin/AdminBannerManager.tsx`

### 6. Fix seller-specific analytics (P2)
Update `SellerFestivalParticipation` to filter `banner_analytics` by both `banner_id` AND products belonging to the seller (join with products table or use `product_id` field).

**File**: `src/components/seller/SellerFestivalParticipation.tsx`

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/FestivalCollectionPage.tsx` | Add `bannerId` to `resolveProducts` call |
| Migration: fix `resolve_banner_section_products` | Add `sp.verification_status = 'approved'` |
| Migration: update `active_banners_for_society` | Auto-expire stale banners |
| Migration: create `banner-images` storage bucket + RLS | New bucket for image uploads |
| `src/components/admin/BannerImageUpload.tsx` | New drag-drop upload component |
| `src/components/admin/AdminBannerManager.tsx` | Integrate image upload, add Draft/Publish buttons |
| `src/components/seller/SellerFestivalParticipation.tsx` | Fix analytics to be seller-specific |

## Safety
- No changes to existing RLS policies
- Backward compatible — existing banners continue working
- Storage bucket uses authenticated-only upload policy
- Auto-expire only affects banners past their `schedule_end`

