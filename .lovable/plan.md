

## DB-driven Notification & Communication Engine

### What exists today
- `notification_queue` (durable queue, retry, push tracking) + `process-notification-queue` cron every 1 min.
- `auto-cancel-orders` cron every 2 min — hard cancel, no soft nudges.
- `monitor-stalled-deliveries` cron every 5 min — one-shot stall flag.
- One-shot triggers (e.g. `trg_enqueue_new_order_notification`).
- No `notification_rules`, no `notification_templates`, no `notification_state_tracker`, no per-status reminder cron, no `status_changed_at` on orders.

### Architecture (what we are building)

```text
                +--------------------------+
   triggers --> | notification_rules (DB)  | <-- admin UI / seed
                +-----------+--------------+
                            |
   cron 1m      +-----------v--------------+   render via   +---------------------+
  (engine) ---> | notification-engine fn   | -------------> | notification_queue  |
                +-----------+--------------+   templates    +---------+-----------+
                            |                                         |
                writes to   v                                         v
                +--------------------------+              process-notification-queue
                | notification_state_tracker|             (existing) -> push/in-app
                +--------------------------+
```

Everything timing/wording lives in DB. Engine is a stateless evaluator.

### Database (single migration)

1. **`notification_templates`** — `id, key (unique), title_template, body_template, channel ('push'|'in_app'|'both'), tone ('info'|'warning'|'urgent'), variables jsonb, active`.
2. **`notification_rules`** — `id, key (unique), entity_type ('order'|'delivery'|'refund'|'dispute'|'support_ticket'), trigger_status text, delay_seconds int, repeat_interval_seconds int null, max_repeats int default 0, escalation_level smallint, target_actor ('buyer'|'seller'|'admin'), template_key text fk, payload_extra jsonb, active bool, priority smallint`.
3. **`notification_state_tracker`** — `id, entity_type, entity_id, rule_id, escalation_level, last_triggered_at, send_count, completed bool, dedupe_key text unique (entity_type|entity_id|rule_id|escalation_level)`. Indexes for (entity_type, entity_id) and (rule_id, completed).
4. **`notification_queue`** ALTER — add `rule_id uuid null`, `dedupe_key text null unique`, `escalation_level smallint default 0`, `last_sent_at timestamptz null`. (`retry_count`, `next_retry_at`, `status` already exist.)
5. **`orders`** ALTER — add `status_changed_at timestamptz default now()` + trigger `fn_orders_touch_status_changed_at` on `BEFORE UPDATE OF status` to refresh the timestamp. Backfill from `updated_at`.
6. **`fn_render_template(template_key, vars jsonb)`** — `{{variable}}` substitution, returns `(title, body)`.
7. **`fn_enqueue_from_rule(rule_id, entity_id, target_user_id, vars)`** — inserts into `notification_state_tracker` (upsert on dedupe_key) and `notification_queue` with rendered text + `escalation_level` + `priority`. Idempotent: if state row exists & not yet eligible, no-op.
8. **RLS** — admin-only write on rules/templates; service role full; readers as needed for admin dashboards.

### Seed data (rules + templates) — all DB, zero hardcoded

Order placed (target=seller, entity=order, trigger_status=`placed`):
- L1 `delay=120s` info "New order — please accept"
- L2 `delay=300s` warning "Order is waiting"
- L3 `delay=600s` urgent "Final reminder before cancellation"
- L4 `delay=1680s` urgent "⚠️ Order will auto-cancel in 2 minutes"

Order accepted but no progress (`accepted` → `preparing` not reached): nudges at 180s, 600s, 1200s.
Preparing not ready: at 600s, 1500s.
Ready not picked up: at 300s, 900s.
Delivery stalled (existing `monitor-stalled-deliveries` keeps GPS detection but emits via this engine): L1 soft 90s, L2 hard 180s + buyer reassurance template.
Buyer reassurance whenever a seller L2/L3 fires (paired rule, target=buyer).

Each row is editable in DB; nothing in code references a number.

### Edge functions

**New: `notification-engine`** (cron every 1 min)
- Loads active rules grouped by `(entity_type, trigger_status)`.
- For `entity_type='order'`: query orders matching each `trigger_status` whose `now() - status_changed_at >= delay_seconds`, joined left to `notification_state_tracker` on dedupe_key.
- For each match: call `fn_enqueue_from_rule(...)`. Handles repeats via `repeat_interval_seconds + send_count < max_repeats`.
- Writes audit row per cycle (`notification_engine_runs` lightweight log table; counts only).

