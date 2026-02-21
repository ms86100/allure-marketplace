

# Design Thinking KPI Audit -- Gap Analysis & Improvement Plan (Round 2)

## Design Thinking Maturity Scores (Post-Previous Fixes)

| Phase | Previous | Current | Rationale |
|-------|----------|---------|-----------|
| Empathize | Medium | Medium-High | Verification screen, order reassurance, and signup helper text now exist. But `friendlyError` was created and never adopted -- 130+ raw `error.message` toast calls remain across 19 files. |
| Define | Medium | Medium-High | Helper text on signup fields added. Seller rejection guidance exists. Minor gaps remain in dispute and bulletin flows. |
| Ideate | Low | Medium | Cart persistence is DB-backed. Seller drafts exist. But no undo on cancellation and no "save for later" from cart to favorites. |
| Prototype | Medium | High | Order confirmation dialog added. Seller draft flow is strong. Minor: no preview before bulletin post submission. |
| Test | Low | Medium | Feedback mechanism added. But feedback sheet is only on Profile page, not contextually triggered after key moments (post-order, post-cancellation). |

---

## Remaining / New Gaps

### Gap A -- friendlyError Utility Created But Never Adopted (Empathize)

**Problem:** The `friendlyError()` function in `src/lib/utils.ts` was built in the previous round but is imported by zero files. There are 130+ instances of `toast.error(error.message || '...')` across 19 files showing raw technical errors to users.

**User impact:** Users still see "row-level security policy violation" and other system jargon. The fix from the previous round is incomplete.

**Fix:**
- Replace `toast.error(error.message || '...')` with `toast.error(friendlyError(error))` in the 8 highest-traffic files:
  - `CartPage.tsx` (2 instances)
  - `AuthPage.tsx` (3 instances)
  - `BecomeSellerPage.tsx` (2 instances)
  - `OrderDetailPage.tsx` (1 instance)
  - `SellerDashboardPage.tsx` (1 instance)
  - `SellerProductsPage.tsx` (1 instance)
  - `SellerSettingsPage.tsx` (1 instance)
  - `GateEntryPage.tsx` (1 instance)

**Risk:** Low -- purely additive string mapping
**Measure:** Zero raw technical error strings shown to users in core flows

---

### Gap B -- No Contextual Feedback Prompts After Key Moments (Test)

**Problem:** The `FeedbackSheet` only appears as a menu item on the Profile page. Users are never prompted to share feedback at natural moments of delight or frustration (after completing an order, after a cancellation, after first purchase).

**User impact:** Low feedback volume; product team misses signals from the moments that matter most.

**Fix:**
- After a completed/delivered order on `OrderDetailPage`, show a subtle "How was your experience?" prompt (only once per order, using localStorage key `feedback_prompted_{orderId}`)
- Use the existing `FeedbackSheet` component, triggered via a small card below the review CTA

**Files:** `src/pages/OrderDetailPage.tsx`
**Risk:** Low
**Measure:** Increase in feedback submissions per week

---

### Gap C -- Bulletin Post Has No Preview Before Submission (Prototype)

**Problem:** When creating a bulletin post via `CreatePostSheet`, tapping "Post" immediately publishes. There is no preview of how the post will appear, and no confirmation step. Accidental or poorly formatted posts cannot be caught.

**User impact:** Regret, embarrassment, need to delete and re-post.

**Fix:**
- Add a brief confirmation step or a preview card inside `CreatePostSheet` before the final submit action
- Show the formatted title, body preview (first 100 chars), and category tag

**Files:** `src/components/bulletin/CreatePostSheet.tsx`
**Risk:** Low
**Measure:** Reduction in posts deleted within 60 seconds of creation

---

### Gap D -- No Undo Window After Order Cancellation (Ideate)

**Problem:** When a buyer cancels an order via `OrderCancellation`, it is immediately and permanently cancelled. There is no brief undo window ("Order cancelled. Undo?") even though the seller may not have started preparing.

**User impact:** Regret, anxiety from irreversibility, support requests to "un-cancel."

