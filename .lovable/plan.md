

# Sociva Production Stabilization Plan

This plan transforms Sociva from its current feature-complete state into a production-grade, long-term stable system. No new features — only hardening, testing, documentation, and observability.

---

## Current State Assessment

**What exists:**
- 75+ pages, 45+ edge functions, complex multi-domain app (marketplace, society, builder, workforce)
- Behavioral engines (feedback, ETA, visibility), multi-tier error recovery, chunk retry, session health checks
- Existing test suite (20+ test files in `src/test/`) with a custom Supabase reporter
- 1 unit test (`store-availability.test.ts`) in `src/lib/__tests__/`
- DB linter: 15 warnings (8 permissive RLS policies, 4 mutable search paths, 1 RLS-no-policy, 1 extension-in-public, 1 leaked password protection disabled)
- Console warnings: `VegBadge` and `BannerContent` receiving refs without `forwardRef`
- Heavy `as any` casting across hooks (~788 matches) — type safety gaps

**What's missing:**
- Zero component-level unit tests
- No E2E automation (Playwright/Cypress)
- No structured error tracking (Sentry or equivalent)
- No performance monitoring
- No API contract documentation
- No formal runbook or incident response plan

---

## Phase 1: Critical Bug Fixes (Day 1-2)

### 1.1 Fix React ref warnings
- **VegBadge** (`src/components/ui/veg-badge.tsx`): Wrap with `React.forwardRef` — this is being passed as a ref target in `ProductMini` and `FeaturedBanners`
- **BannerContent** (`src/components/home/FeaturedBanners.tsx`): Same `forwardRef` treatment

### 1.2 Database security hardening
- **Fix 4 functions with mutable search_path**: Add `SET search_path = public` to each. Identify which functions via `supabase--read_query` on `pg_proc`
- **Audit 8 permissive RLS policies**: Identify which tables have `USING (true)` for INSERT/UPDATE/DELETE. Tighten to proper `auth.uid()` checks where needed
- **Fix RLS-enabled-no-policy table**: Add appropriate policies
- **Enable leaked password protection** via auth config

### 1.3 Fix console errors
- Audit all `catch {}` blocks (empty catches that swallow errors silently) — add at minimum `console.warn` for observability

---

## Phase 2: Type Safety & Code Hardening (Day 3-5)

### 2.1 Eliminate critical `as any` casts
- Priority files: `useOrderDetail.ts`, `useCartPage.ts`, `useStoreDiscovery.ts`, `useCategoryManagerData.ts`
- Create proper TypeScript interfaces for all RPC return types
- Replace `as any` with typed responses using the generated Supabase types

### 2.2 Defensive coding audit
- All `supabase.rpc()` calls: ensure every one checks `error` before using `data`
- All `supabase.from().select()` calls: ensure null-safe access on `data`
- Verify every `toast.error()` in catch blocks provides user-friendly messages (not raw error objects)

### 2.3 Race condition audit
- `useAuthState.ts`: verify the `profileFetchedFor` ref guard handles rapid login/logout cycles
- Cart mutations: verify `pendingMutationCount` barrier prevents stale overwrites under rapid add/remove
- Realtime channels: ensure `removeChannel` cleanup in all useEffect returns

---

## Phase 3: Testing Strategy (Day 5-14)

### 3.1 Unit tests — pure logic libraries
Create tests in `src/lib/__tests__/` for:
- `etaEngine.ts` — all mood states, edge cases (null dates, past dates)
- `feedbackEngine.ts` — all action types, failure paths
- `visibilityEngine.ts` — route-based rules for every known route
- `format-price.ts` — edge cases (0, negative, large numbers, decimals)
- `validation-schemas.ts` — all validation rules
- `listingTypeWorkflowMap.ts` — mapping correctness
- `store-availability.ts` — expand existing tests for boundary cases (midnight crossover, timezone edge cases)
- `gps-filter.ts` — coordinate validation, distance calculations

### 3.2 Component tests — critical UI
Create tests alongside components for:
- `ErrorBoundary.tsx` — verify fallback renders, reload behavior, crash-loop detection
- `BuyerCancelBooking.tsx` — policy check flow, terminal status hiding
- `ProtectedRoute` / `AdminRoute` — auth gating works correctly
- Cart components — optimistic update, badge count sync

### 3.3 Integration tests — critical flows
Expand `src/test/` suite for:
- Order lifecycle: create → accept → prepare → ready → deliver → complete
- Cancellation: buyer cancel, seller reject, auto-cancel timeout
- Payment: COD flow, UPI flow, idempotency key dedup
- Service booking: slot lock → confirm → complete/no-show
- Auth: login → profile hydration → role detection → route access

