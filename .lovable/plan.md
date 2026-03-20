

## Fix: 3 Critical Notification Pipeline Blockers

### Blocker 1: Stuck "processing" Recovery

**Current `claim_notification_queue`** only claims `pending` items. If the edge function crashes mid-batch, items stay `processing` forever.

**Fix:** Prepend a recovery sweep to `claim_notification_queue` that resets items stuck in `processing` for >3 minutes back to `pending`.

```sql
-- Add at start of claim_notification_queue
UPDATE public.notification_queue
SET status = 'pending', processed_at = NULL
WHERE status = 'processing'
  AND processed_at < now() - interval '3 minutes';
```

### Blocker 2: Remove `pg_sleep(0.5)` from Trigger

The sleep runs inside the transaction, delaying commit and adding latency without solving the race condition. `pg_net.http_post` already defers execution to after commit.

**Fix:** Recreate `trigger_process_notification_queue` without the `pg_sleep(0.5)` line.

### Blocker 3: Clean 78 Zombie "retrying" Items

78 items are stuck in a legacy `retrying` state that no code path processes. These are old items (pre-inline-retry refactor).

**Fix:** Mark them as `failed` with a cleanup note (they're too old to retry meaningfully):
```sql
UPDATE notification_queue SET status = 'failed', last_error = 'legacy_retrying_cleanup'
WHERE status = 'retrying';
```

### Implementation

**One database migration** for blockers 1 and 2 (schema changes — function replacements):
- Replace `claim_notification_queue` with stuck-processing recovery
- Replace `trigger_process_notification_queue` without sleep

**One data operation** (insert tool) for blocker 3:
- Update 78 zombie rows from `retrying` to `failed`

No edge function or client code changes needed.

