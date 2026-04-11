
Root cause is now clear.

1. What exists today
- Seller-facing dispute UI already exists in two places:
  - Seller dashboard summary card: `src/components/seller/SellerRefundList.tsx`
  - Seller action card inside seller order detail: `src/pages/OrderDetailPage.tsx` via `SellerRefundSection` + `src/components/refund/SellerRefundActions.tsx`
- So this is not a missing-UI problem first. It is a visibility and robustness problem.

2. Why seller cannot see the buyer dispute
- The dashboard card is mounted in `src/pages/SellerDashboardPage.tsx` under the Orders tab.
- The data query runs.
- But the `refund_requests` table RLS is wrong in `supabase/migrations/20260411105448_aa1fffa3-4279-4e93-a4d5-28ac4908dee1.sql`:
  - current seller SELECT policy = `auth.uid() = seller_id`
  - `refund_requests.seller_id` stores the seller profile id
  - `auth.uid()` is the auth user id
- Because those are different IDs, seller reads return empty arrays. That is why Dabbas sees nothing even though the dispute exists.
- There is also no seller UPDATE policy for `refund_requests`, so approve/reject is not bulletproof even after visibility is fixed.

3. Why the Stats tab crashes
- There are two different hooks with the same React Query key:
  - `src/hooks/useSellerAnalytics.ts`
  - `src/hooks/queries/useSellerAnalytics.ts`
- Both use `['seller-analytics', sellerId]` but return different data shapes.
- The Stats tab renders both:
  - `<SellerAnalytics sellerId={sellerProfile.id} />`
  - `<SellerAnalyticsTab sellerId={sellerProfile.id} />`
- This can poison the shared cache so `SellerAnalyticsTab` sometimes receives the wrong object shape, then crashes on:
  - `data.dailyRevenue.reduce(...)`
- That matches the reported `Cannot read properties of undefined (reading 'reduce')`.

4. Bulletproof fix plan
- Database/RLS
  - Add a security-definer helper function that verifies whether the current auth user owns the seller profile tied to a refund row, preferably by resolving:
    - `refund_requests.order_id -> orders.seller_id -> seller_profiles.user_id`
    - or `refund_requests.seller_id -> seller_profiles.user_id`
  - Replace the broken seller SELECT policy on `refund_requests` with an ownership-based policy using that helper.
  - Add seller UPDATE policy for their own refund rows, restricted to seller-owned orders.
  - Keep buyer visibility/insert intact.
  - Avoid recursive RLS by using a security-definer function.

- Seller UX
  - Keep the existing dashboard summary card, but make it much harder to miss:
    - rename/position it as a prominent “Buyer Disputes / Refund Escalations” block above the orders list
    - show stronger empty/loading/error states instead of silently returning `null`
    - add an “Action required” emphasis for `requested` items
  - Keep seller actions on the order detail page, since actioning per-order is already implemented correctly in UI terms.
  - Add a clear path from dashboard card to order detail action area.

- Stats crash
  - Give the two analytics hooks distinct query keys so their caches cannot collide.
  - Add defensive guards in `SellerAnalyticsTab` so it never calls `.reduce()` on undefined.
  - Preserve existing analytics behavior; only harden it.

5. Exact implementation steps
- Create a migration to:
  - drop the broken seller refund SELECT policy
  - create helper function for seller ownership check
  - create corrected seller SELECT policy
  - create seller UPDATE policy for refund approvals/rejections
- Update `SellerRefundList.tsx` to:
  - show loading/error states
  - use more explicit seller wording: dispute/escalation/refund request
  - keep animation subtle and premium
- Update `SellerDashboardPage.tsx` if needed to improve placement/copy of the dispute section.
- Update analytics hooks/components to remove query-key collision and add safe fallbacks.

6. Expected result after fix
- When a buyer raises a dispute/refund request, the seller will see it in:
  - Seller Dashboard → Orders tab → dispute/refund escalation section near the top
  - Clicking it opens Order Detail where seller can approve/reject
- The Stats tab will stop crashing.

7. Technical notes
- Files to change:
  - `supabase/migrations/...new migration...`
  - `src/components/seller/SellerRefundList.tsx`
  - `src/pages/SellerDashboardPage.tsx`
  - `src/hooks/useSellerAnalytics.ts` and/or `src/hooks/queries/useSellerAnalytics.ts`
  - `src/components/seller/SellerAnalyticsTab.tsx`
- Security:
  - no client-side auth shortcuts
  - no roles stored on profiles/users
  - ownership enforced server-side via RLS helper function
- No business workflow changes are needed; this is visibility, permissions, and UX hardening.

8. Why it took time
- Because the UI code was already present, the real failure was backend visibility, not missing frontend rendering.
- The seller dashboard error was a separate issue caused by a query-cache key collision, which made the symptoms look inconsistent.
- I now have both root causes pinned down and the fix path is straightforward.

9. Next implementation pass
- Apply the RLS migration first
- Harden seller dispute card UX second
- Fix analytics query-key collision and defensive rendering third
- Then verify:
  - dispute visible for the correct seller
  - seller can approve/reject
  - stats tab opens without error
