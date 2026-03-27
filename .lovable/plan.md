

# Production Launch Readiness — 2 Deliverables

## Deliverable 1: Error Boundaries on Unprotected Critical Routes

**Problem:** 13 critical routes lack `RouteErrorBoundary`. If any of these pages throw a render error, the buyer/seller sees a blank screen or the global error fallback (full app crash). Routes that already have boundaries (Cart, Orders, OrderDetail, Seller Dashboard, Auth) are fine.

**Unprotected routes that need wrapping:**

| Route | Section Name | Why Critical |
|-------|-------------|--------------|
| `/` (HomePage) | Home | First screen every buyer sees |
| `/search` | Search | Primary discovery flow |
| `/seller/:id` | Seller Store | Checkout entry point |
| `/profile` | Profile | Account access |
| `/profile/edit` | Profile Edit | Account management |
| `/notifications/inbox` | Notifications | Trust signal |
| `/favorites` | Favorites | Saved items |
| `/categories` | Categories | Browse flow |
| `/category/:category` | Category | Browse flow |
| `/community` | Community | Social feature |
| `/subscriptions` | Subscriptions | Recurring orders |
| `/disputes` | Disputes | Trust/support |
| `/admin` | Admin | Admin panel |

**Change:** Single file edit in `src/App.tsx` — wrap each `<Route>` element with `<RouteErrorBoundary sectionName="...">`. No new components, no refactoring. Each boundary lets the user tap "Go Back" or "Retry" instead of seeing a dead screen.

---

## Deliverable 2: Production Launch Checklist PDF

A downloadable PDF document with every critical buyer and seller flow, step-by-step, with pass/fail checkboxes. You test on your real device, check off each step, and report only the ones that fail.

### Buyer Flows Covered:

**Flow 1: Signup and Login**
1. Open app → see landing page
2. Tap "Sign Up" → enter email, password → submit
3. Check email for verification link → tap it
4. Log in with credentials → land on home page
5. **Pass:** Home page loads with location prompt

**Flow 2: Browse and Search**
1. Tap search bar → type a product name
2. Results appear with images, prices, seller names
3. Tap a product → seller detail page opens
4. Tap category from home → category page loads with products
5. **Pass:** All navigation smooth, back button works

**Flow 3: Add to Cart and Checkout**
1. From seller page, tap "Add to Cart" on an item
2. Add a second item from a different seller
3. Tap cart icon → see both items grouped by seller
4. Adjust quantity up/down → totals update
5. Remove one item → cart updates
6. Tap "Proceed to Checkout" → address/payment screen
7. Select COD → place order
8. **Pass:** Order confirmation shown, order appears in Orders tab

**Flow 4: Pre-Order Flow**
1. Find a pre-order product (marked with pre-order badge)
2. Add to cart → cart shows pre-order date picker
3. Select a valid date (respects lead time)
4. Place order → order shows scheduled delivery date
5. **Pass:** Order detail shows "Scheduled for [date]"

**Flow 5: Order Tracking**
1. Go to Orders tab → see list of orders
2. Tap an order → see order detail with status timeline
3. Status updates reflect in real-time
4. Dynamic Island shows delivery progress (iOS)
5. **Pass:** Status matches seller's actions, no phantom states

**Flow 6: Payment (UPI/Razorpay)**
1. Add items to cart → checkout
2. Select UPI/Online payment
3. Razorpay sheet opens from bottom (not full screen)
4. Complete payment → return to app
5. **Pass:** Order confirmed, payment status = paid

**Flow 7: Notifications**
1. Place an order → receive notification
2. Tap notification → navigates to order detail
3. Open notification inbox → see all notifications
4. Tap "Mark all read" → badge clears
5. **Pass:** Badge count matches unread count, actions work

**Flow 8: Profile and Settings**
1. Go to Profile → see name, flat, society
2. Tap Edit → change display name → save
3. Change saved → profile shows new name
4. **Pass:** No errors, changes persist after app restart

### Seller Flows Covered:

**Flow 9: Seller Dashboard**
1. Switch to seller mode → dashboard loads
2. See pending orders count, today's earnings
3. **Pass:** Numbers match actual orders

**Flow 10: Product Management**
1. Go to Products → see product list
2. Tap "Add Product" → fill form with image, price, category
3. Enable pre-order → set lead time
4. Save → product appears in list
5. Edit product → change price → save
6. Toggle product active/inactive
7. **Pass:** All changes reflect in buyer-facing store

**Flow 11: Order Management**
1. Receive new order notification (with sound)
2. Open seller dashboard → see new order
3. Tap order → see details with items, buyer info
4. Accept order → status changes to "Accepted"
5. Mark as preparing → shipped → delivered
6. **Pass:** Each status transition updates buyer's order detail

**Flow 12: Seller Earnings**
1. Go to Earnings page → see total, pending, settled
2. Filter by date range
3. **Pass:** Numbers match completed orders

### Cross-Cutting Tests:

**Flow 13: Offline Behavior**
1. Turn off WiFi/data
2. Navigate around → see offline banner
3. Turn data back on → banner disappears, data refreshes
4. **Pass:** No crash, no blank screens

**Flow 14: App Kill and Cold Start**
1. Force-quit the app
2. Reopen → should restore session without login
3. Navigate to orders → data loads
4. **Pass:** No blank screen, no re-login required

**Flow 15: Location Change**
1. Change delivery address → marketplace updates
2. Products from new location's sellers appear
3. **Pass:** No stale data from previous location

---

## Technical Summary

| Deliverable | Files Changed | Risk |
|-------------|--------------|------|
| Error boundaries | `src/App.tsx` only | Zero — additive wrapping, no logic change |
| Checklist PDF | New file in `/mnt/documents/` | Zero — no code change |

## Implementation Order
1. Generate the PDF checklist first (you can start testing immediately)
2. Add error boundaries to App.tsx (2-minute change)

