

# Audit: Notification & Live Activity Sync with Status Flow

## Current State

### ✅ What IS properly synced with `category_status_flows`

| Component | Synced Field | How |
|-----------|-------------|-----|
| **Live Activity Card** (native) | `display_label`, `sort_order`, `buyer_hint` | `buildLiveActivityData` reads from `category_status_flows` |
| **ActiveOrderStrip** (home page) | `display_label`, `color`, `icon` | Fetches flow data per status on each query |
| **Silent push flag** | `silent_push` column | DB trigger reads `csf.silent_push` from flow table |
| **Terminal detection** | `is_terminal` column | Used by orchestrator, strip, and trigger |

### ❌ What is NOT synced — hardcoded in the DB trigger

The `fn_enqueue_order_status_notification` trigger has a **hardcoded CASE statement** (lines 63–129) for notification titles and bodies:

```sql
CASE NEW.status
  WHEN 'accepted' THEN v_title := '✅ Order Accepted!'; v_body := '...';
  WHEN 'preparing' THEN v_title := '👨‍🍳 Being Prepared'; v_body := '...';
  -- ... etc for every status
```

Meanwhile, the `category_status_flows` table already has **configurable columns** that are populated but **completely ignored**:
- `notification_title` — e.g. "✅ Order Accepted!"
- `notification_body` — e.g. "{seller_name} has accepted your order."
- `notify_buyer` — flag to control whether a notification fires at all

This means: if you update notification text in the admin workflow editor, **nothing changes** in actual push notifications. The trigger ignores those columns.

### ❌ Edge function delivery notifications

The `update-delivery-location` edge function sends its own hardcoded notifications for:
- `delivery_en_route` — "🛵 Your order is on the way!"
- `delivery_proximity` — "📍 Almost there!"
- `delivery_proximity_imminent` — "🏃 Driver arriving now!"
- `delivery_delayed` — "🔄 Delivery slightly delayed"
- `delivery_stalled` — "⏳ Delivery may be delayed"

These are **not status-change notifications** — they're GPS-triggered supplementary alerts. They correctly have order status + age guards. These don't need to come from the flow table (they're delivery-specific, not workflow-specific).

## What Needs to Change

**One fix**: Make the DB trigger use the flow table's `notify_buyer`, `notification_title`, and `notification_body` columns instead of the hardcoded CASE block. This makes the entire notification pipeline DB-driven and admin-editable.

### Implementation

**Migration**: Replace `fn_enqueue_order_status_notification`

1. Remove the hardcoded CASE block (lines 63–129)
2. Query `category_status_flows` for the matching status to get `notify_buyer`, `notification_title`, `notification_body`
3. If `notify_buyer = false` or no matching row → skip buyer notification
4. Replace `{seller_name}` placeholder in `notification_body` with `v_seller_name`
5. Keep the existing seller notification logic for `completed` status
6. Keep `silent_push`, terminal detection, and dedup logic unchanged

### Result After Fix

| Signal | Source | DB-Driven? |
|--------|--------|-----------|
| Push notification title/body | `category_status_flows.notification_title/body` | ✅ |
| Whether to notify buyer | `category_status_flows.notify_buyer` | ✅ |
| Silent vs audible push | `category_status_flows.silent_push` | ✅ (already) |
| Live Activity label/progress | `category_status_flows.display_label/sort_order` | ✅ (already) |
| ActiveOrderStrip label/color | `category_status_flows.display_label/color/icon` | ✅ (already) |
| GPS delivery alerts | Edge function (hardcoded, status-gated) | N/A (correct) |

### Files Changed

| File | Change |
|------|--------|
| New SQL migration | Replace `fn_enqueue_order_status_notification` to read from flow table |

No frontend changes needed — the client-side components are already properly synced.

