

# Export Complete Database Schema Reference

## Summary

The database contains **143 tables**, **200+ RLS policies**, **80+ database functions**, **60+ triggers**, **300+ indexes**, and **5 custom enum types**. The total DDL output exceeds **250,000 characters** — far too large for chat.

## What I'll Create

A single consolidated file: **`.lovable/schema-export.sql`** containing everything in one runnable reference:

### Section 1: Custom Enum Types (5 types)
- `order_status` (20 values: placed → no_show)
- `product_category` (5 values)
- `seller_type_enum` (2 values)
- `service_category` (52 values)
- `user_role` (4 values: buyer, seller, admin, security_officer)
- `verification_status` (5 values)

### Section 2: CREATE TABLE Statements (143 tables)
All tables with columns, types, defaults, NOT NULL constraints, and inline foreign keys. Organized alphabetically from `admin_settings` through `worker_salary_records`.

### Section 3: Foreign Key Relationships (~200 constraints)
All FK references extracted from `pg_constraint` — e.g., `cart_items.product_id → products.id`, `orders.buyer_id → profiles.id`.

### Section 4: Indexes (~300 indexes)
All custom and primary key indexes.

### Section 5: RLS Policies (~200 policies)
Every policy with table, operation (SELECT/INSERT/UPDATE/DELETE), USING clause, and WITH CHECK clause. Extracted from `pg_policies`.

### Section 6: Database Functions (~80 functions)
Full `CREATE OR REPLACE FUNCTION` definitions for all functions — access control helpers (`has_role`, `is_admin`, `is_society_admin`), business logic (`create_multi_vendor_orders`, `book_service_slot`), triggers, RPCs, etc.

### Section 7: Triggers (~60 triggers)
All trigger registrations with timing, events, and attached function.

### Section 8: Realtime Configuration
Tables enabled for realtime subscriptions.

### Section 9: Seed Data Function
The `seed-test-data` edge function reference showing the test data creation pattern (3 societies, 4 users, 2 sellers, 5 products).

## Implementation
- Single file creation at `.lovable/schema-export.sql`
- Data is already queried from live database — just needs formatting
- No database changes required
- File will be ~200KB+ given the volume of functions

## Note on Size
Due to the massive schema (143 tables, 80+ functions with full bodies), this file will be very large. I'll structure it with clear section headers and table-of-contents comments so you can navigate it easily.

