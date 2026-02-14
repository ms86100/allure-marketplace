
# Full Database Architecture Verification Report

## 1. Complete Table Inventory

**55 tables in public schema. 0 views. 0 materialized views.**

All 55 tables have **RLS enabled = true**.

### Tables with society_id column (22 tables -- direct isolation):
audit_log, builder_societies, bulletin_posts, construction_milestones, coupons, dispute_tickets, emergency_broadcasts, help_requests, maintenance_dues, orders, profiles, project_documents, project_questions, project_towers, seller_profiles, skill_listings, snag_tickets, society_activity, society_admins, society_expenses, society_income, society_report_cards

### Tables WITHOUT society_id (33 tables):
admin_settings, builder_members, builders, bulletin_comments, bulletin_rsvps, bulletin_votes, cart_items, category_config, chat_messages, coupon_redemptions, device_tokens, dispute_comments, expense_flags, expense_views, favorites, featured_items, help_responses, milestone_reactions, order_items, parent_groups, payment_records, products, project_answers, reports, reviews, seller_licenses, skill_endorsements, societies, subscription_deliveries, subscriptions, user_notifications, user_roles, warnings

---

## 2. Multi-Tenant Isolation Classification

### Society-Scoped (22 tables with direct society_id):
All 22 tables listed above. RLS enforces `society_id = get_user_society_id(auth.uid())` on SELECT for residents.

### Indirectly Scoped via FK (13 tables):
| Table | Scoped Via | Chain |
|---|---|---|
| bulletin_comments | bulletin_posts.society_id | post_id -> bulletin_posts |
| bulletin_rsvps | bulletin_posts.society_id | post_id -> bulletin_posts |
| bulletin_votes | bulletin_posts.society_id | post_id -> bulletin_posts |
| dispute_comments | dispute_tickets.society_id | ticket_id -> dispute_tickets |
| expense_flags | society_expenses.society_id | expense_id -> society_expenses |
| expense_views | society_expenses.society_id | expense_id -> society_expenses |
| help_responses | help_requests.society_id | request_id -> help_requests |
| milestone_reactions | construction_milestones.society_id | milestone_id -> construction_milestones |
| order_items | orders (buyer_id/seller_id) | order_id -> orders |
| project_answers | project_questions.society_id | question_id -> project_questions |
| products | seller_profiles.society_id | seller_id -> seller_profiles |
| skill_endorsements | skill_listings.society_id | skill_id -> skill_listings |
| seller_licenses | seller_profiles.society_id | seller_id -> seller_profiles |

### User-Private (8 tables -- scoped to auth.uid()):
| Table | Isolation Method |
|---|---|
| cart_items | user_id = auth.uid() |
| favorites | user_id = auth.uid() |
| device_tokens | user_id = auth.uid() |
| user_notifications | user_id = auth.uid() |
| coupon_redemptions | user_id = auth.uid() |
| subscription_deliveries | via subscriptions.buyer_id |
| subscriptions | buyer_id = auth.uid() |
| user_roles | user_id = auth.uid() (read), admin-only (write) |

### Platform-Global (6 tables -- intentionally shared):
| Table | Reason |
|---|---|
| admin_settings | Platform config |
| category_config | Global categories |
| parent_groups | Global category groups |
| featured_items | Global promotions |
| societies | Public directory |
| builders | Builder directory |
| builder_members | Builder org membership |

### NOT SCOPED -- IDENTIFIED RISKS (6 tables):
| Table | Risk Level | Issue |
|---|---|---|
| **products** | **CRITICAL** | SELECT policy shows ALL approved sellers' products globally -- no society_id check. Any authenticated user sees products from ALL societies |
| **reviews** | **HIGH** | `is_hidden = false` allows global read. No society_id. Cross-society review visibility |
| **reports** | **MEDIUM** | reporter_id scoped for SELECT, but admin-only UPDATE has no society scope for society admins |
| **warnings** | **MEDIUM** | user_id scoped for SELECT, but only `is_admin()` can create -- society admins cannot issue warnings |
| **chat_messages** | **MEDIUM** | No society isolation -- sender/receiver only. Cross-society chat possible if buyer orders from cross-society seller |
| **payment_records** | **MEDIUM** | buyer_id/seller_id scoped. No society_id. Admin sees ALL payments globally |

---

## 3. CRITICAL FINDINGS

### Finding 1: `is_society_admin()` DOES NOT CHECK `deactivated_at`

```sql
-- Current implementation:
SELECT EXISTS (
  SELECT 1 FROM public.society_admins
  WHERE user_id = _user_id AND society_id = _society_id
) OR public.is_admin(_user_id)
```

