

# Production Readiness Gap Analysis — Round 3

Verified every previous fix against the actual code. Here are the **real remaining gaps** — things that are either not implemented, partially implemented, or newly discovered.

---

## CRITICAL

### Gap A: Buyer Never Sees Delivery OTP

**Issue:** The seller must enter the buyer's 4-digit OTP to complete delivery (`DeliveryCompletionOtpDialog`), but the buyer has **no UI showing their delivery code**. The `delivery_code` is only displayed on `DeliveryPartnerDashboardPage` (for dedicated riders) and `GuardDeliveryTab` (for guards). The buyer is never told their code.

**Impact:** The entire OTP verification flow is broken in practice — the seller taps "Verify & Deliver", a dialog asks for OTP, but the buyer doesn't know the code. Delivery cannot be completed.

**Root cause:** OTP was wired on the seller side but the buyer-facing display was never added.

**Fix:** In `OrderDetailPage`, when `isBuyerView && isInTransit && isDeliveryOrder && deliveryAssignmentId`, fetch the `delivery_code` from `delivery_assignments` and display it prominently (e.g., "Your delivery OTP: 1234 — share with delivery partner"). Also show it in the `DeliveryArrivalOverlay` when the rider is close.

---

### Gap B: `BuyerDeliveryConfirmation` Bypasses Security

**Issue:** `BuyerDeliveryConfirmation` does `supabase.from('orders').update({ status: 'completed' }).eq('id', orderId)`. After the previous migration dropped the broad buyer UPDATE policy (Gap 8 fix), this direct update will **fail silently** because there's no RLS policy allowing buyers to update order status. The buyer will see "Failed to confirm delivery."

**Impact:** Buyers cannot confirm receipt of their order. The order stays stuck at "delivered" forever.

**Root cause:** The RLS policy drop (migration `20260318130210`) removed ALL buyer UPDATE access on orders, but `BuyerDeliveryConfirmation` still does a direct update.

**Fix:** Create an RPC `buyer_confirm_delivery(_order_id uuid)` that validates `buyer_id = auth.uid()` and only allows `delivered -> completed` transition. Update `BuyerDeliveryConfirmation` to call this RPC.

---

### Gap C: `monitor-stalled-deliveries` Auto-Cancels Orders (Too Aggressive)

**Issue:** The cron function cancels the order and marks delivery as "failed" after 10 minutes of GPS silence. This is extremely aggressive — a seller's phone dying during delivery (battery, signal dead zone) should not auto-cancel an order the buyer is waiting for.

**Impact:** A buyer waiting for their food gets a sudden "Order Cancelled" notification because the seller drove through a tunnel. Creates disputes and lost revenue.

**Fix:** Change the escalation to set a `needs_attention` flag on the order (not cancel it). Send notifications to both parties. Add a "Report Issue" button on the buyer side. Only auto-cancel after 30+ minutes AND no response from seller.

---

## HIGH

### Gap D: Duplicate Realtime Subscriptions for Same Assignment

