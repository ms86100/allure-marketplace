

# Notification System — Comprehensive Audit & Plan

## Root Cause Fix (Implemented)

Admin users were not notified when a new store or product was submitted for review. Fixed by:

1. **`notifyAdminsNewStoreApplication()`** in `src/lib/admin-notifications.ts` — queries `user_roles` for admins, enqueues push+in-app notification via `notification_queue`
2. **`handleSubmit` in `useSellerApplication.ts`** — calls the above after successful submission
3. **DB trigger `trg_enqueue_product_review_notification`** on `products` table — fires when `approval_status` changes to `'pending'`, notifies all admins

---

## Current State (As-Is): All Notification Flows

### A. Database Triggers

| Trigger | Event | Recipient | Push | In-App |
|---|---|---|---|---|
| `enqueue_order_status_notification` | Order status changes | Buyer + Seller | ✅ | ✅ |
| `enqueue_review_notification` | New review created | Seller | ✅ | ✅ |
| `enqueue_dispute_status_notification` | Dispute status changes | Submitter | ✅ | ✅ |
| `enqueue_settlement_notification` | Settlement created | Seller | ✅ | ✅ |
| `trg_enqueue_product_review_notification` | Product submitted for review | Admins | ✅ | ✅ |

### B. Edge Functions

| Function | Event | Recipient | Push | In-App |
|---|---|---|---|---|
| `send-booking-reminders` | 1h before appointment | Buyer + Seller | ✅ | ✅ |
| `process-notification-queue` | Queue processor | N/A | ✅ | ✅ |
| `send-campaign` | Admin broadcast | Targeted users | ✅ | ✅ |
| `generate-weekly-digest` | Weekly digest | Society members | ✅ | ✅ |
| `generate-society-report` | Monthly report | Society members | ✅ | ✅ |
| `detect-collective-issues` | Pattern detection | Society admins | ✅ | ✅ |

### C. Client-Side (inserts to `notification_queue`)

| Location | Event | Recipient | Push | In-App |
|---|---|---|---|---|
| `admin-notifications.ts` → `notifySellerStatusChange` | Admin approves/rejects seller | Seller | ✅ | ✅ |
| `admin-notifications.ts` → `notifyLicenseStatusChange` | Admin approves/rejects license | Seller | ✅ | ✅ |
| `admin-notifications.ts` → `notifyProductStatusChange` | Admin approves/rejects product | Seller | ✅ | ✅ |
| `admin-notifications.ts` → `notifyAdminsNewStoreApplication` | Seller submits store | Admins | ✅ | ✅ |
| `society-notifications.ts` → `notifySocietyAdmins` | Dispute/snag | Society admins | ✅ | ✅ |
| `society-notifications.ts` → `notifySocietyMembers` | Bulletin posts | Society members | ✅ | ✅ |
| `ServiceBookingFlow.tsx` | New booking | Seller | ✅ | ❌ |
| `BuyerCancelBooking.tsx` | Buyer cancels | Seller | ✅ | ❌ |
| `SellerPaymentConfirmation.tsx` | Payment confirmed | Buyer | ✅ | ❌ |
| `UpiDeepLinkCheckout.tsx` | UPI payment | Seller | ✅ | ❌ |
| `useSellerChat.ts` | New chat (60s throttle) | Recipient | ✅ | ❌ |
| `GuardManualEntryTab.tsx` | Gate entry | Resident | ✅ | ❌ |
| `manage-delivery` edge fn | Delivery OTP/arrival | Buyer | ✅ | ✅ |
| `update-delivery-location` edge fn | Delivery delay | Buyer | ✅ | ✅ |

---

## Future Gaps (To-Be)

### Priority 2 — Operational
- New user pending approval → Society admins
- New society request → Platform admins
- Report filed → Admins
- Delivery partner assigned → Seller

### Priority 3 — Engagement
- New product from favorite seller → Buyer
- Seller back online → Recent buyers
- Price drop on wishlisted item → Buyer
- Order review reminder (24h after delivery) → Buyer