**Fix:**
- After successful cancellation, show a toast with an "Undo" action button that lasts 5 seconds
- If user taps "Undo," revert the order status back to its previous state
- If the toast dismisses, the cancellation is final

**Files:** `src/components/order/OrderCancellation.tsx`
**Risk:** Medium -- requires storing previous status and reverting
**Measure:** Undo usage rate and reduction in "un-cancel" support requests

---

### Gap E -- Empty States Lack Actionable Guidance (Empathize + Define)

**Problem:** Several empty states show a generic message with no actionable next step:
- `DisputesPage`: "No concerns yet" with no explanation of what disputes are for
- `OrdersPage` (seller tab): "No orders received yet" with no guidance on how to get orders
- `SellerDashboardPage`: "You haven't set up your seller profile yet" -- single CTA, no context

**User impact:** Confusion about feature purpose; sellers don't know why they have no orders.

**Fix:**
- Disputes empty state: Add "Use this to raise concerns about orders, payments, or community issues"
- Seller orders empty: Add "Share your store link with neighbors to get your first order"
- Seller dashboard no profile: Add brief value proposition "Sell homemade food, groceries, or services to your community"

**Files:** `src/pages/DisputesPage.tsx`, `src/pages/OrdersPage.tsx`, `src/pages/SellerDashboardPage.tsx`
**Risk:** Low
**Measure:** Feature discovery rate for disputes; seller activation rate

---

### Gap F -- Search Returns No Results Without Guidance (Empathize)

**Problem:** When search returns zero results on `SearchPage`, the empty state says "No products found" with no suggestions for recovery (try different keywords, browse categories, expand to nearby communities).

**User impact:** Dead end, user leaves the app.

**Fix:**
- When results are empty, show:
  - "Try searching for something else, or browse by category below"
  - Show category quick-filter chips as recovery actions
  - If `browseBeyond` is off, suggest "Enable nearby communities to see more"

**Files:** `src/pages/SearchPage.tsx`
**Risk:** Low
**Measure:** Reduction in search abandonment (search followed by app close)

---

## Design Thinking KPIs

| Phase | Currently Measured | Should Measure | Missing Signal |
|-------|-------------------|----------------|----------------|
| Empathize | None | Error message clarity rate; first-session drop-off | User confusion events (tapping help, repeated errors) |
| Define | None | Feature discovery rate per screen | Screens where users navigate away within 3 seconds |
| Ideate | None | Draft save-and-resume rate; undo usage | Flows abandoned mid-way |
| Prototype | None | Confirmation dialog completion rate | Preview-to-submit ratio |
| Test | Feedback table exists | Feedback volume per week; contextual feedback rate | Post-order feedback; post-cancellation feedback |

---

## Implementation Priority

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| 1 | Gap A -- Adopt friendlyError across 8 files | Small | High |
| 2 | Gap E -- Actionable empty states | Small | Medium |
| 3 | Gap F -- Search recovery guidance | Small | Medium |
| 4 | Gap B -- Contextual feedback prompts | Small | Medium |
| 5 | Gap C -- Bulletin post preview | Small | Low |
| 6 | Gap D -- Cancellation undo window | Medium | Medium |

---

## Technical Details

### Gap A -- friendlyError adoption
Import `friendlyError` from `@/lib/utils` in each file and replace patterns like:
```
toast.error(error.message || 'Failed to X');
```
with:
```
toast.error(friendlyError(error));
```

### Gap B -- Contextual feedback
Reuse existing `FeedbackSheet` component. Add a state-driven trigger card on `OrderDetailPage` when `order.status === 'completed'` and `!localStorage.getItem('feedback_prompted_' + order.id)`.

### Gap D -- Undo cancellation
In `OrderCancellation.tsx`, after successful cancel:
```typescript
toast('Order cancelled', {
  action: { label: 'Undo', onClick: () => revertCancel(previousStatus) },
  duration: 5000,
});
```

### Gap E/F -- Copy changes only
Pure text/JSX additions, no logic changes required.

