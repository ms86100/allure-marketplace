

# Operational Maturity Phase -- Implementation Plan

## Overview

The architecture is hardened. This phase adds observability, automated testing, and monitoring to make the system operationally safe before scaling.

---

## 1. Automated RLS Regression Runner

**What**: A database function `run_rls_regression_tests()` that simulates all 5 roles and validates isolation.

**How**: Create a stored procedure that uses `set_config('request.jwt.claims', ...)` to impersonate roles and runs test queries against all critical tables. Returns a JSON report of pass/fail results.

**Tests covered**:
- Cross-society SELECT on 7 critical tables (products, orders, reviews, snag_tickets, society_expenses, seller_profiles, society_admins)
- Cross-society UPDATE attempts
- Privilege escalation (buyer trying to INSERT into user_roles with admin role)
- Deactivated admin revocation verification
- Last admin protection trigger

**Deliverable**: Edge function `run-rls-tests` that platform admins can invoke on demand. Returns structured JSON with pass/fail per test case.

---

## 2. Trigger Failure Monitoring

**What**: Replace silent trigger failures with logged failures.

**How**:
- Create a `trigger_errors` table (id, trigger_name, table_name, error_message, error_detail, created_at)
- Wrap all 7 `log_*_activity()` trigger functions in BEGIN...EXCEPTION blocks that catch errors and INSERT into `trigger_errors` instead of failing silently
- Create a monitoring edge function `check-trigger-health` that queries `trigger_errors` for recent failures

**Tables affected**: society_activity logging triggers (7 functions)

**Migration**: Single migration to create table + replace 7 trigger functions with error-handling versions

---

## 3. Slow Query Monitoring

**What**: Enable query performance tracking and provide monitoring instructions.

**How**:
- Enable `pg_stat_statements` extension via migration
- Create a `query_performance_log` table for periodic snapshots
- Create edge function `check-query-performance` that reads `pg_stat_statements` and flags queries exceeding 500ms
- Document how to use Cloud View > Run SQL to check for sequential scans

**Note**: `pg_stat_statements` is already available in the database runtime. We enable tracking and create a monitoring endpoint.

---

## 4. Governance Integrity Monitoring

**What**: Automated checks for abuse signals.

**How**: Create edge function `governance-health-check` that runs these checks and returns a report:

| Check | Query | Alert Threshold |
|---|---|---|
| Societies with 0 active admins | `SELECT id FROM societies WHERE is_active AND id NOT IN (SELECT society_id FROM society_admins WHERE deactivated_at IS NULL)` | Any result |
| Admin count exceeding limit | Compare `society_admins` count vs `societies.max_society_admins` | Any result |
| Rapid admin changes | `SELECT society_id, COUNT(*) FROM audit_log WHERE action IN ('admin_appointed','admin_removed') AND created_at > now() - interval '1 hour' GROUP BY society_id HAVING COUNT(*) > 3` | > 3 changes/hour |
| Approval spike | `SELECT society_id, COUNT(*) FROM audit_log WHERE action = 'user_approved' AND created_at > now() - interval '1 hour' GROUP BY society_id HAVING COUNT(*) > 10` | > 10 approvals/hour |

**Scheduling**: Can be invoked manually or set up as a cron job via pg_cron.

---

## 5. Extended Audit Coverage

**What**: Add `logAudit` calls to currently unlogged actions.

**Files to modify**:

| File | Actions to Log |
|---|---|
| `OrderDetailPage.tsx` | Order status changes (accept, reject, complete, cancel) |
| `SellerDashboardPage.tsx` | Order acceptance/rejection from seller view |
| `SellerSettingsPage.tsx` | Seller profile changes (business name, availability, categories) |
| `BuilderDashboardPage.tsx` | Any builder-society management actions |

**Also**: Create a database trigger `trg_audit_order_status` on `orders` UPDATE that automatically logs status changes to `audit_log` when `status` column changes. This catches ALL order status changes regardless of which UI triggers them.

---

## 6. Architecture Documentation

**What**: Create a comprehensive "new table checklist" and consolidate existing docs.

**Deliverables**:

| Document | Location | Content |
|---|---|---|
| New Table Checklist | `.lovable/hardening-docs/new-table-checklist.md` | Step-by-step: add society_id, add RLS, add indexes, add to trigger registry, add audit logging |
| Architecture Overview | `.lovable/plan.md` (update) | Link to all hardening docs, architecture decision log |

Existing docs already created:
- `.lovable/hardening-docs/role-access-matrix.md` -- exists
- `.lovable/hardening-docs/index-registry.md` -- exists
- `.lovable/hardening-docs/trigger-registry.md` -- exists
- `.lovable/hardening-docs/rls-test-plan.md` -- exists
- `.lovable/rls-policy-map.md` -- exists

---

## Implementation Phases

### Phase 1: Monitoring Infrastructure (deploy together)
1. Create `trigger_errors` table with RLS
2. Replace 7 activity trigger functions with error-handling versions
3. Create `trg_audit_order_status` trigger on orders
4. Enable `pg_stat_statements` extension

### Phase 2: Edge Functions (deploy together)
5. Create `governance-health-check` edge function
6. Create `check-trigger-health` edge function

### Phase 3: Frontend Audit Coverage
7. Add `logAudit` to `OrderDetailPage.tsx` for status changes
8. Add `logAudit` to `SellerDashboardPage.tsx` for order actions
9. Add `logAudit` to `SellerSettingsPage.tsx` for profile changes

### Phase 4: Documentation
10. Create new-table-checklist.md
11. Update plan.md with architecture index

---

## Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Replacing trigger functions | LOW | Functions are SECURITY DEFINER; replacement adds error handling without changing core logic |
| Adding trigger_errors table | NONE | New table, no impact on existing |
| Adding audit trigger on orders | LOW | AFTER UPDATE trigger, does not modify data flow |
| Edge functions | NONE | New functions, no existing code affected |
| Frontend logAudit additions | NONE | Fire-and-forget audit calls, no UI impact |

---

## Dependencies

```text
Phase 1 (DB migration) -- no dependencies
Phase 2 (Edge functions) -- depends on Phase 1 (trigger_errors table must exist)
Phase 3 (Frontend) -- independent of Phase 1/2
Phase 4 (Docs) -- independent
```

Phases 1 + 3 + 4 can run in parallel. Phase 2 waits for Phase 1.

---

## Post-Implementation Verification

After all phases:
- Invoke `governance-health-check` to verify no societies have 0 admins
- Invoke `check-trigger-health` to verify no trigger errors exist
- Confirm `logAudit` fires on order status change via OrderDetailPage
- Verify `trigger_errors` table is empty (all triggers healthy)
- Verify `pg_stat_statements` is collecting data

## Architecture Freeze

After this phase completes:
- No schema changes for 30 days
- No new triggers
- No RLS policy modifications
- Only product feature work on existing tables

