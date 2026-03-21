

## Plan: Fix Search Engine — Critical Bugs & 10 Key Improvements

### Root Cause Analysis

The network logs reveal the smoking gun:

```
GET /seller_profiles?is_approved=eq.true → 400
"column seller_profiles.is_approved does not exist"
```

**Bug 1 (P0 — Stores never appear in search):** `SearchAutocomplete.tsx` line 82 queries `seller_profiles` with `.eq('is_approved', true)`, but the column is `verification_status` (enum: `approved`). Every seller search silently fails with a 400 error, returning empty results. This is why "Fresh Mart Express" returns nothing.

**Bug 2 (P1 — Product search misses approval filter):** `SearchAutocomplete.tsx` line 62-67 queries products without filtering by `approval_status = 'approved'`, potentially showing unapproved/draft products.

**Bug 3 (P1 — Product search doesn't search tags/bullet_features):** The `products` table has `tags` and `bullet_features` columns, but the OR conditions only search `name`, `description`, `brand`, `ingredients`. Seller-defined attributes are invisible to search.

**Bug 4 (P2 — CategoryGroupPage search is local-only):** The search bar on category pages (line 145-149) only does client-side `name`/`description` filtering on already-loaded products. It cannot find stores or products not in the current dataset.

### Surgical Fix Plan

---

#### Fix 1: Repair seller search query (P0 — CRITICAL)

**File:** `src/components/search/SearchAutocomplete.tsx`

**Change:** Line 82 — replace `.eq('is_approved', true)` with `.eq('verification_status', 'approved')`

**Impact:** Stores will immediately appear in autocomplete results. No other files affected — this is the only place `is_approved` is used on `seller_profiles`.

**Risks:**
- Risk 1: If `verification_status` has other valid values (e.g., `verified`), some sellers may still be excluded → Mitigated: DB confirms only `approved` sellers should be searchable
- Risk 2: Suddenly showing sellers that were silently hidden could expose incomplete seller profiles → Mitigated: The query already selects only display-safe fields

---

#### Fix 2: Add approval_status filter to product search (P1)

**File:** `src/components/search/SearchAutocomplete.tsx`

**Change:** Add `.eq('approval_status', 'approved')` to the product query chain (after `.eq('is_available', true)`)

**Impact:** Prevents unapproved/draft products from leaking into search results.

**Risks:**
- Risk 1: Products without `approval_status` set could disappear → Mitigated: check DB for null values first
- Risk 2: None significant

---

#### Fix 3: Expand product search to include tags & bullet_features (P1)

**File:** `src/components/search/SearchAutocomplete.tsx`

**Change:** Extend the `orConditions` string to include `tags::text.ilike.%${trimmed}%,bullet_features::text.ilike.%${trimmed}%`

**Impact:** Users can now find products by seller-defined attributes (portion size, dietary tags, etc.). This makes search attribute-aware.

**Risks:**
- Risk 1: `tags` and `bullet_features` are array/jsonb types — need `::text` cast for ilike → Confirmed approach works with PostgREST
- Risk 2: Slightly broader results could feel noisy → Mitigated: limit remains at 8

---

#### Fix 4: Remove hardcoded 'Seller' fallback in product onSelect (P2)

**File:** `src/components/search/SearchAutocomplete.tsx`

**Change:** Line 188 — change `seller_name: 'Seller'` to `seller_name: ''` (per no-dummy-data policy)

---

#### Fix 5: Make CategoryGroupPage search query-aware with autocomplete (P2)

**File:** `src/pages/CategoryGroupPage.tsx`

**Change:** Import and add `SearchAutocomplete` below the search input (line 228), wrapping the input in a `relative` div. This gives category pages the same store/product/category discovery as the main search page.

**Impact:** Searching "Fresh Mart Express" on the Food & Beverages page will now show the store in autocomplete, rather than just client-filtering products.

**Risks:**
- Risk 1: Autocomplete z-index could conflict with sticky header → Mitigated: autocomplete already uses `z-50`
- Risk 2: Two search behaviors (autocomplete + local filter) could confuse users → Mitigated: autocomplete shows on type, local filter applies to grid below — complementary behaviors

---

### Summary of Changes

| File | Change | Severity |
|---|---|---|
| `SearchAutocomplete.tsx` | Fix `is_approved` → `verification_status = approved` | P0 |
| `SearchAutocomplete.tsx` | Add `approval_status = approved` to product query | P1 |
| `SearchAutocomplete.tsx` | Add `tags::text`, `bullet_features::text` to OR conditions | P1 |
| `SearchAutocomplete.tsx` | Remove hardcoded 'Seller' fallback | P2 |
| `CategoryGroupPage.tsx` | Add `SearchAutocomplete` to category search bar | P2 |

All fixes are surgical — no new features, no refactoring, no schema changes. Total: ~15 lines changed across 2 files.

