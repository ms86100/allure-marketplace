

# Seed Allure Marketplace Config Data

## Overview

The Allure Marketplace database has the correct schema (all 440 migrations ran), but 8 config tables are empty or incomplete. Data from Sociva needs to be replicated. Some data was in migrations (which should have run), and some was added via the insert tool (which wouldn't carry over).

## Approach

Since this is pure data insertion (no schema changes), I'll use the **insert tool** to execute all INSERT statements. All statements will use `ON CONFLICT DO NOTHING` for idempotency. Execution will follow foreign-key dependency order.

## Execution Steps (9 insert operations)

### Step 1: `parent_groups` (10 rows)
Food, Classes, Services, Personal, Professional, Rentals, Resale, Events, Pets, Property — with icons, colors, sort_order. Extracted from migration `20260213104201`.

### Step 2: `order_status_config` (17 rows)
All statuses: placed, accepted, preparing, ready, picked_up, delivered, completed, cancelled, enquired, quoted, scheduled, in_progress, returned, on_the_way, arrived, assigned, payment_pending. From migrations `20260215115217`, `20260301051403`, `20260322105521`.

### Step 3: `category_config` (~55 rows)
Original 53 categories from migration `20260130102121` plus newer ones (sweets_desserts, homemade_products, party_bulk_orders, specialty_food, free_sharing, ayurveda) that were added via insert tool. Includes all behavior flags, display settings, and transaction_type/default_action_type values.

### Step 4: `action_type_workflow_map` (8 rows)
add_to_cart, buy_now, book, request_service, request_quote, contact_seller, schedule_visit, make_offer. From migration `20260403164152`.

### Step 5: `listing_type_workflow_map` (7 rows)
cart_purchase, buy_now, book_slot, request_service, request_quote, contact_only, schedule_visit. From migration `20260320064628`.

### Step 6: `category_status_flows` (~100+ rows)
All workflow steps across all transaction types:
- food/grocery/shopping × cart_purchase (from migration `20260301051403`)
- services/personal/professional/pets × request_service
- classes/events × book_slot
- default × seller_delivery (from migration `20260318112122`)
- food_beverages × self_fulfillment (from migration `20260322055030`)
- service_booking and contact_enquiry flows (these were inserted via insert tool in Sociva — I'll reconstruct from the known patterns)

### Step 7: `category_status_transitions` (~150+ rows)
All valid from→to transitions:
- default × seller_delivery (from migration `20260318112122`)
- food_beverages × self_fulfillment (from migration `20260322055030`)
- default × cart_purchase ready→picked_up seller fallback (from migration `20260319140140`)
- **Cart purchase, request_service, book_slot, service_booking, contact_enquiry transitions** — these were inserted via insert tool. I'll reconstruct the complete set based on the workflow steps.

### Step 8: `category_allowed_action_types` (~60 rows)
Dynamic JOINs from category_config IDs to action types. From migration `20260403171848`.

### Step 9: `system_settings` (2 rows)
item_condition_labels and rental_period_labels JSON values. From migration `20260215115217`.

## Risk Assessment
- **Zero risk** to existing data — all `ON CONFLICT DO NOTHING`
- **No schema changes** — pure data inserts
- Tables already have RLS policies from migrations
- Foreign keys enforced: must insert in dependency order

## Technical Notes
- The `category_config` inserts need all columns that exist in the current schema (accepts_preorders, layout_type, form_hints columns, display columns, transaction_type, default_action_type, supports_addons, supports_recurring, supports_staff_assignment, etc.)
- The `category_status_flows` inserts need all display/notification columns (display_label, color, icon, buyer_hint, seller_hint, notify_buyer, notification_title, notification_body, notification_action, notify_seller, seller_notification_title, seller_notification_body, silent_push, is_transit, requires_otp, otp_type, is_success, creates_tracking_assignment, is_deprecated)
- The service_booking and contact_enquiry flows will be reconstructed from known patterns (requested→confirmed→scheduled→in_progress→completed→cancelled for service_booking; enquired→quoted→completed→cancelled for contact_enquiry)

