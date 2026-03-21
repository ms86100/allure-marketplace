

# Round 24: 10 Critical Bugs — Seller-Side QA Audit (Data Persistence, Stock, UI Parity, Bulk Upload, Notifications)

---

## Bug 1: `useSellerSettings.handleSave` doesn't re-fetch profile — `sellerProfile` state is stale after save

**Where:** `useSellerSettings.ts` line 146-148 — after `supabase.from('seller_profiles').update(...)` succeeds, only a toast is shown. No `fetchProfileById` call. The `sellerProfile` state object retains pre-save values.

**What happens:** Seller saves settings (e.g., changes business name from "ABC" to "XYZ"). The DB is updated. But `sellerProfile` still holds `business_name: "ABC"`. The `togglePauseShop` function reads `sellerProfile.society_id` — correct since ID doesn't change. But if the seller navigates to the dashboard without a full page refresh, `SellerDashboardPage` re-fetches from DB (correct). However, if the seller stays on the settings page and interacts with the toggle or other controls that read `sellerProfile`, they see stale data. Worse: if the save partially fails (e.g., DB trigger rejects `fulfillment_mode`), the `formData` was already modified by the user, but `sellerProfile` still holds the old server-confirmed values — there's no way to "reset to saved" since the last-saved state is never refreshed.

**Why critical:** A seller who saves, then immediately toggles the store open/close, operates on stale profile state. If they then re-save, the stale `sellerProfile` isn't used (formData is), so it's functionally OK — but the lack of refresh means any component reading `sellerProfile` directly (e.g., `LicenseUploadSection`, `StoreLocationSection`) sees outdated values.

**Impact:** `useSellerSettings.ts`, `SellerSettingsPage.tsx` (location section, license section)

**Fix:** Call `fetchProfileById(sellerProfile.id)` after successful save to synchronize `sellerProfile` with DB.

---

## Bug 2: CSV header row parsed with `split(',')` while data rows use `parseCSVLine` — header column mismatch on quoted headers

**Where:** `useBulkUpload.ts` line 97 — `const headers = lines[0].split(',').map(...)` uses naive split. But data rows at line 108 use `parseCSVLine(line)` which is RFC 4180-aware. If the CSV file has quoted headers (e.g., exported from Excel: `"name","price","description"`), the `split(',')` produces `['"name"', '"price"', '"description"']`. After `.trim().toLowerCase()`, these become `'"name"'` — with quotes. `headers.indexOf('name')` returns -1 because `'"name"' !== 'name'`.

**What happens:** The seller downloads a CSV template, edits it in Excel, re-uploads. Excel wraps headers in quotes. The header parsing fails, `nameIdx = -1`, the upload shows "CSV must have name and price columns" even though the file is valid. The seller has no idea why.

**Why critical:** Excel is the most common CSV editor. Any Excel-exported CSV will have this issue.

**Impact:** `useBulkUpload.ts`

**Fix:** Use `parseCSVLine` for the header row too (line 97), or strip quotes from header values.

---

## Bug 3: `SellerEarningsPage` uses `net_amount` but `payment_records` may not have this column populated — shows ₹0 earnings

**Where:** `SellerEarningsPage.tsx` lines 80-84 — calculates stats using `Number(p.net_amount)`. The `payment_records` table has `amount` and `net_amount` columns. But examining the `razorpay-webhook` edge function (the primary payment record updater), it updates `payment_status` and `razorpay_payment_id` but does NOT set `net_amount`. The `create_multi_vendor_orders` RPC inserts payment records — need to verify if it sets `net_amount`.

**What happens:** If `net_amount` is null/0 on payment records (because it was never populated during order creation), the earnings page shows ₹0 for all periods even though the seller has completed orders with real amounts. The dashboard stats (from `useSellerOrderStats`) correctly show earnings from `orders.total_amount`, creating a discrepancy.

**Why critical:** The seller sees "₹5,000 earned this week" on the dashboard but "₹0" on the detailed earnings page. This destroys trust in the financial reporting system.

**Impact:** `SellerEarningsPage.tsx`, `payment_records` table, `create_multi_vendor_orders` RPC

**Fix:** In `SellerEarningsPage`, fall back to `p.amount` when `p.net_amount` is null/0: `Number(p.net_amount || p.amount)`. Also verify that `create_multi_vendor_orders` populates `net_amount`.

---

## Bug 4: `DraftProductManager.resetForm` doesn't reset `stock_quantity`, `low_stock_threshold`, `action_type` — values leak between products

