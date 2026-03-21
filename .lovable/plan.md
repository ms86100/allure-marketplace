

# Round 15: 5 Critical Seller-Perspective Bugs

## Bug 1: "Completed" filter misses "delivered" orders — seller sees empty completed tab

**Where:** `src/hooks/queries/useSellerOrders.ts` line 164-166

**What happens:** The stats calculation correctly counts both `completed` and `delivered` as `completedOrders` (lines 64-66). But the actual order list filter only queries `.eq('status', 'completed')` (line 165). The DB has orders with `status = 'delivered'` that are functionally complete but excluded from the "Completed" filter tab. A seller clicks "Completed" and sees fewer orders than the badge count suggests.

**Why critical:** The count badge says "5 completed" but the list shows 3. The seller thinks orders are lost. For a food seller where `delivered` is the terminal status (not `completed`), this tab is completely empty despite having finished orders.

**Impact analysis:**
- Only `useSellerOrders.ts` modified
- Risk 1: Adding `delivered` to the filter could show in-transit orders if another workflow uses `delivered` as non-terminal. But the stats already treat `delivered` as completed, so this is consistent.
- Risk 2: None — pure query filter change, no data modification.

**Fix:** Change line 165 from `.eq('status', 'completed')` to `.in('status', ['completed', 'delivered'])`.

---

## Bug 2: Seller `updateOrderStatus` uses raw `.update()` — bypasses notification trigger for multi-step workflows

**Where:** `src/hooks/useOrderDetail.ts` lines 188-213

**What happens:** When a seller advances an order (e.g., accepted → preparing → ready), the `updateOrderStatus` function uses a direct `.update()` on the `orders` table. This fires the `fn_enqueue_order_status_notification` trigger correctly. However, the function uses optimistic concurrency control via `.eq('status', order.status as any)` — if the local status is stale (another tab/device advanced it), the update silently returns 0 rows. The error handling at line 199 re-fetches but shows a generic "Order status has changed" toast.

The real bug: after the `.update()`, the function sets local state to `{ ...order, ...updateData }` (line 205) which only includes `{ status: newStatus, auto_cancel_at: null }`. But status transitions may update other fields server-side (e.g., `ready_at`, `estimated_delivery_at`, `status_updated_at`). The local state diverges from DB state until the next fetch.

More critically for multi-store sellers: the `.eq('seller_id', order.seller_id)` guard (line 195) is correct, but if the seller switched stores between opening the order detail and clicking "Accept", `currentSellerId` may no longer match `order.seller_id`. The `isSellerView` check still passes (line 37 matches against `sellerProfiles`), but the RLS policy may reject the update if it checks `auth.uid()` against the seller profile's `user_id` — which is correct but confusing.

**Why critical:** Stale local state after update means the seller sees old timestamps, old payment status, etc. They may double-tap thinking it didn't work.

**Impact analysis:**
- Only `useOrderDetail.ts` modified
- Risk 1: Adding a re-fetch after successful update adds one extra DB call per status change. Acceptable — status changes are rare.
- Risk 2: None — the trigger still fires on the `.update()`.

**Fix:** After successful update at line 205, call `fetchOrder()` instead of setting local optimistic state. This ensures all server-side computed fields are reflected.

---

## Bug 3: `useNewOrderAlert` only listens to `currentSellerId` — multi-store seller misses orders for non-active store

**Where:** `src/App.tsx` line 298, `src/hooks/useNewOrderAlert.ts` line 147

**What happens:** `GlobalSellerAlert` passes `currentSellerId` to `useNewOrderAlert`. The realtime subscription filters `seller_id=eq.${sellerId}`. If a seller has 2 stores (Store A, Store B) and is currently viewing Store A, they will NOT receive new order alerts for Store B. The alarm, haptics, and full-screen overlay are completely silent for the non-active store.

The polling fallback (line 198) has the same filter: `.eq('seller_id', sellerId)`. So neither realtime nor polling catches orders for inactive stores.

**Why critical:** A multi-store seller expects to hear ALL new orders, regardless of which store dashboard they're viewing. Missing an order for 5-10 minutes because they had the wrong store selected is a trust-breaking experience, especially for food delivery where freshness matters.

**Fix:** In `GlobalSellerAlert`, pass all seller profile IDs instead of just the active one. In `useNewOrderAlert`, change the realtime filter to listen on all seller IDs (use `.in('seller_id', sellerIds)` for the polling query, and subscribe to multiple channels or use a broader filter for realtime).

However, Supabase realtime `filter` only supports `eq`, not `in`. The surgical fix: create one subscription per seller profile in the hook, or use a single unfiltered subscription on `orders` table and filter client-side by checking `seller_id` membership.

Simplest approach: modify `useNewOrderAlert` to accept `sellerIds: string[]` instead of `sellerId: string | null`. Subscribe once without a `seller_id` filter, check membership in the callback. For polling, use `.in('seller_id', sellerIds)`.

