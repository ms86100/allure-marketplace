

## Fix: Drop NOT NULL on `seller_settlements.society_id`

### Problem
The `seller_settlements.society_id` column has a NOT NULL constraint. Marketplace-only orders without a society will crash the settlement trigger.

### Migration (single statement)
```sql
ALTER TABLE seller_settlements ALTER COLUMN society_id DROP NOT NULL;
```

### Allure guidance (no code change here)
The correct Allure fix is to **remove** `at_gate` from `seller_delivery` flows/transitions — not add more transitions for it. The canonical `seller_delivery` chain is `placed → accepted → preparing → ready → picked_up → on_the_way → delivered → completed` with no `at_gate` step.