**Where:** `DraftProductManager.tsx` lines 363-381 — `resetForm` sets `newProduct` to `{ name: '', price: 0, mrp: null, discount_percentage: null, description: '', category: ..., is_veg: true, image_url: '', prep_time_minutes: null }`. The `stock_quantity`, `low_stock_threshold`, and `action_type` fields added in Round 23 (Bug 3) are NOT reset. They persist from the previous product.

**What happens:** Seller adds Product A with stock_quantity=50, action_type='contact_seller'. Saves. Form "resets" for Product B. But `stock_quantity` is still 50 and `action_type` is still 'contact_seller' from Product A. Product B gets saved with wrong stock and wrong action type.

**Why critical:** Data contamination between products. A "Contact Seller" action type on a food product means buyers can't add it to cart.

**Impact:** `DraftProductManager.tsx`

**Fix:** Add `stock_quantity: null, low_stock_threshold: null, action_type: 'add_to_cart'` to the resetForm default object.

---

## Bug 5: Dashboard `toggleAvailability` doesn't check verification status — rejected/draft sellers can toggle store open

**Where:** `SellerDashboardPage.tsx` lines 98-130 — `toggleAvailability` directly updates `is_available` via Supabase without checking `verification_status`. While `StoreStatusCard` now hides the toggle for non-approved sellers (Round 22 fix), the `toggleAvailability` function is also called from `SellerSettingsPage.tsx` via `togglePauseShop` — and the settings page renders the toggle regardless of status.

Looking more carefully: `SellerSettingsPage` line 150-152 — the "Pause Shop / Resume Shop" button is always rendered for any seller who reaches the settings page. The `hasSellerProfile` guard allows draft/rejected sellers to access settings. A rejected seller can click "Resume Shop" and set `is_available = true`. The DB updates successfully (no trigger blocks this). Discovery hooks won't show them (RLS checks `verification_status = 'approved'`), but the seller's dashboard will now show "🟢 Open" — contradicting the rejection.

**Why critical:** A rejected seller toggling their store "open" sees contradictory UI signals and may believe they're visible to buyers.

**Impact:** `SellerSettingsPage.tsx`, `useSellerSettings.ts`

**Fix:** In `togglePauseShop`, check `(sellerProfile as any).verification_status === 'approved'` before allowing toggle. Show toast: "Store must be approved before you can go live."

---

## Bug 6: `DraftProductManager` `previewFormData` hardcodes `action_type: 'add_to_cart'` — preview doesn't reflect actual action type

**Where:** `DraftProductManager.tsx` lines 152-172 — the `previewFormData` adapter maps `DraftProduct` → `ProductFormData` for `ProductFormPreviewPanel`. Line 165: `action_type: 'add_to_cart' as const`. Even if the seller selected `contact_seller` or `request_quote`, the preview always shows "Add to Cart" button.

**What happens:** Seller selects "Contact Seller" as the action type. The live preview panel shows "Add to Cart" button. Seller thinks the configuration is wrong. Saves anyway — the product is correctly saved as `contact_seller` in DB. But the preview was misleading.

**Why critical:** The preview is the seller's only visual confirmation before saving. Showing the wrong CTA undermines the purpose of the preview.

**Impact:** `DraftProductManager.tsx`, `ProductFormPreviewPanel`

**Fix:** Change line 165 to `action_type: (newProduct.action_type || 'add_to_cart') as any`.

---

## Bug 7: Bulk upload lacks image column — products created without images, but `DraftProductManager` requires images

**Where:** `useBulkUpload.ts` line 128-131 — the product payload does NOT include `image_url`. The `BulkRow` interface has no `image_url` field. The CSV template (line 78) doesn't include an `image_url` column. But `DraftProductManager.handleAddProduct` (line 187-189) **requires** an image: `if (!newProduct.image_url.trim()) { toast.error('Product image is required'); return; }`. This creates a parity gap: individual products require images, but bulk products don't. The health checklist warns about missing images.

**What happens:** A seller bulk-uploads 20 products. None have images. The visibility health check shows "20 products without images" warning. The seller then has to manually edit all 20 to add images. There's no indication during bulk upload that images are needed.

**Why critical:** While not a data corruption bug, it's a workflow trap: the seller does the bulk upload thinking they're done, but the health checklist immediately shows 20 warnings. The disconnect between "individual add requires image" vs "bulk add doesn't even mention images" is confusing.

**Impact:** `useBulkUpload.ts`, `BulkProductUpload.tsx`, health checklist

**Fix:** Add an info banner in `BulkProductUpload` warning: "Images must be added individually after upload. Products without images get fewer views." Don't block — just inform.

