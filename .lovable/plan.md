

# 5 Critical Silent Seller Bugs — Pre-Production Audit (Product CRUD Focus)

## Bug 1: Onboarding Products Set `is_available: false` — Contradicts DB Default Fix

**What**: `DraftProductManager.tsx` line 207 hardcodes `is_available: false` for all new products created during onboarding. Similarly, `useBulkUpload.ts` line 163 does the same. However, the previous fix established that products should default to `is_available: true` (DB default was changed). The SellerProductsPage flow (`useSellerProducts.ts`) correctly uses the form's default which is `true`. This means products created during onboarding are unavailable even after approval, forcing the seller to manually toggle each one.

**Where**: `DraftProductManager.tsx` line 207, `useBulkUpload.ts` line 163.

**Why critical**: A seller completes onboarding, adds 5 products, gets approved — but none appear to buyers. They have no idea why. The SellerProductsPage flow works correctly, creating an inconsistency between the two creation paths.

**Impact analysis**:
- `DraftProductManager.tsx` — change `is_available: false` to `is_available: true`
- `useBulkUpload.ts` — change `is_available: false` to `is_available: true`

**Risks**:
1. Products become "available" while still in `draft` status — but RLS/buyer queries already filter by `approval_status = 'approved'`, so draft products won't be visible regardless.
2. No risk to existing products — only affects future inserts.

**Fix**: Line 207 in `DraftProductManager.tsx`: `is_available: true`. Line 163 in `useBulkUpload.ts`: `is_available: true`.

---

## Bug 2: Inconsistent `approval_status` Between Creation Flows

**What**: `useSellerProducts.ts` line 260 sets `approval_status: 'pending'` for new products (from SellerProductsPage). `DraftProductManager.tsx` line 208 sets `approval_status: 'draft'`. This means:
- Products from onboarding → `draft` (needs explicit "Submit for Approval")
- Products from SellerProductsPage → `pending` (auto-submitted)

A seller who adds products post-onboarding never sees the "Submit for Approval" banner because products go straight to `pending`. But products from onboarding sit in `draft` limbo until the seller discovers the Submit button on SellerProductsPage.

**Where**: `useSellerProducts.ts` line 260 vs `DraftProductManager.tsx` line 208.

**Why critical**: Neither behavior is wrong in isolation, but together they create confusion. The seller wonders why some products need manual submission and others don't. The lifecycle documented in memory says "Draft → Pending Review → Approved/Rejected" with explicit submission — so `useSellerProducts.ts` is the one violating the pattern.

**Impact analysis**:
- `useSellerProducts.ts` line 260 — change `'pending'` to `'draft'`
- This aligns both flows: all new products start as `draft`, seller explicitly submits

**Risks**:
1. Sellers who expect instant submission from the products page will now need an extra click — but the "Submit All for Approval" banner is already visible on SellerProductsPage, making the action discoverable.
2. No impact on editing existing products — the edit flow's approval_status logic is unchanged.

**Fix**: `useSellerProducts.ts` line 260: `{ approval_status: 'draft' as const }`.

---

## Bug 3: Onboarding Delete Has No Confirmation — Instant Data Loss

**What**: `DraftProductManager.tsx` line 300-311 — `handleRemoveProduct` deletes the product from DB immediately with no confirmation dialog. On SellerProductsPage, there IS an `AlertDialog` confirmation (line 176-181). The onboarding flow skips this entirely — one tap on the trash icon permanently deletes a product.

**Where**: `DraftProductManager.tsx` line 472, `handleRemoveProduct`.

**Why critical**: A seller who accidentally taps the small trash icon during onboarding loses their product permanently. There's no undo, no confirmation. This is especially dangerous on mobile where touch targets overlap. The SellerProductsPage has confirmation, creating an inconsistency.

**Impact analysis**:
- `DraftProductManager.tsx` — add a `deleteTarget` state + confirmation dialog (matching SellerProductsPage pattern)

**Risks**:
1. Adding a dialog adds complexity to the onboarding flow — mitigate by using the same lightweight `AlertDialog` pattern from SellerProductsPage.
2. The dialog import is already available in the project — no new dependencies.

**Fix**: Add `deleteTarget` state, wrap the trash button to set `deleteTarget` instead of calling `handleRemoveProduct` directly, add an `AlertDialog` at the bottom of the component that calls `handleRemoveProduct` on confirm.

---

## Bug 4: SellerProductsPage Missing Image Validation on Save

**What**: `useSellerProducts.ts` `handleSave` (line 197-224) validates name, category, price, and phone — but does NOT validate `image_url`. The onboarding flow (`DraftProductManager.tsx` line 181) correctly validates: `if (!newProduct.image_url.trim()) errors.image_url = 'Product image is required'`. A seller can save a product from SellerProductsPage with no image, resulting in a product card with a generic icon placeholder — looking unprofessional to buyers.

**Where**: `useSellerProducts.ts` line 202-215 (validation block).

**Why critical**: Products without images convert significantly worse. The onboarding flow enforces this, but the products page (used for all post-onboarding additions) does not. This creates a quality gap as the seller's catalog grows.

**Impact analysis**:
- `useSellerProducts.ts` — add image validation to the errors block
- No other files need changes (the field error rendering for `image_url` already exists in SellerProductsPage line 51)

**Risks**:
1. Existing products without images will show an error when edited — acceptable as it forces quality improvement.
2. The `edit-prod-image_url` scroll target already exists in the page (line 51).

**Fix**: After line 205, add: `if (!formData.image_url) errors.image_url = 'Product image is required';`

---

## Bug 5: Bulk Upload Skips Image Entirely — Products Created Without Images

**What**: `useBulkUpload.ts` creates products via CSV without any image field in the payload (line 156-164). The CSV template doesn't include an `image_url` column. Products are created with `image_url: null`. Combined with Bug 4 (no image validation on edit page), these products can go through the entire lifecycle — draft → pending → approved — without ever having an image.

**Where**: `useBulkUpload.ts` line 156-164 (product payload), line 84-85 (CSV template).

**Why critical**: A seller bulk-uploads 20 products, submits them all for approval. Admin approves them. All 20 appear to buyers with generic icon placeholders. The platform looks unprofessional and buyers don't trust products without images.

**Impact analysis**:
- `useBulkUpload.ts` — add a warning toast after successful save: "Remember to add images to your products by editing them"
- No structural change needed — bulk upload can't reasonably include images in CSV

**Risks**:
1. A toast warning might be dismissed/ignored — but it sets the expectation. The real guard should be on the approval side (admin shouldn't approve imageless products).
2. Adding image_url to the CSV template would be complex (URLs in CSV) — not practical for the bulk flow.

**Fix**: After line 171 (`toast.success`), add: `toast.info('Tip: Edit each product to add images before submitting for approval', { duration: 5000 });`

---

## Summary

| # | Bug | File(s) | Severity | Effort |
|---|-----|---------|----------|--------|
| 1 | Onboarding products default to unavailable | DraftProductManager.tsx, useBulkUpload.ts | High — invisible products | ~2 min |
| 2 | Inconsistent approval_status across flows | useSellerProducts.ts | Medium — confusing lifecycle | ~2 min |
| 3 | Onboarding delete has no confirmation | DraftProductManager.tsx | High — accidental data loss | ~15 min |
| 4 | SellerProductsPage missing image validation | useSellerProducts.ts | Medium — quality gap | ~2 min |
| 5 | Bulk upload creates imageless products silently | useBulkUpload.ts | Low — quality awareness | ~2 min |

All fixes are surgical — no new features, no schema changes, no refactoring.

