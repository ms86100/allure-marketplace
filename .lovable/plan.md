

# App Store Rejection Risks & Trust-Breaking Bugs — Honest Audit

## Dimension 1: App Store Policy Violations

### Bug 1: "First Order Protected — Instant Refund" Promise with No Backend Implementation
**Severity: App Store Rejection Risk (Guideline 2.3.1 — Misleading)**

`FirstOrderBadge.tsx` displays "🛡 First Order Protected" + "Instant refund if something goes wrong" to buyers. But:
- No automated refund mechanism exists anywhere in the codebase
- `process-settlements` has a TODO: "Integrate Razorpay Route transfer here" — settlements don't actually transfer money
- `RefundPolicyPage.tsx` explicitly says the platform "does not guarantee refunds on behalf of individual sellers"

This is a **legally misleading claim** shown in the buyer UI. Apple reviews flag promises the app cannot fulfill.

**Impact if fixed:** Must also update `RefundTierBadge.tsx` which says "Instant refund eligible" for orders under ₹200. Both components reference a non-existent refund engine.

**Fix:** Either (A) remove the badge entirely, or (B) change text to "Satisfaction guaranteed — raise a dispute for resolution" which matches the actual capability (dispute system exists).

---

### Bug 2: Chat Has No Content Moderation, No Block User, No Message Length Limit
**Severity: App Store Rejection Risk (Guideline 1.2 — UGC without moderation)**

`OrderChat.tsx` accepts unlimited-length messages with no sanitization, no profanity filter, no report/block functionality. Apple requires apps with UGC/chat to provide:
- Ability to block abusive users
- Ability to report objectionable content
- Content filtering/moderation

The chat has none of these. The Textarea has no `maxLength` prop. A user could send a 1MB message string.

**Impact if fixed:** Need to add a `ReportSheet` integration for chat messages + a block mechanism. The `reports` table already supports `reported_user_id` — the chat just needs to wire into it.

**Fix:** Add `maxLength={1000}` to chat textarea. Add a "Report" option on long-press of received messages. Add client-side profanity check or lean on the existing `ai-auto-review` edge function.

---

### Bug 3: Bulletin Posts Have No Content Moderation Gate
**Severity: App Store Rejection Risk (Guideline 1.2)**

`BulletinPage.tsx` and `CreatePostSheet` allow users to post text + images to the community board. While the `ai-auto-review` function exists, bulletin posts go live immediately before review. There's no pre-publish moderation, no profanity filter, and posts with images bypass content checking.

Apple requires UGC apps to filter objectionable content before or immediately after publishing.

**Impact if fixed:** Must coordinate with `ai-auto-review` edge function to either queue posts for review or run synchronous content check before publishing.

---

## Dimension 2: Trust-Breaking Bugs (Buyer & Seller)

### Bug 4: Settlements Never Actually Transfer Money
**Severity: P0 — Seller Trust Destruction**

`process-settlements/index.ts` lines 147-163: The settlement flow marks records as "processing" → "settled" without actually transferring money. The Razorpay Route transfer is commented out as TODO. Sellers see "Settled" in their earnings dashboard but never receive funds.

This is the single most trust-destroying bug in the system. A seller who fulfills orders and sees "Settled" will expect money in their bank account.

**Impact if fixed:** Requires Razorpay Route API integration. Must also handle: transfer failures, partial settlements, and retry logic. The `seller_profiles.razorpay_account_id` field already exists for linked accounts.

**Fix:** Either (A) implement Razorpay Route transfers, or (B) change "Settled" label to "Eligible for Payout" and add a manual payout workflow for admins, or (C) hide the earnings dashboard entirely until automated payouts are implemented.

---

### Bug 5: Seller Can See Buyer's Residential Address for ALL Order Types
**Severity: P1 — Privacy Violation / Trust**

The memory doc says "Buyer residential details (block and flat number) are only visible to sellers for delivery fulfillment types." But this needs verification — if the `OrderDetailPage` shows `delivery_address` for service bookings (which are at_seller/home_visit), buyers' home addresses could be exposed unnecessarily for venue-based appointments.

**Impact if fixed:** Must audit `OrderDetailPage` address card rendering conditions. The `DeliveryStatusCard` and address display should be gated on `fulfillment_type === 'delivery'` or `home_visit`.

---

### Bug 6: No Rate Limiting on Client-Side Chat Messages
**Severity: P1 — Abuse / Spam**

`OrderChat.tsx` has no rate limiting. A malicious user can spam hundreds of messages per second by holding Enter. Each message also triggers `process-notification-queue`, meaning the recipient gets flooded with push notifications.