**Modify: `auto-cancel-orders`**
- Before cancelling, ensure `notification_state_tracker` shows the L4 final-warning rule fired at least once and at least its `delay_seconds` ago. If not, skip cancel this cycle (engine will catch up next minute). This binds cancellation to nudge completion.
- Reads cancel grace from `system_settings` (new keys `auto_cancel_grace_online_seconds`, `auto_cancel_grace_urgent_seconds`) instead of hardcoded 30/3 min.

**Upgrade: `monitor-stalled-deliveries`**
- Stops emitting notifications directly; instead writes/refreshes a `delivery_assignments.stall_level` (0/1/2) field plus `status_changed_at`-equivalent. The engine picks up rules keyed on `entity_type='delivery'` + level transitions and emits seller + buyer messages.

**Existing `process-notification-queue`** — unchanged behavior; already honours `payload.target_role`/`status`/`priority`. Engine writes those fields.

### Frontend

**Admin (`/admin`) — new "Notification Rules" panel**
- Table of `notification_rules` with inline edit (delay, repeat, max, level, active toggle).
- Table of `notification_templates` with preview render against sample vars.
- Read-only "Engine activity" tile: last run, rules evaluated, notifications enqueued (from `notification_engine_runs`).
- Existing `NotificationDiagnostics` stays.

**Admin "Stuck orders" tile** — group orders by status with elapsed > rule L1 threshold, link to order, "Nudge now" button (calls `fn_enqueue_from_rule` for the next-level rule manually).

No changes to buyer/seller UI beyond what they already render from `user_notifications`/`notification_queue`. Tone/CTAs come from templates.

### Cron schedule additions
- `notification_engine_every_1m` → POST `notification-engine`.
- Keep existing crons; `auto-cancel-orders` becomes safer because it depends on engine state.

### Idempotency & safety
- `dedupe_key` unique index on `notification_queue` and `notification_state_tracker` blocks duplicates.
- Engine wraps each `fn_enqueue_from_rule` in `BEGIN/EXCEPTION WHEN unique_violation THEN CONTINUE`.
- Push retry already exponential in `process-notification-queue`.
- All wording from templates → no frontend timers, no hardcoded strings.

### Files

Migration:
- `supabase/migrations/<ts>_notification_engine.sql` — tables, ALTERs, functions, triggers, seeds, RLS.

Edge functions:
- `supabase/functions/notification-engine/index.ts` (new)
- `supabase/functions/auto-cancel-orders/index.ts` (modify: settings + state-tracker gate)
- `supabase/functions/monitor-stalled-deliveries/index.ts` (modify: write stall_level only)

Cron registration:
- Insert `cron.schedule('notification_engine_every_1m', …)` via insert tool (user-specific URL/key, not migration).

Frontend:
- `src/pages/admin/NotificationRulesPage.tsx` (new)
- `src/components/admin/NotificationRulesEditor.tsx` (new)
- `src/components/admin/NotificationTemplatesEditor.tsx` (new)
- `src/components/admin/StuckOrdersPanel.tsx` (new)
- `src/hooks/useNotificationRules.ts`, `useNotificationTemplates.ts`, `useStuckOrders.ts` (new)
- Add nav entry in existing admin shell.

### Verification

| Check | Expected |
|---|---|
| Place order, leave seller idle | Seller gets L1 @ 2m, L2 @ 5m, L3 @ 10m, L4 @ 28m, cancel @ 30m — all from `notification_rules` row values |
| Edit L2 delay to 60s in admin UI | Next placed order respects 60s without redeploy |
| Disable a template via `active=false` | Engine skips that rule next cycle |
| Run engine twice in same minute | No duplicate queue rows (dedupe_key) |
| Cancel cron runs but L4 never fired (engine paused) | Order is NOT cancelled |
| Delivery GPS pauses 2 min | Engine emits seller hard nudge + buyer reassurance |

### Out of scope
- SMS/email channels (templates support `channel='sms'|'email'` but no sender wired here).
- ML scoring of seller responsiveness (column reserved; populated by future job).
- Buyer/seller UI redesign beyond template-driven copy.

