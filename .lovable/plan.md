

## Plan — Fix tab scroll + explain reputation logic

### Part A — UX bug: tabs land at bottom of page

**Root cause** (`src/pages/SellerDetailPage.tsx`, lines 663–672):
- The `Menu` tab uses `forceMount` and renders a long product list, so the page is scrolled deep (user is reading menu).
- When user taps **Reviews** or **Reputation**, the active tab swaps in place (low on the page). The browser does NOT scroll, so the user sees the tab bar near the bottom and an "empty state" message just under it — looks like the whole tab is empty.
- Reviews/Reputation content is actually rendered just above the tab bar, but it's small (empty state for new sellers) so the user only sees the tab strip + "No reviews yet".

**Fix** — single edit in `SellerDetailPage.tsx`:
- Wrap the `Tabs onValueChange` with a small handler: on tab change to `reviews` or `reputation`, scroll the tab strip to the top of the viewport, e.g.
  ```ts
  const tabsRef = useRef<HTMLDivElement>(null);
  const handleTabChange = (v: string) => {
    setActiveTab(v);
    if (v !== 'menu') {
      // next paint
      requestAnimationFrame(() =>
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      );
    }
  };
  ```
- Attach `ref={tabsRef}` on the tabs container `<div className="px-4 mt-4">`.
- Result: switching to Reviews/Reputation pins the tab strip at the top, content (or empty state) is immediately visible — no confusion.

No other files change. No DB or styling changes.

---

### Part B — How reputation is calculated today (research answer)

**Storage** — `seller_reputation_ledger` table. Each row = one event with `event_type`, `is_positive` boolean, `occurred_at`.

**Allowed event types** (enforced by `validate_reputation_event_type` trigger):
`order_completed`, `order_cancelled`, `dispute_resolved`, `dispute_lost`, `response_fast`, `response_slow`.
(Plus `review_received` added by a later migration — currently inserted by `fn_review_after_insert` but **not in the validator's allow-list**, so any new review insert today would fail the trigger. ⚠ Bug.)

**What auto-logs events today**:
1. `log_reputation_on_order` trigger on `orders` → on status change to `completed`/`delivered` writes `order_completed (positive)`; on `cancelled` writes `order_cancelled (negative)`.
2. `fn_review_after_insert` trigger on `reviews` → writes `review_received` with `is_positive = rating >= 4`. **(Currently blocked by the validator trigger — needs fix.)**
3. Nothing logs `dispute_resolved`, `dispute_lost`, `response_fast`, `response_slow` anywhere in the codebase.

**How the score is computed** (`SellerReputationTab.tsx`, lines 38–62):
- Pulls last **100 events** for the seller.
- `positive = events where is_positive = true`
- `negative = events where is_positive = false`
- `fulfillment_rate = round(positive / total * 100)` → shown as the big % number.
- "Recent Activity" lists the most recent 10.

**Current DB state for this project**: `order_completed: 2`, `review_received: 1`, nothing else. So a freshly viewed seller with no completed orders shows the empty state — which is correct.

**What's working / what's not**:
| Signal | Status |
|---|---|
| Order completed → +1 positive | ✅ working |
| Order cancelled → +1 negative | ✅ working |
| Review ≥4 → +1 positive | ⚠ trigger writes `review_received` but validator rejects it; needs `review_received` added to allow-list |
| Dispute resolved/lost | ❌ never logged anywhere |
| Response speed (fast/slow) | ❌ never logged anywhere |
| Score weighting | ❌ all events weighted equally — a cancellation counts the same as a completion |
| 100-event cap | ⚠ silent — sellers with >100 events see only the latest window |

**Verdict**: the reputation system is **partially live**: only order completion/cancellation actually feed it. The fulfillment % is essentially just "% of your orders that didn't get cancelled". The richer signals (disputes, response time, reviews) are designed but unwired.

If you want, after the tab-scroll fix lands I can do a follow-up to (1) unblock `review_received`, (2) wire dispute outcomes into the ledger, and (3) introduce weighted scoring.

