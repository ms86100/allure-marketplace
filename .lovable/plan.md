

## Audit: Booking & Messaging Flow (Buyer → Seller)

### Flow Traced

1. Buyer taps **Book** on a product → `ProductDetailSheet` calls `handleAdd()` → opens `ProductEnquirySheet`
2. Buyer writes message, taps **Send Booking Request**
3. `ProductEnquirySheet.handleSubmit()` creates an `orders` row with `status: 'enquired'`, `order_type: 'enquiry'`
4. It then creates a `chat_messages` row with `receiver_id: sellerId`
5. Buyer is navigated to `/orders/{orderId}` (the order detail page)

### Critical Issues Found

---

#### Issue 1 — Chat message `receiver_id` is wrong (CRITICAL)

`ProductEnquirySheet` receives `sellerId` which is `seller_profiles.id` (a seller profile UUID). But `chat_messages.receiver_id` expects a **user UUID** (`auth.users.id` / `profiles.id`). The seller's `user_id` is a different column on `seller_profiles`.

This means:
- The chat message is addressed to a non-existent user ID
- The seller **never sees** the message in their chat
- The `OrderChat` component on the seller's side uses `seller.user_id` to determine `chatRecipientId`, so the IDs never match

**Fix**: Before inserting the chat message, look up `seller_profiles.user_id` from the `sellerId`, or pass `sellerUserId` through the component chain.

---

#### Issue 2 — No notification is sent for enquiry orders (CRITICAL)

The database trigger `enqueue_order_status_notification` fires on ORDER UPDATE (status changes). The trigger `enqueue_order_placed_notification` fires on INSERT but only when `status = 'placed'`. Enquiry orders are inserted with `status = 'enquired'`, which **neither trigger handles**.

Result: The seller gets **zero push notifications** when a booking request arrives.

**Fix**: Extend `enqueue_order_placed_notification` to also handle `status = 'enquired'`, or add a new trigger for enquiry notifications.

---

#### Issue 3 — No buyer contact details shared with seller

The enquiry sheet says "Your contact details will be shared with the seller" but **no buyer details are actually included**. The order row only stores `buyer_id`. The chat message contains just the booking text.

The seller can see buyer name/phone on the order detail page (line 137 of `OrderDetailPage.tsx`) via the `buyer:profiles` join — but **only if the profile has a phone number**. Email is never fetched or displayed.

**Fix**: Include buyer phone and email in the initial chat message or in the order `notes` field, so the seller has immediate context without navigating.

---

#### Issue 4 — No product/category reference stored on the enquiry order

The order stores the product name inside `notes` as free text (`"Book Service for: Product Name\n\nuser message"`), but there is no `product_id` or `category` column linkage. If a seller has many products, parsing the notes is fragile.

The `order_items` table is not used for enquiry orders — no item row is created.

**Fix**: Create an `order_items` entry linking the enquiry to the specific `product_id`, including price and category, so the seller dashboard can show structured context.

---

#### Issue 5 — Seller has no dedicated enquiry inbox

Enquiry orders with `status: 'enquired'` are mixed into the general orders list. The seller order filters (`SellerOrderCard`, `OrderFilters`) may not have an explicit filter for `enquired` status, making these easy to miss.

---

### Implementation Plan

#### Step 1 — Fix chat `receiver_id` (Critical)

In `ProductEnquirySheet.handleSubmit()`:
- After creating the order, query `seller_profiles` to get the `user_id` for the given `sellerId`
- Use that `user_id` as `receiver_id` in the chat message insert
- Alternatively, pass `sellerUserId` as a prop from `ProductDetailSheet` (which already has access to seller data)

#### Step 2 — Add enquiry notification trigger

Create a database migration that updates `enqueue_order_placed_notification` to also fire when `NEW.status = 'enquired'`, sending a notification like:
- Title: "📋 New Booking Request!"
- Body: "{buyerName} sent a booking request. Tap to view."

#### Step 3 — Include buyer details in the initial message

Enrich the chat message with buyer contact info:
- Fetch buyer's phone and email from `profiles` table
- Append a structured block at the end of the chat message: "Contact: {phone} | {email}"
- This ensures the seller sees it immediately in the chat thread

#### Step 4 — Create an order_item for enquiry orders

After inserting the order, also insert into `order_items` with:
- `product_id`, `product_name`, `quantity: 1`, `unit_price: price`, `category`
- This gives the seller structured product/category context on the order detail page

#### Step 5 — Ensure enquiry orders are visible in seller filters

Verify `OrderFilters` and `SellerOrderCard` include `enquired` status. If not, add it to the filter options.

---

### What Does NOT Change

- `OrderChat` component — already works correctly once `receiver_id` is fixed
- `OrderDetailPage` — already shows buyer/seller info and notes
- Realtime subscription on `chat_messages` — already functional
- Order status transition validator — already allows `enquired → quoted → accepted`

### Risk Assessment

- **Issue 1** (wrong receiver_id) is a **data integrity bug** — every enquiry chat sent so far has been misrouted. Fixing it is backward-compatible; old messages remain orphaned but new ones will work.
- **Issue 2** (missing notification) means sellers currently have **no awareness** of incoming booking requests unless they manually check orders.
- Issues 3-5 are quality improvements that significantly affect usability.

