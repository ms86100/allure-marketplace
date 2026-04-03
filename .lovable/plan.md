

# Fix AI Auto-Review: Add Cron Trigger

## Problem
The `ai-auto-review` edge function is fully built but never invoked automatically. Products stay `pending` indefinitely.

## Fix
Schedule a `pg_cron` job to invoke the function every 2 minutes using `pg_net`. This follows the project's existing pattern (used by `process-notification-queue`, `monitor-stalled-deliveries`).

**Important**: Per project conventions, cron scheduling SQL contains project-specific secrets and must use the **insert tool** (not migration tool).

```sql
select cron.schedule(
  'ai-auto-review-every-2m',
  '*/2 * * * *',
  $$
  select net.http_post(
    url:='https://ywhlqsgvbkvcvqlsniad.supabase.co/functions/v1/ai-auto-review',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3aGxxc2d2Ymt2Y3ZxbHNuaWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTY1NDEsImV4cCI6MjA4ODM3MjU0MX0.uBtwDdGBgdb3KRYPptfBV1plydCnnRq1KNLH5xVlkjI"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) as request_id;
  $$
);
```

## No Code Changes
The edge function, logging, deduplication, and status updates are all already correct.

## Post-Deploy Validation
1. Submit a test product as a seller
2. Wait ~2 minutes
3. Check `ai_review_log` for the new entry
4. Verify product status changed from `pending` to `approved`/`rejected`/`flagged`

