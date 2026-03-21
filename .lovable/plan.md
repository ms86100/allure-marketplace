

# Full Audit Report — Button vs Workflow Consistency

## Methodology

Traced the complete chain for every active category:
1. `category_config.transaction_type` → the DB source of truth per category
2. `map_transaction_type_to_action_type()` DB trigger → sets `products.action_type` (the UI button)
3. `listing_type_workflow_map` → maps `transaction_type` to `workflow_key` (the backend workflow)
4. `category_status_flows` → defines actual workflow steps per `(parent_group, transaction_type)`

### Reference Mapping (Source of Truth)

| transaction_type | UI Button (action_type) | Expected Workflow Key |
|---|---|---|
| cart_purchase | Add to Cart | cart_purchase |
| buy_now | Buy Now | cart_purchase |
| book_slot | Book Now | service_booking |
| request_service | Request Service | request_service |
| request_quote | Request Quote | request_service |
| contact_only | Contact Seller | contact_enquiry |
| schedule_visit | Schedule Visit | service_booking |

All 7 mappings are correctly defined in:
- `map_transaction_type_to_action_type()` (DB trigger) — **CORRECT**
- `listing_type_workflow_map` (DB table) — **CORRECT**
- `TX_TO_ACTION` in `marketplace-constants.ts` — **CORRECT**
- `ACTION_CONFIG` in `marketplace-constants.ts` — **CORRECT**

---

## 1. Mismatches Found

### MISMATCH 1 — Domestic Help: `contact_only` but behavior flags say `has_date_range=true`

| Field | Value |
|---|---|
| Categories | Maid, Cook, Driver, Nanny |
| transaction_type | `contact_only` |
| UI Button | Contact Seller |
| Workflow | `contact_enquiry` |
| **Issue** | `has_date_range=true` + `enquiry_only=true` in behavior flags |

**Problem**: `getListingType()` returns `'rental'` (because `has_date_range` is checked first), but the `transaction_type` is `contact_only`. The `listingType` derived from behavior flags doesn't match the actual transaction workflow. If any code path uses `getListingType()` to resolve a workflow (e.g., `resolveTransactionType`), it could route to the wrong flow.

**Impact**: Medium — The DB trigger correctly sets `action_type = 'contact_seller'`, and the workflow map correctly maps `contact_only → contact_enquiry`. But behavior-derived `listingType='rental'` is misleading and could cause bugs in any code that trusts it over `transaction_type`.

**Risk**: Medium. The `has_date_range=true` flag is likely there because domestic help is hired for periods, but it conflicts with the `contact_only` transaction model.

### MISMATCH 2 — Daycare: `contact_only` but similar to other education categories

| Field | Value |
|---|---|
| Category | Daycare |
| transaction_type | `contact_only` |
| UI Button | Contact Seller |
| Workflow | `contact_enquiry` |
| Sibling categories | Tuition, Coaching, Yoga, etc. → all `book_slot` |
| **Issue** | `has_date_range=true` + `enquiry_only=true` flags, same as domestic help |

**Problem**: Same `getListingType() → 'rental'` mismatch as Domestic Help. Also, Daycare sits in `education_learning` where every other category is `book_slot`. If this is intentional (daycare requires contact first), it's fine — but the behavior flags are inconsistent.

**Impact**: Low-Medium. UI button is correctly "Contact Seller". The inconsistency is in behavior flags, not the button-to-workflow chain.

### MISMATCH 3 — Catering & Decoration: `request_quote` but `has_date_range=true`

| Field | Value |
|---|---|
| Categories | Catering, Decoration |
| transaction_type | `request_quote` |
| UI Button | Request Quote |
| Workflow | `request_service` |
| **Issue** | `has_date_range=true` + `enquiry_only=true` + `is_negotiable=true` |

**Problem**: `getListingType()` returns `'rental'` (date_range checked first), but the workflow is `request_service`. These categories are event services, not rentals. The behavior flags are overloaded.

**Impact**: Medium. Same class of bug — behavior-derived listingType doesn't match transaction_type. The actual button and workflow chain is correct.

---

## 2. Missing or Unmapped Cases

### MISSING WORKFLOW 1 — No parent_group-specific flows for: `domestic_help`, `real_estate`, `rentals`, `shopping`

| Parent Group | Has Custom Flows | Falls Back To |
|---|---|---|
| domestic_help | `service_booking` only | `default` for `contact_enquiry` |
| real_estate | None | `default` for all workflows |
| rentals | None | `default` for all workflows |
| shopping | None | `default` for all workflows |

**Status**: This is actually **correct behavior** — the `default` parent_group flows serve as fallback. No action needed unless custom step labels are desired per group.

