

# Attribute Blocks E2E Test Suite (Real DB + Cleanup)

## Overview

A new test file `src/test/attribute-blocks-e2e.test.ts` that follows the exact same pattern as the existing `admin-seller-buyer-e2e.test.ts`: real authenticated clients, real database operations, deterministic cleanup of all created rows.

## File to Create

| File | Action |
|------|--------|
| `src/test/attribute-blocks-e2e.test.ts` | Create |

## Test Structure

### Setup (beforeAll)
- Authenticate as admin, seller, buyer using `createAuthenticatedClient`
- Call `ensureTestUsersSeeded()` to get society IDs
- **Pre-cleanup**: delete any leftover attribute blocks, form configs, products, and category rows from previous failed runs (match by `testSlug` prefix pattern)

### Cleanup (afterAll)
- Delete in reverse FK order: products, seller form configs, attribute blocks, subcategories, categories
- Uses admin client (has full permissions)

### Phase 1 — Admin: Attribute Block CRUD
```
1.1  Admin creates a test category (e.g. testSlug("integ_artisan"))
1.2  Admin creates attribute block A with schema fields, attaches to test category via category_hints
1.3  Admin creates attribute block B attached to same category
1.4  Verify: query attribute_block_library filtered by category_hints → returns both blocks
1.5  RLS: seller CANNOT insert into attribute_block_library → expect error
1.6  RLS: buyer CANNOT insert into attribute_block_library → expect error
```

### Phase 2 — Dynamic Category Re-linking
```
2.1  Admin creates a second test category
2.2  Admin updates block A's category_hints to include BOTH categories
2.3  Verify: querying blocks for category 2 returns block A
2.4  Admin removes category 1 from block A's hints (update to only category 2)
2.5  Verify: querying blocks for category 1 no longer returns block A
2.6  Admin restores block A to category 1 (for later phases)
```

This phase directly proves new categories get attributes without code changes.

### Phase 3 — Seller: Product with Attribute Data
```
3.1  Seller creates a seller profile under the test category
3.2  Seller reads attribute_block_library filtered by category → gets blocks A and B
3.3  Seller creates a product with specifications: { blocks: [{ type: blockA.block_type, data: { field: "value" } }, { type: blockB.block_type, data: { field: "value2" } }] }
3.4  Verify: product row's specifications JSONB contains correct structure
3.5  Seller updates the attribute data on their product
3.6  Verify: updated data persisted correctly
```

### Phase 4 — Admin Approval
```
4.1  Admin approves the seller profile (status → approved)
4.2  Admin approves the product (status → approved)
4.3  Admin reads product specifications and verifies data integrity
```

### Phase 5 — Buyer: Read Product Attributes
```
5.1  Buyer queries the approved product
5.2  Buyer sees specifications.blocks with correct structure and data
5.3  Validate each block type in specifications matches an active block in attribute_block_library
5.4  Cross-reference: block's category_hints includes the product's category
```

### Phase 6 — Edge Cases & Regression
```
6.1  Admin deactivates block B (is_active = false) → product specifications unchanged
6.2  Buyer re-reads product → specifications still contain block B data (graceful degradation)
6.3  Seller creates product with empty blocks array → specifications stored correctly
6.4  Admin saves a seller_form_config for the test category with ordered blocks
6.5  Verify: seller_form_config query returns correct block ordering
6.6  RLS: seller CANNOT update attribute_block_library → expect error
6.7  Admin re-activates block B (restore for cleanup)
```

### Phase 7 — Cleanup (afterAll)
Delete in this order:
1. Products (by cleanup.productId, cleanup.emptyProductId)
2. Seller profiles (by cleanup.sellerProfileId)
3. Seller form configs (by cleanup.formConfigId)
4. Attribute blocks (by cleanup.blockAId, cleanup.blockBId)
5. Subcategories (if any)
6. Categories (by cleanup.categoryId, cleanup.category2Id)

### Technical Details

- All IDs stored in a `cleanup` object, identical to the existing E2E test pattern
- Dynamic slugs via `testSlug("integ_attr_...")` to avoid collisions between parallel runs
- Pre-cleanup in `beforeAll` queries for rows matching the test prefix and deletes them
- Timeout: `beforeAll` 30s, `afterAll` 15s (matching existing convention)
- Attribute block schema uses the standard `{ fields: [{ key, label, type }] }` format
- Product specifications follow `{ blocks: [{ type: string, data: Record<string, any> }] }`