**Impact if fixed:** Must add client-side throttle (e.g., 1 message per second) AND server-side rate limiting on `chat_messages` insert (via RLS or trigger).

---

### Bug 7: `dangerouslySetInnerHTML` in Chart Component Without Full Sanitization  
**Severity: P2 — XSS Risk**

`src/components/ui/chart.tsx` line 91 uses `dangerouslySetInnerHTML` with CSS content derived from theme configuration. While there's a regex sanitizer (`/^[a-zA-Z0-9#(),.\s/%]+$/`), the key names come from chart config which could be user-influenced in admin dashboards. This is a low-probability but high-impact XSS vector.

**Impact if fixed:** Replace `dangerouslySetInnerHTML` with CSS custom properties set via `style` prop, or tighten the sanitization to reject all non-alphanumeric key names.

---

## Dimension 3: Silent Data/Financial Integrity Issues

### Bug 8: Auto-Cancel Orders Function May Cancel Paid Orders
**Severity: P0 — Financial Loss**

`auto-cancel-orders` cancels orders that haven't been accepted within a timeout. But if a Razorpay webhook is delayed (common under load), an order could be `payment_status: 'pending'` at the time of auto-cancel, then receive a successful payment webhook AFTER cancellation. The webhook handler checks `is('razorpay_payment_id', null)` but doesn't check if the order is already cancelled.

**Impact if fixed:** The `razorpay-webhook` handler must check `order.status !== 'cancelled'` before updating payment status. The `auto-cancel-orders` function should skip orders with `payment_type !== 'cod'` that are still awaiting payment confirmation.

---

### Bug 9: Delete Account Doesn't Clean Up All Tables
**Severity: P1 — GDPR/Privacy Compliance**

`delete-user-account/index.ts` cleans specific tables but misses several:
- `bulletin_posts` (user's community posts remain with author_id pointing to deleted user)
- `bulletin_votes` 
- `help_requests`
- `chat_messages` (messages remain readable by the other party)
- `device_tokens` (push tokens linger)
- `notification_queue` / `notifications`

Apple and GDPR require complete data deletion upon request.

**Impact if fixed:** Must enumerate ALL tables with user_id/buyer_id/author_id foreign keys and add cleanup. Chat messages should be anonymized (not deleted) to preserve conversation context for the other party.

---

### Bug 10: Coupon Can Be Applied After Cart Total Changes Below Minimum
**Severity: P2 — Financial Loss**

The memory doc mentions coupons are "re-validated dynamically when the cart total changes" but if the validation only removes the coupon visually without recalculating the order total sent to the backend, a buyer could place an order with an invalid discount.

**Impact if fixed:** Must verify `create_multi_vendor_orders` RPC validates coupon eligibility server-side, not just client-side.

---

## Priority Matrix

| # | Bug | App Store Risk | Trust Risk | Effort |
|---|-----|---------------|------------|--------|
| 1 | False refund promise | **REJECTION** | **P0** | Trivial (text change) |
| 2 | Chat no moderation | **REJECTION** | P1 | Medium |
| 3 | Bulletin no pre-moderation | **REJECTION** | P1 | Medium |
| 4 | Settlements don't transfer money | — | **P0** | High |
| 8 | Auto-cancel vs delayed payment | — | **P0** | Low |
| 6 | Chat spam/no rate limit | — | P1 | Low |
| 9 | Incomplete account deletion | **RISK** | P1 | Medium |
| 5 | Address privacy leak | — | P1 | Low |
| 7 | Chart XSS vector | — | P2 | Trivial |
| 10 | Coupon server validation | — | P2 | Low |

## Dependency Map

```text
Fix Bug 1 (refund badge) ──→ Must also fix RefundTierBadge.tsx
Fix Bug 2 (chat moderation) ──→ Needs ReportSheet wiring + block user RPC
Fix Bug 3 (bulletin) ──→ Needs ai-auto-review synchronous mode OR post queuing
Fix Bug 4 (settlements) ──→ Needs Razorpay Route API + retry logic + seller payout dashboard update
Fix Bug 8 (auto-cancel) ──→ Must also update razorpay-webhook to check order status
Fix Bug 9 (delete account) ──→ Must audit ALL tables with user references
```

## Recommendation

**For immediate App Store submission:** Fix bugs 1, 2, 3 (rejection risks). Bug 1 is a 5-minute text change. Bugs 2 and 3 require moderate work but are Apple's most enforced UGC rules.

**For seller trust:** Bug 4 (fake settlements) must either be implemented or the UI must be changed to not show "Settled" status. Showing sellers they've been paid when they haven't is the fastest way to lose every seller on the platform.

