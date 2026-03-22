

## Make Notification Settings Auto-Inherit from Default — Systemic Fix

### Problem
The Bug 3 fix was a static one-time data patch for `food_beverages/self_fulfillment`. Any future category added with `notify_buyer=false` / `notification_title=NULL` will have the same broken behavior. The system needs a dynamic guarantee.

### Root Cause
When new `category_status_flows` rows are inserted for a non-default parent_group, the notification fields (`notify_buyer`, `notify_seller`, `notification_title`, `notification_body`, `notification_action`) default to `false`/`NULL`. The trigger's fallback only fires when `notification_title IS NULL`, but it respects the category-specific `notify_buyer=false` flag — so the fallback title is found but then blocked by the flag.

### Fix: DB Trigger to Auto-Inherit Notification Fields

Create a trigger on `category_status_flows` that fires on INSERT. When a non-default row is inserted with `notification_title IS NULL`, it automatically copies notification fields from the matching `default` row (same `transaction_type` + `status_key`).

This ensures:
- Any new category workflow automatically gets correct notification settings
- Admins can still override by explicitly setting values
- No client-side changes needed
- Works for ALL current and future categories

### SQL Migration

**1. Auto-inherit trigger:**
```sql
CREATE OR REPLACE FUNCTION fn_inherit_notification_defaults()
RETURNS trigger AS $$
BEGIN
  -- Only apply to non-default groups where notification_title is not explicitly set
  IF NEW.parent_group <> 'default' AND NEW.notification_title IS NULL THEN
    SELECT 
      COALESCE(NEW.notify_buyer, d.notify_buyer),
      COALESCE(NEW.notify_seller, d.notify_seller),
      d.notification_title,
      d.notification_body,
      d.notification_action,
      d.seller_notification_title,
      d.seller_notification_body
    INTO
      NEW.notify_buyer,
      NEW.notify_seller,
      NEW.notification_title,
      NEW.notification_body,
      NEW.notification_action,
      NEW.seller_notification_title,
      NEW.seller_notification_body
    FROM category_status_flows d
    WHERE d.parent_group = 'default'
      AND d.transaction_type = NEW.transaction_type
      AND d.status_key = NEW.status_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**2. Backfill ALL existing non-default rows that still have NULL notification_title:**
```sql
UPDATE category_status_flows csf
SET notify_buyer = d.notify_buyer,
    notify_seller = d.notify_seller,
    notification_title = d.notification_title,
    notification_body = d.notification_body,
    notification_action = d.notification_action,
    seller_notification_title = d.seller_notification_title,
    seller_notification_body = d.seller_notification_body
FROM category_status_flows d
WHERE csf.parent_group <> 'default'
  AND csf.notification_title IS NULL
  AND d.parent_group = 'default'
  AND d.transaction_type = csf.transaction_type
  AND d.status_key = csf.status_key;
```

This is a single backfill that fixes ALL categories at once — not just food_beverages.

### What This Replaces
- The static `food_beverages/self_fulfillment` UPDATE from the previous migration becomes redundant (already applied, no harm)
- No future per-category data patches will ever be needed

### Files Changed
| File | Change |
|---|---|
| SQL Migration | Create `fn_inherit_notification_defaults` trigger + backfill all existing NULL rows |

No client-side changes required.