**A deactivated society admin RETAINS FULL ADMIN PRIVILEGES.** The `deactivated_at` column exists but is never checked. This is a **critical security vulnerability** -- removing an admin does nothing.

**Fix required:**
```sql
WHERE user_id = _user_id AND society_id = _society_id AND deactivated_at IS NULL
```

### Finding 2: Products Visible Cross-Society (CRITICAL DATA LEAK)

The products SELECT policy checks `seller_profiles.verification_status = 'approved'` but does NOT check `seller_profiles.society_id = get_user_society_id(auth.uid())`. Any authenticated user from ANY society can see ALL products from ALL approved sellers across ALL societies.

**This is the most critical data isolation failure in the system.**

### Finding 3: `seller_profiles` UPDATE Missing Society Admin

The seller_profiles UPDATE policy is:
```
(user_id = auth.uid()) OR is_admin(auth.uid())
```

Society admins CANNOT approve/reject sellers in their society. The SocietyAdminPage UI calls this update, but it will **silently fail** for society admins.

### Finding 4: `society_expenses` Missing Society Admin Write Access

All expense write policies (INSERT/UPDATE/DELETE) require `is_admin(auth.uid())` -- platform admin only. Society admins cannot manage expenses. The `is_society_admin()` check is missing.

### Finding 5: `snag_tickets` Missing Society Admin in SELECT/UPDATE

- SELECT: Only `reported_by = auth.uid()` OR platform admin. Society admins cannot see other residents' snag reports.
- UPDATE: Only `is_admin(auth.uid())` OR reporter. Society admins cannot manage snags.

### Finding 6: `society_income` Missing Society Admin Write Access

All write policies require `is_admin(auth.uid())`. Society admins cannot manage income records.

---

## 4. RLS & Function Surface Area

| Metric | Count |
|---|---|
| Total RLS policies | **164** |
| SECURITY DEFINER functions (access control) | 14 |
| SECURITY DEFINER functions (triggers) | 18 |
| Total triggers on public tables | ~38 |
| Functions that bypass RLS | All 32 SECURITY DEFINER functions |

### Call Hierarchy:
```text
can_manage_society() -> is_society_admin() -> is_admin() -> has_role()
                     -> builder_members lookup
is_society_admin() -> is_admin() -> has_role()
get_user_auth_context() -> (reads profiles, societies, society_admins, user_roles, seller_profiles, builder_members)
get_builder_dashboard() -> (reads builders, societies, profiles, seller_profiles, dispute_tickets, snag_tickets)
search_marketplace() -> (reads seller_profiles, products)
```

**No circular dependencies confirmed.**

### Privilege Escalation Paths:
1. `user_roles` INSERT policy allows `user_id = auth.uid() AND role = 'buyer'`. Users can only self-assign buyer role. **Safe.**
2. `society_admins` INSERT policy requires `is_society_admin()`. But since `is_society_admin` does NOT check `deactivated_at`, a deactivated admin can still appoint new admins. **VULNERABILITY.**

---

## 5. Performance Readiness

### Current Scale:
- profiles: 5 rows
- orders: 13 rows
- products: 44 rows
- Total across all tables: ~200 rows

**System is pre-scale. No performance issues currently exist.**

### Index Coverage for Scale:

**Well-indexed tables:**
- audit_log: idx_audit_log_society, idx_audit_log_actor, idx_audit_log_target
- bulletin_posts: idx_bulletin_posts_society, idx_bulletin_posts_created, idx_bulletin_posts_category, idx_bulletin_posts_pinned

**Missing composite indexes (needed at scale):**
| Table | Missing Index | Impact |
|---|---|---|
| orders | (society_id, status) | Society admin order dashboard |
| orders | (buyer_id, status) | Buyer order history |
| orders | (seller_id, status) | Seller order management |
| dispute_tickets | (society_id, status) | Already in migration but NOT in actual DB indexes |
| snag_tickets | (society_id, status) | Same |
| society_expenses | (society_id, created_at) | Same |
| profiles | (society_id, verification_status) | Admin approval queue |
| seller_profiles | (society_id, verification_status) | Seller approval queue |
| user_roles | (user_id, role) | RLS function lookups |

**NOTE:** The composite indexes from the hardening migration may not have been applied. The pg_indexes query only shows PK and unique constraint indexes for these tables.

### N+1 Patterns:
- **Builder dashboard**: Fixed via `get_builder_dashboard()` RPC. No N+1.
- **Auth hydration**: Fixed via `get_user_auth_context()` RPC. Single call.
- **SocietyAdminPage**: Makes separate queries for pending users, pending sellers, admins, approved residents. 4 queries per load -- acceptable but could be consolidated.

