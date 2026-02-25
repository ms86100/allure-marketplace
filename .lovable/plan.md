

## Analysis: Sellers + Products Tab Structure

### Current State

**Sellers tab** (`SellerApplicationReview`): Shows seller applications as expandable cards. When expanded, each card already displays:
- Store details (name, address, payment methods, schedule, fulfillment)
- Licenses (with per-license approve/reject)
- Products list (up to 6 shown, with status badges) -- but **no approve/reject actions** on products here

**Products tab** (`AdminProductApprovals`): Shows pending products in isolation with approve/reject buttons, but only shows the seller's business name -- no store context, no license status, no relationship to the seller's overall approval.

### Recommendation: Merge into One Tab

The two-tab split is **not ideal** for this use case. Here is why:

1. The Sellers tab already shows products inline but without action buttons -- this is a missed opportunity
2. The Products tab shows products without seller context -- the admin cannot see if the seller is approved, what licenses they hold, or their store details
3. Approving a seller already cascades approval to all their pending products (per existing logic) -- so the separate Products tab creates confusion about what was already auto-approved
4. An admin reviewing a product naturally wants to see: who is selling it, are they verified, is their license valid? That context only exists in the Sellers tab

### Plan: Unified Seller Review with Inline Product Actions

#### Change 1: Add per-product approve/reject buttons inside the Sellers tab

In `SellerApplicationReview.tsx`, the products section (lines 194-215) currently shows products as read-only badges. Enhance each product row to include:
- Approve / Reject buttons (same style as the Products tab)
- Rejection note textarea (inline, same pattern as license rejection)
- Status update via the same `products.update` call used in `AdminProductApprovals`

This gives the admin a single, contextual view: seller details + licenses + products with actions, all in one expandable card.

#### Change 2: Remove the standalone Products tab

Remove the `products` entry from `TAB_CONFIG` in `AdminPage.tsx` (line 78) and remove the `TabsContent` block (lines 167-169). Remove the `AdminProductApprovals` import.

The `AdminProductApprovals.tsx` file can be kept but will no longer be rendered -- or deleted entirely.

#### Change 3: Add a "Pending Products" count badge on the Sellers tab

To ensure visibility, add a small badge on the Sellers tab trigger showing the count of pending products across all sellers, so nothing gets overlooked.

#### Change 4: Show ALL products (not capped at 6)

Currently `seller.products.slice(0, 6)` limits the view. Remove this cap and use a `ScrollArea` with max height so all products are accessible.

### Files to modify
| File | Change |
|------|--------|
| `src/components/admin/SellerApplicationReview.tsx` | Add per-product approve/reject actions inline |
| `src/hooks/useSellerApplicationReview.ts` | Add product approval/rejection methods |
| `src/pages/AdminPage.tsx` | Remove Products tab from `TAB_CONFIG` and `TabsContent` |

### What will NOT change
- No database changes
- No RLS changes
- The `AdminProductApprovals.tsx` component file remains (unused) for potential future use
- Seller approval cascade logic remains intact
- All existing seller review functionality stays as-is