### 3.4 Edge function tests
Create `*_test.ts` files for critical functions:
- `process-notification-queue` — delivery pipeline, retry logic
- `create-razorpay-order` — amount validation, idempotency
- `auto-cancel-orders` — timeout detection, state transition
- `manage-delivery` — assignment, location updates

### 3.5 Test automation
- Configure CI to run `vitest` on every commit (already have vitest.config.ts + reporter)
- Add a pre-publish validation step that blocks deployment if tests fail

---

## Phase 4: Monitoring & Observability (Day 10-14)

### 4.1 Structured error logging edge function
Create `supabase/functions/log-client-error/index.ts`:
- Accepts client-side errors with context (route, user_id, device, stack trace)
- Stores in `client_error_log` table with severity levels
- Rate-limited per user to prevent flood

### 4.2 Health check dashboard
Create `supabase/functions/system-health/index.ts`:
- Checks: DB connectivity, edge function latency, notification queue depth, stalled delivery count
- Returns structured JSON for external monitoring integration
- Existing `health` function may already cover some — extend it

### 4.3 Frontend error capture
Add a global `window.onerror` / `window.onunhandledrejection` handler in `main.tsx` that:
- Captures error + stack + current route + user ID
- Posts to `log-client-error` edge function
- Throttled (max 5 per minute per session)
- This replaces the need for Sentry in the short term

### 4.4 Database monitoring queries
Create scheduled health checks via existing `check-trigger-health` and `check-notification-queue-health` functions:
- Alert on: orders stuck in non-terminal states > 24h
- Alert on: notification_queue items in `processing` > 5 min
- Alert on: delivery assignments with no location update > 10 min

---

## Phase 5: Documentation (Day 12-16)

### 5.1 Technical documentation
Create `docs/` directory with:
- `ARCHITECTURE.md` — domain separation, engine layer, data flow diagrams
- `DATABASE.md` — table relationships, RLS policy matrix, RPC function catalog
- `EDGE_FUNCTIONS.md` — each function's purpose, inputs/outputs, cron schedule
- `STATUS_FLOWS.md` — all workflow states, transitions, terminal conditions
- `SECURITY.md` — auth model, RLS strategy, rate limiting, input validation

### 5.2 Runbook
`docs/RUNBOOK.md`:
- Common incident scenarios and resolution steps
- How to manually cancel stuck orders
- How to re-process failed notifications
- How to diagnose push notification delivery failures
- Database backup/restore procedures

### 5.3 Code standards
`docs/STANDARDS.md`:
- No `as any` — all types must be explicit
- Every `catch` must log or handle (no empty catches)
- Every `supabase` call must check error before data
- Every user-facing action must have feedback (toast/haptic)
- All new functions must have `SET search_path = public`

---

## Phase 6: Release Freeze & Validation (Day 14-16)

### 6.1 Pre-release validation checklist
- [ ] All vitest tests pass (unit + integration)
- [ ] Edge function tests pass
- [ ] DB linter returns 0 warnings
- [ ] Console shows 0 errors/warnings in all major flows
- [ ] All RLS policies audited and documented
- [ ] Performance profile: no page > 3s load, no JS heap > 100MB
- [ ] All 75+ pages render without crash
- [ ] Auth flow: signup, login, logout, session refresh, password reset
- [ ] Order flow: place, accept, prepare, deliver, complete, review
- [ ] Payment flow: COD, UPI, Razorpay
- [ ] Service booking: book, confirm, complete, cancel
- [ ] Push notifications: register, receive, tap-to-navigate

### 6.2 Version freeze protocol
- Tag current commit as `v1.0.0-stable`
- Create `stable` branch — only critical bug fixes merge here
- All future changes require: (1) test coverage, (2) peer review, (3) staging validation
- No schema migrations without explicit approval and Live data check

### 6.3 Rollback plan
- Lovable version history serves as rollback mechanism
- Document the exact commit hash and DB migration state for v1.0.0
- Keep a "last known good" snapshot of the database schema

---

## Implementation Order

| Week | Focus | Deliverables |
|------|-------|-------------|
| Week 1 | Phase 1 + 2 | Bug fixes, ref warnings, RLS hardening, type safety |
| Week 2 | Phase 3 | Unit tests for all libs, component tests, integration tests |
| Week 3 | Phase 4 + 5 | Error logging, health checks, documentation |
| Week 4 | Phase 6 | Validation checklist execution, version freeze |

Shall I begin with Phase 1 (critical bug fixes — React ref warnings, DB security, empty catch blocks)?