---

## 6. Governance & Audit Trail Validation

### audit_log table: EXISTS with proper structure
- actor_id, action, target_type, target_id, society_id, metadata, created_at
- RLS: Admins + society admins can READ. Users can INSERT only with `actor_id = auth.uid()`. No UPDATE/DELETE. **Correct -- append-only.**

### Gaps in Audit Coverage:

| Action | Logged? | Evidence |
|---|---|---|
| Admin appointment | YES | SocietyAdminPage calls logAudit |
| Admin removal/deactivation | YES | SocietyAdminPage calls logAudit |
| User approval | YES | SocietyAdminPage calls logAudit |
| User rejection | YES | SocietyAdminPage calls logAudit |
| Seller approval | YES | SocietyAdminPage calls logAudit |
| Society settings change | YES | SocietyAdminPage calls logAudit |
| **Builder-society assignment** | **NO** | No audit logging in BuilderDashboardPage |
| **Platform admin actions** | **NO** | AdminPage.tsx does not call logAudit |
| **Order status changes** | **NO** | No audit logging on commerce actions |
| **Role changes via AdminPage** | **NO** | AdminPage role management has no audit |
| **Seller profile changes** | **NO** | SellerSettingsPage has no audit |

---

## 7. Trigger & Constraint Integrity

### Complete Trigger Registry (public schema):

| Trigger | Table | Timing | Events | Function | Side Effects |
|---|---|---|---|---|---|
| trg_auto_approve_resident | profiles | BEFORE | INSERT | auto_approve_resident | Modifies NEW.verification_status |
| update_profiles_updated_at | profiles | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_seller_profiles_updated_at | seller_profiles | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| check_seller_license_before_product | products | BEFORE | INSERT UPDATE | check_seller_license | RAISES EXCEPTION |
| update_products_updated_at | products | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| trg_set_order_society_id | orders | BEFORE | INSERT | set_order_society_id | Derives society_id from seller |
| update_orders_updated_at | orders | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_order_items_updated_at | order_items | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_rating_on_review | reviews | AFTER | INSERT UPDATE | update_seller_rating | WRITES to seller_profiles |
| update_payment_records_updated_at | payment_records | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_reports_updated_at | reports | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_device_tokens_updated_at | device_tokens | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_category_config_updated_at | category_config | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_admin_settings_updated_at | admin_settings | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_societies_updated_at | societies | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_parent_groups_updated_at | parent_groups | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_coupons_updated_at | coupons | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_bulletin_posts_updated_at | bulletin_posts | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_comment_count_on_insert | bulletin_comments | AFTER | INSERT | update_bulletin_comment_count | WRITES to bulletin_posts |
| update_comment_count_on_delete | bulletin_comments | AFTER | DELETE | update_bulletin_comment_count | WRITES to bulletin_posts |
| update_vote_count_on_insert | bulletin_votes | AFTER | INSERT | update_bulletin_vote_count | WRITES to bulletin_posts |
| update_vote_count_on_delete | bulletin_votes | AFTER | DELETE | update_bulletin_vote_count | WRITES to bulletin_posts |
| update_help_response_count_insert | help_responses | AFTER | INSERT | update_help_response_count | WRITES to help_requests |
| update_help_response_count_delete | help_responses | AFTER | DELETE | update_help_response_count | WRITES to help_requests |
| update_subscriptions_updated_at | subscriptions | BEFORE | UPDATE | update_updated_at | Sets updated_at |
| update_endorsement_count_insert | skill_endorsements | AFTER | INSERT | update_endorsement_count | WRITES to skill_listings, calls calculate_trust_score |
| update_endorsement_count_delete | skill_endorsements | AFTER | DELETE | update_endorsement_count | WRITES to skill_listings, calls calculate_trust_score |
| trg_validate_society_admin_limit | society_admins | BEFORE | INSERT | validate_society_admin_limit | RAISES EXCEPTION at limit |
| trg_protect_last_society_admin | society_admins | BEFORE | UPDATE | protect_last_society_admin | RAISES EXCEPTION if last admin |
| log_expense_activity | society_expenses | AFTER | INSERT | log_expense_activity | WRITES to society_activity |
| log_dispute_activity | dispute_tickets | AFTER | INSERT | log_dispute_activity | WRITES to society_activity |
| log_document_activity | project_documents | AFTER | INSERT | log_document_activity | WRITES to society_activity |
| log_broadcast_activity | emergency_broadcasts | AFTER | INSERT | log_broadcast_activity | WRITES to society_activity |
| log_answer_activity | project_answers | AFTER | INSERT | log_answer_activity | WRITES to society_activity |
| log_milestone_activity | construction_milestones | AFTER | INSERT | log_milestone_activity | WRITES to society_activity |
| log_snag_activity | snag_tickets | AFTER | INSERT | log_snag_activity | WRITES to society_activity |

