# Project Memory

## Core
Cart staleTime 30s, refetchOnWindowFocus false. Global QueryClient default staleTime 10min, refetchOnWindowFocus false.
Admin data is tab-lazy — only fetches stats+sellers on mount, other tabs load on-demand.
HomePage uses LazySection for deferred rendering — do NOT add duplicate IntersectionObservers.
All critical DB indexes already exist (orders, cart_items, products, seller_profiles, notifications).

## Memories
- [Refund seller visibility](mem://features/refund-seller-visibility) — Seller dashboard refund requests depend on refund_requests RLS for seller-owned orders
- [Performance rules](mem://preferences/performance-rules) — Query staleTime policies, no global refetchOnWindowFocus, tab-lazy admin, telemetry guardrails