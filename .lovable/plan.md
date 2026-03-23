

# Fix: Add Actor-Awareness to Delivery Assignment Trigger

## Gap Identified

The current trigger checks `is_transit = true` but does **not** check the workflow step's `actor` field. This means an assignment could be created even when the actor is `delivery` only (platform rider scenario that slipped past the `delivery_handled_by` guard) or in future multi-stage workflows where different transit steps have different actors.

## Fix

Add an `actor` check to the existing `SELECT EXISTS` query on line 42-49. The assignment should only be created when the workflow step's actor includes `seller`:

```sql
SELECT EXISTS (
  SELECT 1 FROM category_status_flows
  WHERE status_key = NEW.status
    AND is_transit = true
    AND actor LIKE '%seller%'              -- ← NEW: actor must include seller
    AND transaction_type = COALESCE(NEW.transaction_type, 'seller_delivery')
    AND parent_group IN (COALESCE(_v_parent_group, 'default'), 'default')
    AND is_deprecated = false
) INTO _is_transit_step;
```

This ensures the trigger is fully workflow-driven on **both** `is_transit` and `actor`, matching the three guards:

| Guard | Source |
|-------|--------|
| `is_transit = true` | Workflow flag |
| `actor LIKE '%seller%'` | Workflow actor field |
| `delivery_handled_by != 'platform'` | Order-level field (already present at line 32) |

## Files to Modify

| File | Change |
|------|--------|
| New migration SQL | `CREATE OR REPLACE FUNCTION trg_create_seller_delivery_assignment()` — add `AND actor LIKE '%seller%'` to the `category_status_flows` lookup |

Single-line addition. No frontend changes needed.

## Risk

**Zero regression** — all existing workflows where `picked_up` has `is_transit=true` also have `actor` containing `seller`. The additional filter simply makes the trigger refuse to fire for hypothetical future steps where a non-seller actor handles transit.