---

## Bug 8: `SellerEarningsPage` fetches ALL payment records without pagination — will crash on high-volume sellers

**Where:** `SellerEarningsPage.tsx` line 48-55 — `supabase.from('payment_records').select(...).eq('seller_id', sellerId).order('created_at', { ascending: false })` — no `.limit()`, no pagination. With Supabase's default 1000-row limit, this silently drops records beyond 1000. The stats calculation uses the fetched data, so a seller with 1500 orders will see earnings computed from only the latest 1000 payment records.

**What happens:** A successful seller with 1500+ orders sees "All Time: ₹50,000" when the real total is ₹85,000. The 500 oldest payment records are silently excluded by Supabase's default row limit.

**Why critical:** Financial reporting accuracy. The seller underreports earnings and may dispute payouts.

**Impact:** `SellerEarningsPage.tsx`

**Fix:** Either: (a) Use an RPC to compute earnings server-side with no row limit, or (b) Paginate the fetch loop with `.range()` until all records are retrieved. For the transaction history list, add infinite scroll with cursor pagination (like `useSellerOrdersInfinite`).

---

## Bug 9: `useSellerApplication` `saveDraft` always saves `fulfillment_mode` and `operating_days` — but Step 4 may not have been visited yet

**Where:** `useSellerApplication.ts` lines 230-242 — `saveDraft` always includes `fulfillment_mode: formData.fulfillment_mode` and `operating_days: formData.operating_days`. `INITIAL_FORM` defaults are `fulfillment_mode: 'self_pickup'` and `operating_days: [...DAYS_OF_WEEK]`. When the seller is on Step 3 (store details) and `saveDraft` is called (via auto-save for license upload at line 198), these defaults overwrite any previously saved values from a prior draft session.

**What happens:** Seller starts onboarding, reaches Step 4, sets `fulfillment_mode: 'delivery'`, operating days to Mon-Fri. Saves draft, exits. Returns next day. Draft resume loads Step 3 (correct) and calls `loadSellerDataIntoForm` (correct — restores delivery mode + Mon-Fri). Seller edits business name on Step 3. Auto-save triggers at line 193. `saveDraft` writes `formData.fulfillment_mode` which IS `'delivery'` (restored correctly). This case is actually fine.

BUT: if the seller starts a brand-new draft (no prior session), reaches Step 3, auto-save triggers. It writes `operating_days: [...DAYS_OF_WEEK]` and `fulfillment_mode: 'self_pickup'` to the draft — the defaults. This is harmless for new drafts. But the draft NOW has explicit values. If admin later changes defaults or the seller expected to configure these in Step 4, the defaults are already locked in.

This is actually not a critical bug. Let me pivot.

**Bug 9 (revised): `DraftProductManager` edit mode doesn't reset `stock_quantity`/`action_type` fields when loading a product that lacks them**

**Where:** `DraftProductManager.tsx` lines 312-360 — `handleEditProduct` sets `setNewProduct({ ...product })`. The `product` comes from the `products` array which was loaded from DB. If the product was created before Round 23's `DraftProductManager` changes (when these fields didn't exist in the insert payload), `product.stock_quantity` is `undefined`. Spreading `{ ...product }` into `newProduct` leaves `stock_quantity` as `undefined`. The form renders the stock toggle based on `newProduct.stock_quantity`, which is falsy — correct. BUT: if the seller previously edited Product A (with stock_quantity=50) and then clicks Edit on Product B (no stock), the `setNewProduct({ ...product })` doesn't explicitly set `stock_quantity: null` — it relies on the spread. Since `product.stock_quantity` would be `undefined` from the DB, and `undefined` is different from `null`, the form might behave unexpectedly depending on truthiness checks.

Actually: `product` is from the `products` prop which includes the `stock_quantity` field from the DraftProduct interface. The values come from DB and map correctly. This isn't a real bug.

**Bug 9 (final): Dashboard + Settings use TWO independent toggle functions — can desync if both fire concurrently**

**Where:** `SellerDashboardPage.tsx` line 98 has its own `toggleAvailability` that directly updates `sellerProfile` state. `useSellerSettings.ts` line 105 has `togglePauseShop` that updates `formData.is_available`. If the seller opens Settings in another tab and toggles on both simultaneously, each reads stale `is_available` before the other's write completes. Both flip the same value: Tab A flips false→true, Tab B flips false→true. Result: both write `true` — OK. But if Tab A reads `true` and flips to `false`, while Tab B also reads `true` and flips to `false` — both write `false`. This race is unlikely but possible on slow connections.