### MISSING WORKFLOW 2 — `education_learning` has `request_service` flow but no categories use it

The `education_learning` parent_group has flows defined for `service_booking` AND `request_service`. But zero categories in `education_learning` have `transaction_type = 'request_service'`. The only non-`book_slot` category is Daycare (`contact_only`).

**Impact**: Low. Orphan flow definition — not harmful, just dead config.

### MISSING WORKFLOW 3 — `events` only has `service_booking` flow

Events parent_group only defines `service_booking` flows. But Catering and Decoration use `request_quote` → workflow `request_service`. They fall back to the `default` parent_group's `request_service` flow.

**Impact**: Low. Works correctly via fallback. But if events needs custom step labels for quote workflows, a dedicated flow would need to be added.

---

## 3. Inconsistency Issues

### INCONSISTENCY 1 — `getListingType()` vs `transaction_type` divergence

6 categories have behavior flags that produce a different `listingType` than what their `transaction_type` implies:

| Category | transaction_type | Expected listingType | Actual getListingType() |
|---|---|---|---|
| Maid | contact_only | contact | rental (has_date_range) |
| Cook | contact_only | contact | rental |
| Driver | contact_only | contact | rental |
| Nanny | contact_only | contact | rental |
| Daycare | contact_only | contact | rental |
| Catering | request_quote | service | rental |
| Decoration | request_quote | service | rental |

**Root cause**: `has_date_range=true` takes priority in `getListingType()`. These categories set it because they involve time periods, but they're not rental businesses.

**Fix needed**: Either (a) remove `has_date_range` from these categories, or (b) make `getListingType()` defer to `transaction_type` when it exists, or (c) add a listing_type column to `category_config` as explicit override.

### INCONSISTENCY 2 — `domestic_help` parent_group has `service_booking` flow but all categories are `contact_only`

All 4 domestic help categories (Maid, Cook, Driver, Nanny) use `contact_only → contact_enquiry`. But the only custom flow defined for `domestic_help` is `service_booking`. This custom flow is unreachable by any category in the group.

**Impact**: Low. Dead config. The `contact_enquiry` workflow correctly falls back to `default`.

---

## 4. Risk Assessment

### HIGH RISK
None found. All button → workflow mappings are correctly chained through:
- `category_config.transaction_type` → `map_transaction_type_to_action_type()` → `products.action_type` → UI button
- `category_config.transaction_type` → `listing_type_workflow_map` → workflow engine

### MEDIUM RISK
- **Behavior flag divergence** (7 categories): `getListingType()` returns `'rental'` for categories that are `contact_only` or `request_quote`. Any code path that uses `getListingType()` instead of `transaction_type` to resolve workflows could route incorrectly. Most critical in `resolveTransactionType()` which checks `listingType === 'contact_only'` but receives `'rental'`.

### LOW RISK
- Orphan workflow definitions (domestic_help has service_booking, education_learning has request_service) — no harm, just unused config
- Events group missing dedicated request_service flow — works via default fallback

---

## 5. Recommended Fixes

### Fix 1 (Medium priority) — Align behavior flags with transaction_type

For Maid, Cook, Driver, Nanny, Daycare: set `has_date_range = false`. These are contact-only categories. The "date range" concept doesn't apply to their transaction model.

For Catering, Decoration: set `has_date_range = false`. These are quote-based event services, not date-range rentals.

This eliminates the `getListingType() → 'rental'` divergence for all 7 categories.

### Fix 2 (Low priority) — Clean up orphan flows

Delete unused workflow definitions:
- `domestic_help / service_booking` (all categories are contact_only)
- `education_learning / request_service` (no categories use it)

Or keep them for future use — no harm either way.

### Fix 3 (Optional) — Add explicit `listing_type` override to category_config

Instead of deriving listing_type from behavior flags, store it directly. This makes the system fully DB-driven and eliminates the behavior-flag derivation layer as a potential source of inconsistency.

---

## Summary

| Metric | Count |
|---|---|
| Total active categories | 48+ |
| Button → Workflow correctly mapped | **ALL** (via DB trigger + workflow map) |
| Behavior flag divergence | 7 categories (Medium risk) |
| Orphan workflow definitions | 2 (Low risk) |
| Missing custom flows (using fallback) | 4 parent groups (Acceptable) |
| Infinite loops or dead-end states | **0** (fixed in prior session) |
| Unmapped buttons | **0** |
| HIGH risk issues | **0** |

**Bottom line**: The primary button → workflow chain is **100% consistent**. The risk lies in the secondary derivation layer (`getListingType()` from behavior flags) which diverges for 7 categories. This should be fixed to prevent future bugs.