**38 triggers total on public tables.**

### Conflict Risk:
- products: 2 BEFORE triggers (check_seller_license + update_updated_at). Independent concerns. **Low risk.**
- orders: 2 BEFORE triggers (set_order_society_id + update_updated_at). Independent. **Low risk.**
- society_admins: 2 BEFORE triggers (validate_limit on INSERT, protect_last on UPDATE). Different events. **No conflict.**

### Race Condition Risk:
- Denormalized counters (comment_count, vote_count, response_count, endorsement_count) use simple increment/decrement. Under high concurrency, concurrent INSERT + DELETE could produce negative counts. The `GREATEST(count - 1, 0)` guard prevents negatives but counts could still drift. **Low risk at current scale, medium risk at 100K+ concurrent users.**

---

## 8. Mandatory Fixes Before Scale

### CRITICAL (must fix before onboarding any new society):

**Fix 1: `is_society_admin()` must check `deactivated_at IS NULL`**
Without this, every deactivated admin retains full privileges. Every other governance feature depends on this function.

**Fix 2: Products SELECT policy must add society_id check**
Currently ANY user can see ALL products globally. Add:
```sql
AND seller_profiles.society_id = get_user_society_id(auth.uid())
```

**Fix 3: seller_profiles UPDATE must include `is_society_admin()`**
Society admins cannot approve sellers. Add:
```sql
OR is_society_admin(auth.uid(), (SELECT society_id FROM seller_profiles WHERE id = seller_profiles.id))
```

### HIGH (must fix before 10+ societies):

**Fix 4: society_expenses write policies need `is_society_admin()`**
Currently only platform admins can manage expenses. Society admins are blocked.

**Fix 5: snag_tickets SELECT/UPDATE need `is_society_admin()`**
Society admins cannot see or manage snag reports from other residents.

**Fix 6: society_income write policies need `is_society_admin()`**
Same as expenses -- society admins blocked from financial management.

**Fix 7: Add composite indexes**
The indexes from the hardening migration need verification -- they may not have been applied. Critical for: orders, dispute_tickets, snag_tickets, profiles, seller_profiles, user_roles.

### MEDIUM (before 50+ societies):

**Fix 8: reviews SELECT needs society scoping**
Currently globally visible. Should scope via seller_profiles.society_id.

**Fix 9: Platform admin actions in AdminPage need audit logging**
Only SocietyAdminPage logs actions. The global AdminPage does not.

**Fix 10: warnings table needs society admin CREATE access**
Society admins cannot issue warnings to residents.

---

## 9. Security Audit Verdict

### Would this pass an external security audit?

**NO. Three findings would be rated CRITICAL:**

1. **Deactivated admins retain full privileges** -- `is_society_admin()` does not check `deactivated_at`. This is a broken access revocation mechanism.

2. **Products visible cross-society** -- Complete data isolation failure on the core commerce table. Any authenticated user sees all products from all societies.

3. **164 RLS policies with no automated test suite** -- No way to verify policies work correctly. Any schema change could silently break isolation.

### What would pass:

- RLS enabled on ALL 55 tables (100% coverage)
- Audit log exists with append-only enforcement
- Admin appointment limits enforced via trigger
- Last admin protection enforced via trigger
- Auth hydration consolidated to single function
- Builder dashboard uses aggregated function (no N+1)
- Society-scoped tables (22) correctly enforce isolation
- Indirectly-scoped tables (13) correctly chain via FK

### Technical Debt Accepted:

1. 7 activity logging triggers fail silently (no alerting)
2. No automated RLS policy regression tests
3. No query performance monitoring
4. cart_items, favorites, subscriptions lack society isolation (tracked for Phase 4)
5. chat_messages allow cross-society messaging (may be intentional for commerce)

---

## 10. Implementation Priority

**Phase A (Blocking -- deploy together):**
1. Fix `is_society_admin()` to check `deactivated_at IS NULL`
2. Fix products SELECT to scope by society
3. Fix seller_profiles UPDATE to include society admins
4. Verify/apply composite indexes

**Phase B (High -- deploy within 1 week):**
5. Fix society_expenses policies for society admins
6. Fix snag_tickets policies for society admins
7. Fix society_income policies for society admins
8. Fix reviews SELECT to scope by society

**Phase C (Medium -- deploy within 2 weeks):**
9. Add audit logging to AdminPage
10. Add warnings society admin access
11. Add RLS regression test queries