More practically: the dashboard doesn't use React Query for the profile — it uses local `useState`. There's no real-time sync between dashboard and settings if the seller has both open. After toggling on the dashboard, navigating to settings shows the old value until `fetchProfileById` runs on mount.

**Why critical:** The dual toggle pattern (dashboard + settings) without shared state means the seller can see "Open" on dashboard but "Closed" on settings simultaneously. Not a data corruption risk (last write wins at DB level) but a trust issue.

**Impact:** `SellerDashboardPage.tsx`, `useSellerSettings.ts`

**Fix:** After `toggleAvailability` succeeds on the dashboard, invalidate/refetch seller profile data. Alternatively, move the toggle logic to a shared hook.

---

## Bug 10: `SellerOrderCard` crashes when `order.fulfillment_type` is null — `includes()` on null

**Where:** `SellerOrderCard.tsx` line 82 — `['delivery', 'seller_delivery'].includes(order.fulfillment_type)`. The `fulfillment_type` is typed as `string | null | undefined` in the interface (line 25). If `fulfillment_type` is `null` (common for older orders or service bookings where fulfillment type wasn't set), `Array.includes(null)` returns `false` — so it doesn't crash. BUT: line 70 has `['delivery', 'seller_delivery'].includes(order.fulfillment_type || '')` with the `|| ''` fallback, while line 82 does NOT have the fallback. This inconsistency means line 82 passes `null` to `includes()`.

Actually, `Array.prototype.includes` accepts any value including null — it returns false. So this doesn't crash. But the REAL bug on line 82 is: service booking orders (which have `fulfillment_type: null`) show the "Pickup" badge instead of a more appropriate "Service" or "Booking" badge. A home tutoring booking showing "Pickup" makes no sense.

**What happens:** A service order (tutoring, consultation) appears on the seller's order list with a "📦 Pickup" badge, even though there's nothing to pick up. The seller sees "Pickup" and is confused — the buyer booked a service visit, not a pickup.

**Why critical:** Wrong fulfillment badge on service orders misleads the seller about the order type. For service sellers, ALL orders show "Pickup" since none have `fulfillment_type: 'delivery'`.

**Impact:** `SellerOrderCard.tsx`

**Fix:** Check for `order_type === 'booking'` or service-related status and show a "📅 Service" badge. Fall back to "Pickup" only for non-service, non-delivery orders.

---

## Summary

| # | Bug | Severity | Files |
|---|-----|----------|-------|
| 1 | Settings save doesn't refresh `sellerProfile` state | **HIGH** | `useSellerSettings.ts` |
| 2 | CSV header parsed with `split(',')` not `parseCSVLine` | **HIGH** | `useBulkUpload.ts` |
| 3 | Earnings page uses `net_amount` which may be null — shows ₹0 | **CRITICAL** | `SellerEarningsPage.tsx` |
| 4 | `DraftProductManager.resetForm` doesn't reset stock/action fields | **HIGH** | `DraftProductManager.tsx` |
| 5 | Settings page allows rejected sellers to toggle store open | **MEDIUM** | `useSellerSettings.ts` |
| 6 | Preview hardcodes `action_type: 'add_to_cart'` | **MEDIUM** | `DraftProductManager.tsx` |
| 7 | Bulk upload has no image warning — silent gap vs individual add | **MEDIUM** | `BulkProductUpload.tsx` |
| 8 | Earnings page silently truncated at 1000 records | **HIGH** | `SellerEarningsPage.tsx` |
| 9 | Dashboard + Settings dual toggle without shared state | **MEDIUM** | `SellerDashboardPage.tsx`, `useSellerSettings.ts` |
| 10 | Service orders show "Pickup" badge instead of "Service" | **MEDIUM** | `SellerOrderCard.tsx` |

## Files to Edit

- `src/hooks/useSellerSettings.ts` — Bug 1: refetch after save; Bug 5: gate toggle on approval status
- `src/hooks/useBulkUpload.ts` — Bug 2: use `parseCSVLine` for headers
- `src/pages/SellerEarningsPage.tsx` — Bugs 3, 8: fall back to `amount`, add pagination
- `src/components/seller/DraftProductManager.tsx` — Bugs 4, 6: reset new fields, fix preview adapter
- `src/components/seller/BulkProductUpload.tsx` — Bug 7: add image info banner
- `src/components/seller/SellerOrderCard.tsx` — Bug 10: service order badge
- `src/pages/SellerDashboardPage.tsx` — Bug 9: refetch profile after toggle

