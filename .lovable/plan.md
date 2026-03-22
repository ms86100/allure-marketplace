## P0 Fix: Live Activity, Navigation Lock & Reorder — IMPLEMENTED

All five files updated with system-level guards:

| File | Change |
|---|---|
| `src/components/home/ActiveOrderStrip.tsx` | ETA gated to transit statuses only + composite dedup key (orderId:status:updated_at) on realtime events |
| `src/hooks/useLiveActivityOrchestrator.ts` | Stable channel names (no Date.now()) + module-level composite event dedup + ETA nullification for non-transit states |
| `src/pages/OrderDetailPage.tsx` | BottomNav always mounted for buyers (showNav={!hasSellerActionBar}) + buyer action bar repositioned to bottom-16 above nav + padding increased to pb-56 |
| `src/hooks/useCart.tsx` | Dispatches `cart-replaced` CustomEvent after successful replaceCart |
| `src/hooks/useCartPage.ts` | Listens for `cart-replaced` → hard-resets payment session + idempotency key |

### Regression Guards
- **ETA**: Double-gated at UI (ActiveOrderStrip) AND data layer (orchestrator) — impossible to show in non-transit states
- **Duplicate events**: Composite key `orderId:status:updated_at` at both subscriber levels
- **Ghost channels**: Stable naming eliminates phantom subscriptions
- **Navigation trap**: BottomNav always mounted for buyers via React state
- **Stale checkout**: Explicit event-driven reset at action level