**Impact analysis:**
- `App.tsx` (GlobalSellerAlert): pass all seller IDs
- `useNewOrderAlert.ts`: accept array, adjust subscription and polling
- Risk 1: Unfiltered realtime subscription receives ALL order inserts system-wide, filtered client-side. For a small community marketplace this is negligible. At scale, we'd need per-store channels.
- Risk 2: The `handleNewOrder` callback invalidates `['seller-orders', sellerId]` — with multiple IDs, it should invalidate for the matching seller. Need to pass the matched sellerId into the invalidation.

---

## Bug 4: Seller dashboard stats don't refresh after seller switches stores — stale data shown

**Where:** `src/pages/SellerDashboardPage.tsx` lines 83-90

**What happens:** The `useSellerOrderStats` and `useSellerOrdersInfinite` hooks are keyed by `activeSellerId`. When a seller switches stores via `SellerSwitcher`, `currentSellerId` changes, which updates `activeSellerId`. The React Query cache serves stale data for the new store if it was previously loaded (10s staleTime).

But the bigger issue: `fetchSellerProfile` (line 60) is called on `activeSellerId` change, but it sets `sellerProfile` state independently. While profile is loading (`isLoadingProfile = true`), the stats and orders queries are already running with the new `activeSellerId` — they may render with the new store's data while the profile card still shows the old store's name and availability toggle.

This creates a visual mismatch: the store header says "Store A (Open)" but the orders below are Store B's orders. It lasts only 200-500ms during the profile fetch, but it's jarring.

**Why critical:** For a multi-store seller, switching stores is a frequent action. Seeing mismatched data, even briefly, creates doubt about data integrity.

**Impact analysis:**
- Only `SellerDashboardPage.tsx` modified
- Risk 1: Adding a loading state during switch may cause a flash. But the current state (wrong data) is worse.
- Risk 2: None — pure UI state synchronization.

**Fix:** Reset `sellerProfile` to `null` at the start of `fetchSellerProfile` before the async call, or set `isLoadingProfile` to true immediately when `activeSellerId` changes. This forces the loading skeleton to show during the brief profile fetch, preventing the data mismatch.

---

## Bug 5: Seller earnings page doesn't react to store switch — shows stale earnings

**Where:** `src/pages/SellerEarningsPage.tsx` lines 29-37

**What happens:** The `activeSellerId` is correctly computed from `currentSellerId`. The `fetchEarnings` is called when `activeSellerId` changes (line 31-37). But the `setPayments` and `setStats` are not reset when the seller switches stores. During the fetch, the old store's earnings remain visible. If the fetch fails silently, the old store's data persists permanently.

**Why critical:** A seller with a grocery store (high volume) and a tutoring service (low volume) switches from grocery to tutoring. During the 500ms fetch, they see the grocery earnings under the tutoring header. If network is slow, this mismatch lasts seconds.

**Impact analysis:**
- Only `SellerEarningsPage.tsx` modified
- Risk 1: Resetting state to empty causes a brief empty flash. But a loading skeleton already exists.
- Risk 2: None — pure state cleanup.

**Fix:** Reset `payments` and `stats` when `activeSellerId` changes by adding to the useEffect:
```typescript
useEffect(() => {
  setPayments([]);
  setStats({ today: 0, thisWeek: 0, thisMonth: 0, allTime: 0, pendingPayout: 0 });
  if (user && activeSellerId) fetchEarnings(activeSellerId);
  else setIsLoading(false);
}, [user, activeSellerId]);
```

---

## Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | Completed filter misses delivered orders | **HIGH** — empty/wrong tab | `useSellerOrders.ts` |
| 2 | Stale local state after seller status update | **MEDIUM** — visual lag | `useOrderDetail.ts` |
| 3 | Multi-store seller misses orders for inactive store | **CRITICAL** — silent order loss | `App.tsx`, `useNewOrderAlert.ts` |
| 4 | Dashboard shows mismatched data during store switch | **MEDIUM** — trust erosion | `SellerDashboardPage.tsx` |
| 5 | Earnings page shows wrong store data during switch | **MEDIUM** — trust erosion | `SellerEarningsPage.tsx` |

## Files to Edit

- `src/hooks/queries/useSellerOrders.ts` — Bug 1
- `src/hooks/useOrderDetail.ts` — Bug 2
- `src/App.tsx` — Bug 3 (pass all seller IDs)
- `src/hooks/useNewOrderAlert.ts` — Bug 3 (accept array, multi-channel)
- `src/pages/SellerDashboardPage.tsx` — Bug 4
- `src/pages/SellerEarningsPage.tsx` — Bug 5

## Cross-Impact Analysis

- Bug 1: Query filter change only — consistent with existing stats logic
- Bug 2: Replaces optimistic update with re-fetch — slower by ~200ms but accurate
- Bug 3: Changes realtime subscription scope — client-side filtering prevents false alerts. `NewOrderAlertOverlay` shows order regardless of which store it belongs to. The "View Order" navigation works because order detail resolves `isSellerView` via `sellerProfiles` array, not just `currentSellerId`.
- Bugs 4+5: State reset on store switch — may cause 200ms loading flash, which is correct UX during a context switch

