

## P0 Fix: Live Activity, Navigation Lock & Reorder — Bulletproof System-Level Stabilization

### Files Changed

| File | Change |
|---|---|
| `src/components/home/ActiveOrderStrip.tsx` | Gate ETA to transit only + composite dedup key |
| `src/hooks/useLiveActivityOrchestrator.ts` | Stable channel names + composite event dedup + ETA nullification for non-transit |
| `src/pages/OrderDetailPage.tsx` | Always mount BottomNav for buyers + reposition buyer action bar above nav |
| `src/hooks/useCart.tsx` | Dispatch `cart-replaced` event after replaceCart succeeds |
| `src/hooks/useCartPage.ts` | Listen for `cart-replaced` → hard-reset payment session, idempotency key, pending order IDs |

---

### Fix 1: Live Activity — DB-driven ETA + Composite Dedup

**ActiveOrderStrip.tsx (line 162)**
- Gate ETA: `const etaText = isTransit && order.estimated_delivery_at ? compactETA(order.estimated_delivery_at) : null;`
- Realtime dedup (line ~130): Replace raw invalidation with composite key guard:
  ```ts
  const lastEventRef = useRef<string>('');
  // In handler:
  const row = payload.new as any;
  const eventKey = `${row?.id}:${row?.status}:${row?.updated_at}`;
  if (eventKey === lastEventRef.current) return;
  lastEventRef.current = eventKey;
  queryClient.invalidateQueries({ queryKey: ['active-orders-strip'] });
  ```
  Uses `orderId + status + updated_at` — unique per actual state change, survives timestamp collisions.

**useLiveActivityOrchestrator.ts**
- **Stable channel names** (lines 158, 283): Remove `Date.now()` suffix → `la-order-status-${userId}` and `la-delivery-${userId}`
- **Composite dedup** in `handleOrderUpdate` (line 94):
  ```ts
  const lastProcessedEvents = new Map<string, string>();
  // Inside handler:
  const eventKey = `${orderId}:${newStatus}:${(payload.new as any)?.updated_at}`;
  if (lastProcessedEvents.get(orderId) === eventKey) return;
  lastProcessedEvents.set(orderId, eventKey);
  ```
  Module-level map keyed by orderId — deduplicates across channels while allowing legitimate status transitions.
- **ETA nullification for non-transit**: After fetching delivery data (line ~128), gate it:
  ```ts
  const transitSet = getTransitStatuses();
  const effectiveEta = transitSet.has(newStatus) ? (delivery?.eta_minutes ?? null) : null;
  // Pass effectiveEta instead of delivery?.eta_minutes to buildLiveActivityData
  ```
  This ensures Live Activity never shows ETA for non-transit states regardless of what sellers set.

---

### Fix 2: Navigation Lock — React-driven BottomNav guarantee

**OrderDetailPage.tsx**
- **Line 190**: Change `showNav={!hasSellerActionBar && !hasBuyerActionBar}` → `showNav={!hasSellerActionBar}`
  - Buyers always see BottomNav. Only seller action bar (which has workflow progression buttons) hides it.
- **Line 579**: Reposition buyer action bar above BottomNav:
  ```tsx
  <div className="fixed bottom-16 left-0 right-0 z-[60] bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
  ```
  `bottom-16` = 4rem = BottomNav height. Both bars coexist without overlap.
- **Line 191**: Change `pb-44` → `pb-56` to account for combined height of buyer action bar + BottomNav.

No DOM queries. Pure React state control. BottomNav is always mounted via the `showNav` prop.

---

### Fix 3: Reorder — Deterministic hard reset

**useCart.tsx (line ~435, after successful reconcile in replaceCart)**
```ts
window.dispatchEvent(new CustomEvent('cart-replaced'));
```

**useCartPage.ts (new effect near line 70)**
```ts
useEffect(() => {
  const handler = () => {
    clearPaymentSession();
    idempotencyKeyRef.current = null;
    setPendingOrderIds([]);
    pendingOrderIdsRef.current = [];
  };
  window.addEventListener('cart-replaced', handler);
  return () => window.removeEventListener('cart-replaced', handler);
}, []);
```

Action-level reset, not cart-diffing. Works even when reordering the same products. Fires once per replaceCart call.

---

### Regression Protection Summary

| Guard | Mechanism |
|---|---|
| ETA in wrong state | Gated at UI (ActiveOrderStrip) AND data layer (orchestrator) — double enforcement |
| Duplicate events | Composite key `orderId:status:updated_at` — unique per real DB change, not timestamp-dependent |
| Ghost channels | Stable naming eliminates phantom subscriptions on reconnect |
| Navigation trap | React-driven `showNav` — no DOM hacks, BottomNav always mounted for buyers |
| Stale checkout | Explicit `cart-replaced` event resets all payment state atomically |

