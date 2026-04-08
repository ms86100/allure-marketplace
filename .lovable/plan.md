

# RLS Policy Audit: Missing and Incomplete Policies

## Summary

Your project has **155 tables** with RLS enabled. The security scan found **90 findings** total: 8 tables with zero policies, 3 overly permissive policies, 6 functions with mutable search paths, and 16 specific data exposure or protection gaps.

---

## Part 1: Tables with RLS Enabled but ZERO Policies (8 tables)

These tables have RLS turned on, which means all operations are blocked by default — but no policies exist to allow legitimate access. Any client-side query will return empty results or fail silently.

| Table | Risk Level | What It Stores | Needed Policies |
|---|---|---|---|
| `category_status_transitions` | Low | Config: order status flow rules | SELECT for all (read-only config) |
| `listing_type_workflow_map` | Low | Config: workflow definitions | SELECT for all (read-only config) |
| `delivery_feedback` | Medium | Buyer ratings on deliveries | SELECT for buyer/seller/admin, INSERT for buyer |
| `delivery_time_stats` | Low | Aggregated delivery stats | SELECT for admin/seller |
| `live_activity_tokens` | Medium | iOS Live Activity push tokens | ALL for own user_id |
| `order_otp_codes` | **High** | Delivery verification OTPs | SELECT restricted to order buyer/seller only |
| `order_suggestions` | Medium | Reorder suggestions per user | SELECT/UPDATE for own user_id |
| `test_scenarios` | Low | QA test definitions | SELECT/ALL for admin only |

## Part 2: Tables with Incomplete Policies (functional gaps)

These tables have some policies but are missing operations needed for the app to work:

| Table | Has | Missing | Impact |
|---|---|---|---|
| `service_booking_addons` | SELECT (admin only) | INSERT for buyers, SELECT for buyer/seller | Buyers can't save add-ons with bookings |
| `service_addons` | SELECT only | INSERT/UPDATE/DELETE for sellers | Sellers can't manage add-ons |
| `service_staff` | SELECT only | INSERT/UPDATE/DELETE for sellers | Sellers can't manage staff |
| `transaction_audit_trail` | SELECT only | INSERT for system/triggers | Audit trail can't be written from client |

## Part 3: Overly Permissive Policies (security risks)

From the scan — 3 policies use `WITH CHECK (true)` allowing any authenticated user to write:

| Table | Policy | Risk |
|---|---|---|
| `user_notifications` | INSERT with `true` | Any user can inject notifications for any other user |
| `society_activity` | INSERT with `true` | Any user can fake activity records for any society |
| `product_edit_snapshots` | INSERT with `true` | Any user can insert snapshots for any product |

## Part 4: Sensitive Data Exposure (from scan)

| Finding | Severity | Table |
|---|---|---|
| Bank account/UPI IDs publicly readable | **Error** | `seller_profiles` |
| Phone numbers publicly readable | **Error** | `products` |
| Email/phone readable platform-wide | **Error** | `profiles` |
| Visitor OTP codes visible to all society members | **Error** | `visitor_entries` |
| Order OTP codes — no visible SELECT policy | **Error** | `order_otp_codes` |
| Realtime channel has no authorization | **Error** | `chat_messages` (realtime) |
| Notification INSERT open to all | **Error** | `user_notifications` |

## Part 5: Other Findings

- **6 functions** with mutable `search_path` (potential privilege escalation)
- **2 extensions** installed in `public` schema (should be in `extensions`)
- **Leaked password protection** disabled in auth settings
- **Storage**: `app-images` bucket INSERT has no folder-scoping (any user can upload to any path)

## Recommended Fix Priority

1. **Immediate** (security): Fix the 3 overly permissive INSERT policies + seller financial data exposure
2. **High** (functionality): Add policies for the 8 zero-policy tables
3. **Medium**: Complete missing CRUD policies on service tables
4. **Low**: Fix function search paths, move extensions, enable leaked password protection

## Implementation Approach

A single SQL migration can address all 8 zero-policy tables and the 3 overly permissive policies. The sensitive data exposure on `seller_profiles` requires either a Postgres view or column-level security. I can generate the complete migration SQL when you approve.

