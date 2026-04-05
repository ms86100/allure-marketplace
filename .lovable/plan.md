

# Database Gap Analysis: Live DB vs Source Project

## Summary

Your live database has **135 tables** while the source project defines **143 tables**. However, the gap is far worse than 8 missing tables — the two databases evolved independently, resulting in **~40+ tables with completely different column structures**, 7 extra tables in your DB that don't exist in the source, and ~35 tables missing entirely.

**This cannot be solved with a single migration script.** A destructive migration would wipe existing data and likely break your running application. Instead, I recommend a phased approach.

---

## Gap Categories

### 1. Tables Missing from Your DB (~35 tables)

These exist in the source but are completely absent from your live database:

```text
call_feedback              orders_archive             price_history
project_answers            project_documents          seller_contact_interactions
seller_conversation_messages  seller_conversations    seller_recommendations
service_addons             service_availability_schedules  service_booking_addons
service_listings           service_recurring_configs  service_staff
session_feedback           slot_holds                 slot_waitlist
society_features           society_income             society_notices
society_reports            stock_watchlist            subcategories
supported_languages        system_settings            test_results
transaction_audit_trail    trigger_errors             trust_tier_config
user_feedback              visitor_entries            visitor_types
worker_attendance          worker_entry_logs          worker_flat_assignments
```

### 2. Extra Tables in Your DB (not in source — 7 tables)

These exist in your DB but NOT in the source project. Keeping them is safe; dropping them would break features.

```text
category_status_transitions    delivery_feedback
delivery_time_stats            listing_type_workflow_map
live_activity_tokens           order_otp_codes
order_suggestions
```

### 3. Tables with Major Schema Divergence (~40 tables)

These tables exist in both databases but have **completely different column structures**. Key examples:

| Table | Source Design | Your DB Design |
|---|---|---|
| `ai_review_log` | Generic: target_type, target_id, decision, rule_hits | Product-specific: product_id, seller_id, review_result |
| `badge_config` | tag_key, badge_label, layout_visibility | badge_key, entity_type, threshold_value |
| `bulletin_posts` | category, attachment_urls, poll_deadline | type, image_url, tags, visibility |
| `campaigns` | sent_by, target_platform, target_user_ids | created_by, type, target_audience, filters |
| `category_status_flows` | status_key, actor, is_terminal | statuses array, is_deprecated, creates_tracking_assignment |
| `delivery_assignments` | 30+ columns (otp_hash, partner_payout) | ~20 columns, different names |
| `delivery_partners` | provider_type, api_config | user_id, phone, vehicle_type, current_lat/lng |
| `dispute_tickets` | submitted_by, photo_urls, sla_deadline | raised_by, order_id, against_user, evidence_urls |
| `gate_entries` | confirmation_status | visitor_name, visitor_phone, purpose, guard_id |
| `help_requests` | author_id, tag | requester_id, urgency, category |
| `orders` | ~40 columns | ~50 columns with subtotal, packaging_fee, net_amount |
| `seller_licenses` | group_id, status, admin_notes | license_type, verified, expires_at |
| `seller_profiles` | categories text[], seller_type enum | categories product_category[] |
| `society_activity` | activity_type, title, reference_id | action, entity_type, entity_id |

### 4. RLS Policy Gap

Your DB: **135 policies**. Source: **~200 policies**. Many reference different column names.

---

## Recommended Phased Approach

### Phase 0: Safe Additions (immediate, no data loss)
Create the ~35 missing tables with primary keys, indexes, and RLS policies. This is purely additive and safe.

### Phase 1: Column Additions
For tables where the source has MORE columns than yours (but no renames), add missing columns with defaults.

### Phase 2: Schema Reconciliation (requires your decision)
For the ~40 divergent tables, you must choose per-table:
- **Keep your schema** (frontend already uses it)
- **Migrate to source schema** (requires rewriting frontend code)
- **Hybrid** — add source columns alongside existing ones

### Phase 3: RLS Policy Alignment
Once schemas match, align all ~200 RLS policies.

---

## What I Can Do Now

I can generate **Phase 0** immediately — a downloadable SQL script to create all ~35 missing tables. This is safe and won't break anything.

**For Phase 2**, I need your input: should your frontend match the source project's column names, or should we keep your current column names?

