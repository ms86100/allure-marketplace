

# Pre-Order Investigation Results

## Current State — What Already Exists

### Seller Side (Complete)
The seller can configure pre-orders per product in the product form:
- **"Hours in advance"** input → saves to `products.lead_time_hours`
- **"Accept Pre-orders"** toggle → saves to `products.accepts_preorders`
- Both fields persist correctly to the database
- Category-level defaults also exist: `category_config.accepts_preorders`, `category_config.lead_time_hours`, `category_config.preorder_cutoff_time`

### Buyer Side (NOT Implemented)
**Pre-orders are completely non-functional for buyers.** Despite the seller configuring `accepts_preorders = true` and `lead_time_hours = 5`, the buyer experience is identical to a regular immediate order:

| What's missing | Impact |
|---|---|
| No date/time picker in checkout | Buyer can't select a future delivery date |
| No `lead_time_hours` enforcement | Buyer can place an order without required advance notice |
| No pre-order indicator on product cards | Buyer doesn't know a product is pre-order only |
| No `scheduled_date` / `scheduled_time` passed to `create_multi_vendor_orders` | Order has no scheduled fulfillment date |
| No seller-side visibility of scheduled date on order detail | Seller doesn't know when to prepare |

### Database (Partially Ready)
The `orders` table already has: `scheduled_date`, `scheduled_time_start`, `scheduled_time_end` — but these are never populated by the cart/checkout flow.

---

## Implementation Plan (Zero Breaking Changes)

### Step 1: Pre-order indicator on product cards and detail sheet
**Files:** `ProductListingCard.tsx`, `ProductDetailSheet.tsx`
- If `product.accepts_preorders === true`, show a small badge like "Pre-order • 5hr advance"
- Read `lead_time_hours` from the product row (already fetched in detail sheet via `useProductDetail`)
- **Risk:** None — purely additive UI. No existing logic touched.

### Step 2: Date/time picker in checkout for pre-order items
**Files:** `CartPage.tsx`, `useCartPage.ts`, new component `PreorderDatePicker.tsx`
- Detect if any cart item has `accepts_preorders = true`
- If yes, show a date+time picker section in checkout between fulfillment and payment
- Picker enforces `lead_time_hours` as minimum: earliest selectable time = `now + max(lead_time_hours)` across all pre-order items in cart
- Store selected datetime in `useCartPage` state
- **Risk:** Low — additive section in checkout. Existing immediate orders are unaffected (picker only appears when pre-order items are present).

### Step 3: Pass scheduled date to order creation
**Files:** `useCartPage.ts`, possibly the `create_multi_vendor_orders` RPC
- Add `_scheduled_date` and `_scheduled_time_start` parameters to the RPC call
- The RPC already has `scheduled_date` / `scheduled_time_start` columns on `orders` — just needs to populate them
- For non-pre-order carts, these remain `null` (no behavior change)
- **Risk:** Medium — requires RPC modification. Must ensure backward compatibility (parameters default to `null`).

### Step 4: Seller-side scheduled date visibility
**Files:** Order detail components on seller side
- Display the scheduled date/time on the seller's order detail when present
- **Risk:** None — purely additive display logic.

---

## Modules Potentially Impacted

| Module | Impact | Risk Level |
|---|---|---|
| `CartPage.tsx` | New UI section for date picker | Low — additive only |
| `useCartPage.ts` | New state + pass scheduled date to RPC | Low — additive state |
| `create_multi_vendor_orders` RPC | New optional parameters | Medium — must default to null |
| `ProductListingCard.tsx` | Pre-order badge | None — display only |
| `ProductDetailSheet.tsx` / `useProductDetail.ts` | Pre-order badge + lead time display | None — display only |
| Seller order detail | Show scheduled date | None — display only |
| Notification system | No change needed initially | None |
| Payment flow | No change | None |
| Stock enforcement | No change | None |

## Safeguards
- All changes are additive; no existing behavior is modified
- Pre-order picker only renders when `accepts_preorders` items are in cart
- Non-pre-order orders continue to pass `null` for scheduled fields
- RPC parameters default to `null` for backward compatibility
- Each step can be implemented and tested independently

