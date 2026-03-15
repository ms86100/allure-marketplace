

# Workflow-Driven Buyer Notifications on Status Change

## Current State
- `fn_enqueue_order_status_notification()` trigger uses a hardcoded CASE statement with 17 status-specific notification messages
- No notification configuration exists in `category_status_flows`
- The booking reminder system (`send-booking-reminders`) already works independently via cron

## Plan

### 1. Database Migration — Add notification columns to `category_status_flows`

Add 4 optional columns:
```sql
ALTER TABLE category_status_flows ADD COLUMN notify_buyer boolean DEFAULT false;
ALTER TABLE category_status_flows ADD COLUMN notification_title text;
ALTER TABLE category_status_flows ADD COLUMN notification_body text;
ALTER TABLE category_status_flows ADD COLUMN notification_action text;
```

Backfill existing workflows with the current hardcoded messages (so nothing changes for existing users):
```sql
UPDATE category_status_flows SET notify_buyer = true, notification_title = '✅ Order Accepted!', ...
WHERE status_key = 'accepted';
-- (repeat for all 17 existing statuses)
```

### 2. Replace `fn_enqueue_order_status_notification()` with workflow-driven version

New trigger logic:
1. Skip if `OLD.status = NEW.status`
2. Look up the workflow step from `category_status_flows` matching the order's `parent_group + transaction_type + status_key`
3. If `notify_buyer = true` and `notification_title` is not null, insert into `notification_queue`
4. Use `{seller_name}` placeholder substitution in title/body
5. Fallback to `parent_group = 'default'` if no specific workflow found
6. If no matching step or `notify_buyer = false`, skip silently

This completely eliminates hardcoded status notification mapping.

### 3. Update Admin Workflow Editor UI

In `AdminWorkflowManager.tsx`, add to each step's editor card:
- **Notify Buyer** toggle (checkbox)
- **Notification Title** input (shown when toggle is on)
- **Notification Body** input
- **Notification Action** input (e.g., "Rate order", "Open order")

These fields are saved alongside existing step data in the `saveWorkflow()` function.

### 4. Update FlowStep type

In `src/components/admin/workflow/types.ts`, add:
```typescript
notify_buyer: boolean;
notification_title: string;
notification_body: string;
notification_action: string;
```

### 5. Update data loading in WorkflowSimulator and hook

Add the new columns to all `select()` calls on `category_status_flows` in:
- `AdminWorkflowManager.tsx` (line 43)
- `WorkflowSimulator.tsx` (line 60)
- `useCategoryStatusFlow.ts` (line 44, 52)

### 6. Booking Reminders

The existing `send-booking-reminders` edge function already handles 1-hour-before reminders via cron. No changes needed — this is independent of the workflow notification system.

### Files Changed
- **Migration**: New columns + backfill + replace trigger function
- `src/components/admin/workflow/types.ts` — add 4 fields to FlowStep
- `src/components/admin/AdminWorkflowManager.tsx` — notification config UI per step
- `src/components/admin/workflow/WorkflowSimulator.tsx` — load new columns
- `src/hooks/useCategoryStatusFlow.ts` — load new columns

### What This Achieves
- Admins can configure per-step buyer notifications with custom title, body, and action
- No hardcoded status-to-notification mapping anywhere
- New workflows automatically get notifications when admin configures them
- Existing notifications preserved via backfill migration

