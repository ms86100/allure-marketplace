
Goal: prepare one patch-only ZIP with full-file SQL replacements so your local migration run can restart cleanly without touching live app behavior.

What I found
- The repo has 416 migration files, so the “89 remaining” number is not a reliable signal by itself because the run stops at the first failure.
- Your current blocker is still around `payment_settlements`:
  - the table is missing from the early migration history
  - later migrations create triggers and insert/delete against it
  - the settlement-trigger migration needs a full-file replacement, not another partial patch
- I also confirmed the earlier bootstrap-only problems are still present in the repo:
  - repeated `get_effective_society_features(...)` return-shape redefinitions
  - unsafe `cron.unschedule(...)`
  - duplicate FK additions on `warnings` / `reports`
  - references to missing `service_availability_schedules` / `service_slots`

ZIP contents
- Only changed SQL files, as requested.
- Each file will be a full replacement so you can overwrite locally without merging snippets.

Files I will include in the bundle
1. `20260130081941_fffa90cf-c93f-4958-90d0-479767f9722c.sql`
   - Backfill `payment_settlements` table so later settlement migrations have a real base object.
2. `20260222123058_abfa1818-1a58-4bb0-bffa-4ec2f9deb342.sql`
   - Make the first 7-column `get_effective_society_features` rewrite safe.
3. `20260222142119_994b325b-fbcb-48df-99a6-88bd4e7915b4.sql`
   - Same return-type conflict fix.
4. `20260225115817_195ef151-aa8a-4222-b6cc-331aa8ebe166.sql`
   - Same return-type conflict fix again.
5. `20260302181927_ccd77a4e-dd9c-4885-8ea3-23fe16e342b6.sql`
   - Guard `cron.unschedule('process-notification-queue')`.
6. `20260309183040_6f53fb4f-3ed8-43ae-9931-111af1f60348.sql`
   - Make warning/report foreign keys idempotent.
7. `20260309194058_6e60faa1-a3a7-4aac-82f8-382364d60842.sql`
   - Guard missing `service_availability_schedules` / `service_slots`.
8. `20260309194138_ca17f2ba-dcbc-418b-8100-4befacf34188.sql`
   - Guard duplicate cleanup/index creation for missing schedule table.
9. `20260311145232_4f901813-8b70-4d2a-b947-1eca07086f01.sql`
   - Full replacement of the settlement notification migration so the function and trigger are created safely together.
10. `20260318101405_e90d1c80-6aa6-418c-83b1-293c9f49a584.sql`
   - Guard the later cron cleanup.

How the settlement-trigger file will be fixed
- Not a partial tail edit.
- Full-file replacement.
- The trigger creation will be wrapped safely and executed dynamically only after the function definition is in place.
- This avoids the exact `enqueue_settlement_notification()` dependency failure you’re seeing.

Safety
- These changes are for migration bootstrap stability only.
- They do not change frontend code.
- They are designed to be safe for fresh local reset and safe to keep in version control.
- They avoid impacting the live application because they mainly:
  - backfill missing historical objects
  - add existence checks
  - make duplicate DDL idempotent

What happens after approval
1. Prepare the ZIP with only those changed SQL files.
2. Include a tiny README with exact overwrite instructions.
3. Give you one clean bundle to extract over `supabase/migrations/`.
4. Then your local flow becomes:
   ```text
   supabase stop
   supabase db reset
   ```
5. If anything else appears after that, it should be a new later-file blocker rather than the current known set.

Technical details
```text
Root issue class:
- migration history drift between live backend and local bootstrap

Confirmed drift examples:
- payment_settlements exists in later logic but has no early CREATE TABLE migration
- service_availability_schedules/service_slots are referenced but absent in local history
- get_effective_society_features is redefined multiple times with incompatible RETURN TABLE shape
- cron cleanup assumes jobs already exist

Reason your current error persisted:
- the repository copy of 20260311145232 still has a plain static trigger at the end
- your local edited version likely diverged, so the safest fix is a full-file replacement in the bundle
```
