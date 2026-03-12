

# Notification System: Investigation & Comprehensive Audit

## Root Cause: Admin Not Notified on New Store Submission

In `src/hooks/useSellerApplication.ts` (line 264-294), when a seller clicks "Submit for Review", the code updates `verification_status` to `'pending'` but **never enqueues any notification for admins**. There is also no database trigger on `seller_profiles` that fires a notification when `verification_status` changes to `'pending'`.

**Fix:** After the seller profile update succeeds, call a new notification function (or use the existing `notifySocietyAdmins`) to notify all admin-role users that a new store application is awaiting review. Similarly, when a product is submitted for review (status changes to `'pending'`), admins should be notified.

---

## Current State (As-Is): All Notification Flows

### A. Database Triggers (automatic, server-side)

| Trigger | Event | Recipient | Push | In-App |
|---|---|---|---|---|
| `enqueue_order_status_notification` | Order status changes (placed, accepted, preparing, ready, picked_up, delivered, completed, cancelled, confirmed, no_show, etc.) | Buyer + Seller (varies by status) | Yes | Yes |
| `enqueue_review_notification` | New review created | Seller | Yes | Yes |
| `enqueue_dispute_status_notification` | Dispute status changes (under_review, resolved, rejected) | Dispute submitter | Yes | Yes |
| `enqueue_settlement_notification` | Settlement created | Seller | Yes | Yes |

### B. Edge Functions (scheduled/invoked)

| Function | Event | Recipient | Push | In-App |
|---|---|---|---|---|
| `send-booking-reminders` | 1 hour before appointment | Buyer + Seller | Yes | Yes |
| `process-notification-queue` | Processes queued notifications | N/A (processor) | Yes | Yes |
| `send-campaign` | Admin broadcast campaign | Targeted users | Yes | Yes |
| `generate-weekly-digest` | Weekly digest | Society members | Yes | Yes |
| `generate-society-report` | Monthly report | Society members | Yes | Yes |
| `detect-collective-issues` | Pattern detection in complaints | Society admins | Yes | Yes |

### C. Client-Side Notifications (in-code inserts to `notification_queue`)

| Location | Event | Recipient | Push | In-App |
|---|---|---|---|---|
| `admin-notifications.ts` → `notifySellerStatusChange` | Admin approves/rejects/suspends seller | Seller | Yes | Yes |
| `admin-notifications.ts` → `notifyLicenseStatusChange` | Admin approves/rejects license | Seller | Yes | Yes |
| `admin-notifications.ts` → `notifyProductStatusChange` | Admin approves/rejects product | Seller | Yes | Yes |
| `society-notifications.ts` → `notifySocietyAdmins` | Dispute filed, snag reported | Society admins | Yes | Yes |
| `society-notifications.ts` → `notifySocietyMembers` | Bulletin posts, community events | Society members | Yes | Yes |
| `ServiceBookingFlow.tsx` | New service booking | Seller | Yes | No |
| `BuyerCancelBooking.tsx` | Buyer cancels booking | Seller | Yes | No |
| `SellerPaymentConfirmation.tsx` | Payment confirmed | Buyer | Yes | No |
| `UpiDeepLinkCheckout.tsx` | UPI payment initiated | Seller | Yes | No |
| `useSellerChat.ts` | New chat message (throttled 60s) | Recipient | Yes | No |
| `GuardManualEntryTab.tsx` | Gate entry request | Resident | Yes | No |
| `manage-delivery` edge fn | Delivery OTP, rider at gate | Buyer | Yes | Yes |
| `update-delivery-location` edge fn | Delivery delay / arrival | Buyer | Yes | Yes |
| `pushDiagnostics.ts` | Test notification | Self | Yes | Yes |

### D. Missing Notifications (Gaps Found)

| Event | Who Should Be Notified | Currently Notified? |
|---|---|---|
| **New store submitted for review** | **Admins** | **NO** |
| **Product submitted for review** | **Admins** | **NO** |
| **Product resubmitted after edit** | **Admins** | **NO** |
| New user registration (pending approval) | Society admins | NO |
| Seller resubmits rejected application | Admins | NO |
| New society request | Platform admins | NO |
| Delivery partner assigned to order | Seller | NO |
| Coupon/promotion activated by seller | Buyers who favorited | NO |
| Seller goes online/offline | Subscribed buyers | NO |
| New product added by favorite seller | Buyer | NO |
| Report filed against seller/product | Admins | NO |

---

## Future State (To-Be): Comprehensive Notification Framework

### Priority 1 — Fix Critical Gaps (this implementation)

1. **New store submission → Notify admins** (push + in-app)
   - In `useSellerApplication.ts` `handleSubmit`, after successful update, call a new `notifyAdminsNewApplication()` function
   - Fetches all users with `admin` role from `user_roles` table
   - Enqueues: "🏪 New Store Application — {businessName} submitted for review"
   - Reference path: `/admin` (moderation tab)

2. **Product submitted for review → Notify admins** (push + in-app)
   - Create a DB trigger `enqueue_product_review_notification` on `products` table
   - Fires when `approval_status` changes TO `'pending'`
   - Notifies all admin-role users
   - Enqueues: "📦 New Product for Review — {productName} from {businessName}"

3. **Seller resubmission after rejection → Notify admins** (push + in-app)
   - Same trigger as #1, fires when `verification_status` changes from `rejected` to `pending`

### Priority 2 — Operational Completeness

4. **New user pending approval → Notify society admins**
5. **New society request → Notify platform admins**
6. **Report filed → Notify admins**
7. **Delivery partner assigned → Notify seller**

### Priority 3 — Engagement & Retention

8. **New product from favorite seller → Notify buyer**
9. **Seller back online → Notify recent buyers**
10. **Price drop on wishlisted item → Notify buyer**
11. **Order review reminder (24h after delivery) → Notify buyer**

### Implementation Approach for Priority 1

**File changes:**
- `src/lib/admin-notifications.ts` — Add `notifyAdminsNewStoreApplication()` and `notifyAdminsNewProductSubmission()` functions that query `user_roles` for admins, then insert into `notification_queue`
- `src/hooks/useSellerApplication.ts` — Call `notifyAdminsNewStoreApplication()` after successful submission (line ~289)
- **New DB migration** — Create trigger `enqueue_product_pending_review_notification` on `products` table for `approval_status` changing to `'pending'`
- `src/hooks/useSellerProducts.ts` — If products are submitted for review from the product management page, also notify admins

**No frozen files are touched.** All changes go through the existing `notification_queue` → `process-notification-queue` pipeline.

