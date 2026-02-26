

## Analysis: Will the plan cover all categories?

Yes. The proposed database trigger on `category_config` is **generic by design** — it fires on ANY row update to `category_config` where `transaction_type` changes, regardless of which category it is.

### How it works for every case

The trigger logic is:

```text
WHEN category_config.transaction_type changes (ANY row)
  → UPDATE products SET action_type = derive(new transaction_type)
    WHERE products.category = changed_category
```

Examples covered by the same single trigger:

| Category changed | From | To | Effect on existing products |
|---|---|---|---|
| yoga | book_slot | cart_purchase | All yoga products → "Add to Cart" |
| electrician | request_service | book_slot | All electrician products → "Book Now" |
| groceries | cart_purchase | buy_now | All grocery products → "Buy Now" |
| furniture | cart_purchase | contact_only | All furniture products → "Contact Seller" |

### What the trigger propagates

The `action_type` derivation already exists in `trg_sync_product_action_type` (fires on product insert/update). The new trigger reuses the same mapping logic but applies it in bulk when the **category** changes, not the product.

### Existing safety net

The `validate_category_rule_change` trigger already blocks changes if:
- Active cart items exist for that category (when disabling cart support)
- Products have no price (when enabling `requires_price`)

This protection applies to **every** category equally.

### Implementation plan (unchanged, already covers all categories)

1. **One AFTER UPDATE trigger on `category_config`** — bulk-updates `products.action_type` for all products matching the changed category's slug. Single trigger, works for all 40+ categories.

2. **Admin confirmation dialog** — queries `SELECT COUNT(*) FROM products WHERE category = :slug` to show impact count. Works generically for any category.

3. **Existing orders remain untouched** — universal rule, no category-specific logic needed.

No additional work is needed beyond the original plan to support every category.

