

# Bulletproof Fix: Dispute Category Constraint + Full System Audit

## ROOT CAUSE — CASE D (Mixed Inconsistency)

The `dispute_tickets` table has a CHECK constraint allowing:
```
quality, delivery, payment, behaviour, other
```

The frontend defaults (in `useMarketplaceLabels.ts`) send:
```
noise, parking, pet, maintenance, other
```

**Only `other` works. Every other category insert will fail.**

The `dispute_categories_json` system setting does NOT exist in the DB, so the app always uses the hardcoded DEFAULTS which don't match the DB constraint.

---

## NOTIFICATION SYSTEM AUDIT RESULTS

| Check | Status | Evidence |
|-------|--------|----------|
| Infinite loop fix | ✅ PASS | Edge function now marks as failed when Firebase missing |
| Queue state | ✅ PASS | All 77 records are `failed` with clear error message |
| No stuck records | ✅ PASS | Zero records in `processing` or `pending` |
| In-app fallback | ⚠️ PARTIAL | Code handles it for NEW items, but 77 legacy items were not retried for in-app |
| Credential handling | ✅ PASS | Logs show graceful error, no crash |

**Verdict: Notification system is stable. No infinite loops. Push delivery requires Firebase config.**

---

## FIX PLAN

### Step 1: Align DB constraint with frontend categories (Migration)

Drop the old constraint and add one that matches the actual UI categories plus the legacy ones:

```sql
ALTER TABLE public.dispute_tickets
DROP CONSTRAINT dispute_tickets_category_check;

ALTER TABLE public.dispute_tickets
ADD CONSTRAINT dispute_tickets_category_check
CHECK (category IN (
  'quality', 'delivery', 'payment', 'behaviour', 'other',
  'noise', 'parking', 'pet', 'maintenance'
));
```

### Step 2: Seed `dispute_categories_json` into system_settings

Insert the default categories JSON into the DB so the UI is DB-driven, not fallback-driven:

```sql
INSERT INTO system_settings (key, value)
VALUES ('dispute_categories_json', 
  '[{"value":"noise","label":"Noise"},{"value":"parking","label":"Parking"},{"value":"pet","label":"Pet Related"},{"value":"maintenance","label":"Maintenance"},{"value":"quality","label":"Quality Issue"},{"value":"delivery","label":"Delivery Issue"},{"value":"payment","label":"Payment Issue"},{"value":"behaviour","label":"Behaviour"},{"value":"other","label":"Other"}]'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Step 3: Tighten frontend validation

Update `disputeSchema` in `validation-schemas.ts` to validate category against a known list instead of just `z.string().min(1)`.

### Step 4: Add `is_anonymous` column if missing

The `CreateDisputeSheet` sends `is_anonymous` but the `dispute_tickets` schema shows no such column. Need to verify and add if missing.

---

## DISPUTE SYSTEM AUDIT

| Check | Status | Evidence |
|-------|--------|----------|
| `dispute_tickets` table | ✅ EXISTS | Full schema verified |
| `disputes` table | ✅ EXISTS | Separate table with RLS |
| RLS on `dispute_tickets` | ✅ PASS | 3 policies (create, view, update) |
| RLS on `disputes` | ✅ PASS | 6 policies (buyer/seller/admin) |
| `sla_deadline` column | ✅ EXISTS | On `dispute_tickets` |
| Category constraint | ❌ FAIL | Mismatch with frontend |
| `is_anonymous` column | ⚠️ UNVERIFIED | Not visible in schema query |

---

## EDGE FUNCTION AUDIT

| Function | Status | Issue |
|----------|--------|-------|
| `process-notification-queue` | ✅ Stable | Fails gracefully without Firebase |
| `monitor-stalled-deliveries` | ⚠️ Permission fix applied | Needs verification |

---

## HARDCODING DETECTION

| Item | Hardcoded? | Fix |
|------|-----------|-----|
| Dispute categories | YES (fallback defaults) | Seed DB, make DB authoritative |
| Low stock threshold | ✅ Fixed (uses `low_stock_threshold \|\| 5`) | — |
| Notification states | ✅ No hardcoding | — |

---

## FILES TO MODIFY

1. **New migration**: Drop+recreate category constraint, seed `dispute_categories_json`, verify `is_anonymous` column
2. **`src/lib/validation-schemas.ts`**: Add enum validation for dispute category
3. No other file changes needed — UI already reads from `disputeCategories()` which will now be DB-backed

## PRODUCTION RISK CLASSIFICATION

- **P0**: Category constraint mismatch — **blocks all dispute creation except "other"**
- **P1**: Missing `dispute_categories_json` in DB — forces fallback to hardcoded defaults
- **P1**: 77 legacy notifications never delivered in-app

