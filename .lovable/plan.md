

# In-App E2E Test Scenario Runner

## Reality Check

Lovable cannot run headless browsers (Playwright/Cypress) natively — there's no server to host a browser process. However, we **can** build a powerful API-level E2E test runner that executes the same Supabase SDK calls your frontend makes (create cart, place order, confirm payment, etc.) — which is what your existing integration tests already do, but currently only via CLI.

This plan brings that capability into the admin UI with structured, runnable test scenarios.

## Architecture

```text
┌──────────────────────────────────────┐
│   Admin UI: /admin/test-scenarios    │
│  ┌────────────────────────────────┐  │
│  │ Test Case 1: UPI Checkout     │  │
│  │  Steps: [browse, cart, pay…]  │  │
│  │  [▶ Run]  Status: ● passed   │  │
│  ├────────────────────────────────┤  │
│  │ Test Case 2: Appointment Book │  │
│  │  Steps: [search, slot, book…] │  │
│  │  [▶ Run]  Status: ● failed   │  │
│  └────────────────────────────────┘  │
└──────────────┬───────────────────────┘
               │ supabase.functions.invoke()
               ▼
┌──────────────────────────────────────┐
│  Edge Function: run-test-scenario   │
│  • Authenticates as buyer/seller    │
│  • Executes steps sequentially      │
│  • Logs per-step pass/fail          │
│  • Writes to test_results table     │
└──────────────────────────────────────┘
```

## What Gets Built

### 1. Database: `test_scenarios` table

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | PK |
| name | text | "E2E Checkout with Deep UPI" |
| module | text | "checkout", "booking", "seller" |
| description | text | What this test covers |
| steps | jsonb[] | Ordered array of step definitions |
| is_active | boolean | Toggle on/off |
| priority | int | Execution order |
| last_run_at | timestamptz | When last executed |
| last_result | text | passed/failed/running |
| created_at / updated_at | timestamptz | Timestamps |

Each **step** in the JSONB array:
```json
{
  "step_id": "add_to_cart",
  "label": "Add product to cart",
  "action": "insert",
  "table": "cart_items",
  "actor": "buyer",
  "params": { "quantity": 1 },
  "expect": { "status": "success" },
  "on_fail": "abort"
}
```

Step actions supported: `insert`, `update`, `select`, `rpc`, `delete`, `assert` — matching real Supabase SDK operations.

### 2. Edge Function: `run-test-scenario`

- Receives a `scenario_id`
- Fetches the scenario's steps from `test_scenarios`
- Authenticates as the required actor (buyer/seller/admin) using the seeded test credentials
- Executes each step sequentially against the real database
- Captures per-step: duration, outcome, error message, response data
- Writes all results to `test_results` with a shared `run_id`
- Supports branching: `on_fail: "abort"` vs `"continue"` vs `"skip_remaining"`
- Cleans up test data after execution (reversible inserts)

### 3. Admin UI: Test Scenario Manager

New admin tab/page at `/admin/test-scenarios`:

- **Scenario list** — cards showing name, module, step count, last result, last run time
- **Run button** per scenario — invokes the edge function, shows live progress
- **Step-level results** — expandable view showing each step's pass/fail with error details
- **Create/Edit** — form to define scenarios with a step builder (add steps, set action/table/actor/params/expected)
- **Bulk run** — "Run All Active" button
- **Filters** — by module, status, priority

### 4. Pre-seeded Test Scenarios

Two scenarios created as seed data:

**Scenario 1: E2E Checkout with Deep UPI**
Steps: Search products → View product → Add to cart → Create order → Select UPI payment → Upload screenshot → Confirm payment → Verify order status = placed → Cancel order variant → Retry payment variant

**Scenario 2: Appointment Booking Flow**
Steps: Search services → View service → Select time slot → Book appointment → Verify booking status → Cancel booking variant → Reschedule variant

### 5. Scheduled Execution (optional, via pg_cron)

A cron job that picks the next stale scenario every 30 minutes and runs it automatically, sending failure notifications through the existing `notification_queue`.

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration: `test_scenarios` table | Create |
| `supabase/functions/run-test-scenario/index.ts` | Create |
| `src/components/admin/AdminTestScenariosTab.tsx` | Create |
| `src/pages/AdminPage.tsx` | Add tab |
| Seed data insert for 2 scenarios | Insert |
| pg_cron job for 30-min runs | Insert |

## Limitations & Honesty

- These tests exercise the **data layer** (same SDK calls the UI makes), not actual DOM clicks. They catch RLS bugs, workflow violations, broken RPCs, and data integrity issues — which is where 90%+ of your bugs originate.
- True browser-click testing (Playwright) requires an external CI runner. If you later connect to GitHub, the scenario definitions from this table can drive Playwright scripts too.