**Issue:** `OrderDetailPage` creates `useDeliveryTracking(deliveryAssignmentId)` at line 54. Then it renders `<LiveDeliveryTracker assignmentId={deliveryAssignmentId}>` at line 253, which internally calls `useDeliveryTracking(assignmentId)` again (line 57 of LiveDeliveryTracker). This creates **two separate realtime channel subscriptions** for the same assignment — doubling the Supabase connection load and potentially causing state inconsistency (one updates, the other doesn't, UI shows mixed data).

**Impact:** Doubled realtime connections, potential flickering, wasted bandwidth.

**Fix:** Pass the tracking state from `OrderDetailPage` into `LiveDeliveryTracker` as a prop instead of having it create its own subscription. Or remove the `useDeliveryTracking` call from `OrderDetailPage` if it only uses it for the map and arrival overlay — and instead have `LiveDeliveryTracker` expose its tracking state upward.

---

### Gap E: Race Condition Still Exists (Gap 7 Incomplete)

**Issue:** In `useDeliveryTracking`, the assignment channel (line 119-123) does compare timestamps before replacing location, but it does **not apply the GPS filter** to the incoming assignment location. Meanwhile the location channel (line 166) applies `filterGPSPoint`. So when an assignment UPDATE arrives with a newer timestamp, it writes **raw unfiltered coordinates** to state, overwriting the previously smoothed position. This causes a visual "jump" on the map.

**Impact:** Map marker jumps every time the edge function updates the assignment row (which happens on every GPS ping — ETA, distance, proximity all trigger assignment UPDATEs).

**Fix:** In the assignment channel handler, apply `filterGPSPoint` to the incoming coordinates before setting state, exactly as the location channel does.

---

### Gap F: OSRM Road ETA Not Used in `LiveDeliveryTracker`

**Issue:** The OSRM hook in `DeliveryMapView` extracts `roadEtaMinutes` and displays it as a badge on the map. But `LiveDeliveryTracker` (the main tracking card) still uses `getSmartEta()` which relies on the edge function's Haversine-based distance × road factor. The more accurate OSRM ETA is only visible as a small badge on the map.

**Impact:** Two different ETAs shown — one on the map (OSRM, accurate) and one on the tracking card (Haversine, less accurate). Confusing.

**Fix:** Pass `roadEtaMinutes` from `DeliveryMapView` up to `OrderDetailPage` and into `LiveDeliveryTracker`, or have the tracking hook incorporate OSRM data.

---

### Gap G: `DeliveryArrivalOverlay` Shows for Both Buyer and Seller

**Issue:** `showArrivalOverlay` at line 103 has no `isBuyerView` guard. When the seller is delivering and GPS shows < 200m from destination, the seller also sees the arrival overlay — which says things like "Your delivery partner is almost there" (confusing for the seller who IS the delivery partner).

**Fix:** Gate `showArrivalOverlay` with `o.isBuyerView`.

---

## MEDIUM

### Gap H: Buyer Cancel Still Uses Direct Update

**Issue:** `OrderCancellation` component likely does a direct `supabase.from('orders').update({ status: 'cancelled' })`. With the broad UPDATE policy removed, this will also fail.

**Fix:** Create an RPC `buyer_cancel_order(_order_id uuid, _reason text)` that validates ownership and allowed statuses.

---

### Gap I: `DeliveryFeedbackForm` Uses `as any` Cast

**Issue:** Line 41 of `DeliveryFeedbackForm` uses `as any` for the insert, meaning the `delivery_feedback` table types aren't in the generated types file yet. If types regenerate, this will break.

**Impact:** Low — works at runtime but fragile.

**Fix:** After migration is applied, regenerate types so the table is properly typed.

---

## Summary

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| A | Buyer never sees delivery OTP | Critical | New — never implemented |
| B | `BuyerDeliveryConfirmation` blocked by RLS | Critical | Regression from Gap 8 fix |
| C | Auto-cancel after 10min is too aggressive | Critical | Design flaw |
| D | Duplicate realtime subscriptions | High | Architectural waste |
| E | Assignment channel overwrites filtered GPS | High | Gap 7 incomplete |
| F | OSRM ETA not shown in tracking card | High | Gap 4 incomplete |
| G | Arrival overlay shows for seller too | High | Missing guard |
| H | Buyer cancel blocked by RLS | Medium | Regression from Gap 8 fix |
| I | `delivery_feedback` types not generated | Medium | Minor |

### Implementation Plan

| Step | What | Files |
|------|------|-------|
| 1 | Show delivery OTP to buyer + in arrival overlay | `OrderDetailPage.tsx`, `DeliveryArrivalOverlay.tsx` |
| 2 | Create `buyer_confirm_delivery` RPC + `buyer_cancel_order` RPC | New migration |
| 3 | Update `BuyerDeliveryConfirmation` to use RPC | `BuyerDeliveryConfirmation.tsx` |
| 4 | Update `OrderCancellation` to use RPC | `OrderCancellation.tsx` |
| 5 | Soften stalled monitor (flag, don't cancel) | `monitor-stalled-deliveries/index.ts`, migration for `needs_attention` |
| 6 | Remove duplicate tracking subscription — pass as prop | `LiveDeliveryTracker.tsx`, `OrderDetailPage.tsx` |
| 7 | Apply GPS filter in assignment channel | `useDeliveryTracking.ts` |
| 8 | Gate arrival overlay to buyer only | `OrderDetailPage.tsx` |

