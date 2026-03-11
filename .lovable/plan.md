

# Unified Admin Review System & Notification Fix

## Root Cause Analysis

After thorough investigation, here is what is broken and why:

### Problem 1: Three divergent code paths for seller approval/rejection
There are **three separate places** where seller status changes happen, and they have inconsistent behavior:

| Code Path | Rejection Note | In-App Notification | Push Notification |
|---|---|---|---|
| `useSellerApplicationReview.ts` (Admin Panel → Sellers tab) | Saves `rejection_note` | Inserts `user_notifications` | Sends push |
| `useAdminData.ts` (Admin Panel → Sellers section) | Saves `rejection_note` | Inserts `user_notifications` | Sends push |
| `useSocietyAdmin.ts` (Society Admin → Sellers tab) | **Does NOT save** | **Does NOT insert** | **Does NOT send** |

The Society Admin path (the one actually being used) is completely missing notification and rejection note logic.

### Problem 2: Product approvals have NO notifications at all
- `AdminProductApprovals.tsx` updates `approval_status` but never inserts into `user_notifications` and never sends push
- `useSellerApplicationReview.ts` `updateProductStatus()` also has no notification logic
- Products have no `rejection_note` column in the database

### Problem 3: Separate admin screens with duplicated logic
- Admin Panel has separate tabs for "Sellers" and "Products"
- Society Admin has its own "Sellers" tab with bare-bones logic
- The unified `SellerApplicationReview` component already shows sellers + licenses + products together, but product notifications are missing from it

### Problem 4: Rejection reason is never enforced
- All rejection flows have the reason as optional
- Society Admin doesn't even have a text input for rejection reason

---

## Implementation Plan

### Phase 1: Database — Add `rejection_note` to products table

Create a migration to add `rejection_note` column to `products` table (mirroring `seller_profiles.rejection_note`).

```sql
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS rejection_note text DEFAULT NULL;
```

### Phase 2: Create shared notification helper — `src/lib/admin-notifications.ts`

A single, reusable function that ALL admin actions call. This eliminates code duplication across three hooks.

```text
notifySellerStatusChange(userId, businessName, status, rejectionNote?)
  → inserts user_notifications row
  → calls sendPushNotification()

notifyLicenseStatusChange(userId, licenseType, status, adminNotes?)
  → inserts user_notifications row
  → calls sendPushNotification()

notifyProductStatusChange(userId, productName, businessName, status, rejectionNote?)
  → inserts user_notifications row
  → calls sendPushNotification()
```

All content is dynamically built from the parameters passed in — no hardcoded messages.

### Phase 3: Fix `useSellerApplicationReview.ts` — product notifications

Update `updateProductStatus()` to:
1. Look up the seller's `user_id` and `business_name` from the loaded applications
2. Save `rejection_note` to the product when rejecting
3. Call `notifyProductStatusChange()` for both approve and reject
4. **Require** rejection reason before allowing reject (enforce in UI)

### Phase 4: Fix `AdminProductApprovals.tsx` — product notifications

Update `handleApprove()` and `handleReject()` to:
1. Fetch seller's `user_id` via the product's `seller_id`
2. Save `rejection_note` to the product
3. Call `notifyProductStatusChange()`
4. **Require** rejection reason before allowing reject

### Phase 5: Fix `useSocietyAdmin.ts` — full notification + rejection support

Replace the minimal `updateSellerStatus()` with one that:
1. Fetches `user_id` and `business_name` 
2. Saves `rejection_note` to `seller_profiles`
3. Calls `notifySellerStatusChange()`
4. Manages seller role (existing logic)

### Phase 6: Update Society Admin UI — require rejection reason

In `SocietyAdminPage.tsx`, replace the instant reject button (X) with a confirmation dialog that:
1. Shows a textarea for rejection reason (required)
2. Only enables "Confirm Reject" when reason is entered
3. Passes the reason to the updated `updateSellerStatus()`

### Phase 7: Enforce rejection reason across ALL admin UIs

In `SellerApplicationReview.tsx`:
- Seller rejection: already has textarea, make it required (disable confirm button when empty)
- License rejection: already has textarea, make it required
- Product rejection: already has textarea, make it required

In `AdminProductApprovals.tsx`:
- Already has textarea, make it required

### Phase 8: Seller-side product rejection feedback

Update seller product management to show `rejection_note` from the products table, so sellers can see why each product was rejected and edit accordingly.

### Phase 9: Remove duplicate `AdminProductApprovals` standalone component

Since `SellerApplicationReview` already shows products per-seller with approve/reject, the standalone `AdminProductApprovals` tab creates confusion. Two options:
- Keep it but ensure it also triggers notifications (done in Phase 4)
- The unified review in `SellerApplicationReview` is the primary interface; the standalone view serves as a quick-filter for all pending products across sellers

Both will share the same notification helper, so behavior stays consistent.

---

## Files to Create/Modify

| File | Change |
|---|---|
| **NEW** `src/lib/admin-notifications.ts` | Shared notification functions |
| `supabase/migrations/...` | Add `rejection_note` to products |
| `src/hooks/useSellerApplicationReview.ts` | Use shared helper, add product notifications, enforce reason |
| `src/hooks/useSocietyAdmin.ts` | Add rejection note + notification + push |
| `src/hooks/useAdminData.ts` | Use shared helper (deduplicate) |
| `src/components/admin/AdminProductApprovals.tsx` | Add notifications, enforce reason, save rejection_note |
| `src/components/admin/SellerApplicationReview.tsx` | Enforce required rejection reason in UI |
| `src/pages/SocietyAdminPage.tsx` | Add rejection reason dialog for sellers |
| `src/components/seller/DraftProductManager.tsx` or equivalent | Show product rejection_note to seller |

---

## What stays untouched (frozen)

- Push notification infrastructure (`usePushNotifications.ts`, `PushNotificationProvider.tsx`)
- `notification_queue` processing edge functions
- `useUnreadNotificationCount.ts` / `useNotifications.ts` (already working correctly)
- Bell icon badge logic (already fixed and working)

## Outcome

- **Single shared notification layer** — impossible for paths to diverge again
- **Rejection reason required** everywhere — admin must explain
- **Instant in-app + push notifications** for all seller/license/product status changes
- **Data always preserved** — rejection never deletes seller data
- **Dynamic content** — all notification text built from DB fields

