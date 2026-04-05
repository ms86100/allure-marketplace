

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
supported_languages        system_settings           test_results
transaction_audit_trail    trigger_errors            trust_tier_config
user_feedback              visitor_entries           visitor_types
worker_attendance          worker_entry_logs         worker_flat_assignments
```

### 2. Extra Tables in Your DB (not in source — 7 tables)

```text
category_status_transitions    delivery_feedback
delivery_time_stats            listing_type_workflow_map
live_activity_tokens           order_otp_codes
order_suggestions
```

These may be newer features you built. Dropping them would break functionality.

### 3. Tables with Major Schema Divergence (~40 tables)

These tables exist in both databases but have **completely different column structures** — not just missing columns, but renamed columns, different types, and different semantics. Key examples:

| Table | Source Columns | Your DB Columns | Notes |
|---|---|---|---|
| `ai_review_log` | target_type, target_id, decision, confidence, reason, rule_hits, input_snapshot, model_used | product_id, seller_id, review_result, confidence, suggestion, flags | Completely different design |
| `badge_config` | tag_key, badge_label, color, priority, layout_visibility | badge_key, display_name, entity_type, threshold_value, threshold_type | Different design |
| `builder_announcements` | builder_id, society_id, title, body, category, posted_by | builder_id, society_id, title, body, type, priority, attachment_urls, is_active, published_at, expires_at, created_by | Different + extra columns |
| `bulletin_posts` | category, attachment_urls, poll_deadline, rsvp_enabled | type, image_url, tags, visibility, rsvp_limit, poll_end_date, expires_at | Renamed columns everywhere |
| `campaigns` | sent_by, target_platform, target_user_ids, targeted_count, etc. | created_by, type, target_audience, filters, scheduled_at | Completely different |
| `category_config` | 40+ columns with specific defaults | ~30 columns, different defaults (layout_type default 'grid' vs 'ecommerce') | Missing ~12 columns |
| `category_status_flows` | status_key, parent_group, sort_order, actor, is_terminal | statuses array, is_deprecated, creates_tracking_assignment, is_transit, starts_live_activity | Completely redesigned |
| `construction_milestones` | stage, photos, completion_percentage, posted_by | milestone_date, status, image_urls, progress_percentage, created_by | Different design |
| `delivery_assignments` | 30+ columns (otp_hash, partner_payout, etc.) | ~20 columns, different names (picked_up_at vs pickup_at, failure_reason vs failed_reason) | Major structural diff |
| `delivery_partners` | society_id, name, provider_type, api_config | user_id, phone, vehicle_type, current_lat/lng, is_available | Completely different purpose |
| `dispute_tickets` | society_id, submitted_by, description, photo_urls, sla_deadline | order_id, raised_by, against_user, reason, evidence_urls, priority, assigned_to | Different model |
| `gate_entries` | user_id, entry_type, confirmation_status | visitor_name, visitor_phone, purpose, exit_time, vehicle_number, guard_id, visitor_entry_id | Completely different |
| `help_requests` | author_id, tag, expires_at | requester_id, urgency, category, image_url | Different column names |
| `maintenance_dues` | flat_identifier, month, amount, status, receipt_url | unit_number, due_date, month_year, payment_status, late_fee, block | Different design |
| `marketplace_events` | product_id, seller_id, category, layout_type, event_type, user_id | entity_type, entity_id, actor_id, society_id | Different model |
| `orders` | ~40 columns | ~50 columns with different names (subtotal, packaging_fee, net_amount, etc.) | Massive divergence |
| `seller_profiles` | categories text[], seller_type, store_location_source | categories product_category[], many extra fields | Type differences |
| `seller_licenses` | group_id, status, admin_notes, submitted_at, reviewed_at | license_type, license_number, document_url, verified, verified_at, expires_at | Different design |
| `society_activity` | activity_type, title, description, reference_id, reference_type | action, entity_type, entity_id, metadata | Different model |
| `society_expenses` | vendor_name, invoice_url, added_by | status, description, receipt_url, approved_by, created_by, added_by | Different model |

### 4. RLS Policy Gaps

Your live DB has **135 RLS policies**. The source defines **~200 policies**. Many policies reference different column names (e.g., `raised_by` vs `submitted_by` in dispute_tickets), so they cannot simply be copied.

---

## Recommended Approach

### Phase 0: Immediate — Safe Additions (no data loss)

Create the ~35 missing tables that don't conflict with anything. This is safe and can be scripted immediately.

**Deliverable:** A single SQL migration file that creates all missing tables with their indexes and RLS policies.

### Phase 1: Column Additions on Compatible Tables

For tables where the source just has MORE columns than your DB (but no renames), add the missing columns with defaults.

### Phase 2: Schema Reconciliation (requires decisions)

For the ~40 tables with different column names/structures, you need to decide per-table:
- **Option A:** Keep your current schema (if the frontend code already works with it)
- **Option B:** Migrate to the source schema (requires updating all frontend code that references these tables)
- **Option C:** Hybrid — add source columns alongside existing ones

### Phase 3: RLS Policy Alignment

Once schemas are reconciled, align RLS policies to match the source.

---

## What I Can Do Now

I can generate **Phase 0** immediately — a complete SQL script to create all ~35 missing tables with their primary keys, indexes, and RLS policies. This is safe, additive, and won't break anything.

For Phase 2, I need your guidance: should the app's frontend code match the source project's schema, or should we keep your current column names and adapt the source schema to match?

