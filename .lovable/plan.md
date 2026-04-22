

## Fix: "Product saved but service settings failed" + missing upfront validation

### Problem

The Add Product flow has 4 stepper steps (Basic, Pricing, Variants, Images). Submission succeeds in inserting the product row, then a **second** insert into `service_settings` (or `rental_settings` / `experience_settings`) runs. If the second insert fails, the user sees "Product saved but service settings failed. Please try editing again" — leaving an orphaned product and a confusing dead-end.

Two compounding issues:

1. **Non-atomic save**: product insert and service-settings insert are separate calls with no rollback.
2. **No per-step validation gate**: the stepper lets the user click Next without filling mandatory fields (image, duration, location, price, etc.), so failures only surface at final submit — sometimes after the product row is already created.

### Root cause (verified)

- `useSellerProducts.ts` → `saveProduct()` runs `insert(product)` first, then conditionally inserts into `service_settings` based on `service_type`. The second insert is wrapped in a separate try/catch that emits the toast text "Product saved but service settings failed."
- `SellerProductFormPage.tsx` stepper (`Basic → Pricing → Variants → Images`) does NOT validate the current step before advancing — `Next` is unconditionally enabled.
- `ServiceFieldsSection` collects required fields (duration, location, service_type) but the form doesn't check they're populated before submit.
- `validation-schemas.ts` has zod schemas for other forms but **none for product creation**.

### The fix

**1. Add a zod schema for product creation** (`src/lib/validation-schemas.ts`)

One schema with discriminated union per `product_kind` (physical / service / rental / experience) covering:
- Basic: name, category (must be in `allowedCategories`), description min length
- Pricing: price > 0, stock ≥ 0 (physical), duration_minutes (service/experience), rental period (rental)
- Images: at least 1 image required
- Service-specific: location_type, service_type, duration, buffer, max_bookings — all required when `product_kind = 'service'`

**2. Per-step validation gate** (`src/pages/SellerProductFormPage.tsx`)

- Define `STEP_FIELDS: Record<StepId, string[]>` mapping each step to the fields it owns.
- On `Next` click, run `productSchema.pick(STEP_FIELDS[currentStep]).safeParse(formData)`.
- If invalid: set `stepErrors` state, render inline `<FormMessage>` under each field, block advance, scroll to first error.
- Disable `Next` button visually only when known-required fields are empty (live feedback).
- On final `Submit`, run the full schema. If any step has errors, jump back to the **earliest** failing step and highlight.

**3. Atomic save via Postgres RPC** (new migration + hook update)

- New SQL function `create_product_with_settings(p_product jsonb, p_settings jsonb, p_kind text)` that:
  - Inserts into `products`
  - Inserts into the matching settings table (`service_settings` / `rental_settings` / `experience_settings`) inside the same transaction
  - Returns the new product row
  - On any error, the transaction rolls back — no orphaned product
- `useSellerProducts.saveProduct()` calls the RPC instead of two sequential inserts.
- For edits, use a sibling `update_product_with_settings` RPC with the same atomicity.

**4. Better error surfacing**

- Replace the misleading "Product saved but service settings failed" toast with field-level errors returned from the RPC (e.g. `{ field: 'duration_minutes', message: 'Duration is required' }`).
- Toast only on truly unexpected failures; field errors render inline.

### Files touched

- `src/lib/validation-schemas.ts` — add `productSchema` + `STEP_FIELDS` map (~80 lines).
- `src/pages/SellerProductFormPage.tsx` — wire per-step validation, error state, scroll-to-error, jump-back-on-submit (~50 lines changed).
- `src/components/seller/ServiceFieldsSection.tsx` — accept `errors` prop, render `<FormMessage>` under each field (~30 lines).
- `src/components/seller/BasicFieldsSection.tsx`, `PricingFieldsSection.tsx`, `ImagesSection.tsx` — same `errors` prop pattern.
- `src/hooks/useSellerProducts.ts` — replace dual insert with single RPC call; map RPC errors to field errors (~30 lines).
- New migration: `create_product_with_settings` + `update_product_with_settings` SQL functions (`SECURITY DEFINER`, with seller-ownership check matching existing RLS).

### Verification

1. Try `Next` from Basic with empty name → blocked, inline error under Name.
2. Try `Submit` from Images with no images → blocked, inline error, stepper jumps to Images step.
3. Service product with missing `duration_minutes` → blocked at Pricing step, no DB write.
4. Force a settings-table conflict (e.g. simulated DB error) → product is NOT created (transaction rolled back), user sees a single clean error, can retry.
5. Existing products in `products` table count is unchanged after a forced failure (no orphans).
6. Successful submit creates exactly one row in `products` and one row in the matching settings table.

### Out of scope

- Redesigning the stepper UI / animations.
- Image upload pipeline changes (keep current uploader, just enforce ≥1 image at submit).
- Bulk upload — already validates against `allowedCategories`; will get the same schema in a follow-up if desired.
- RLS / trigger changes — existing `validate_product_seller_category` trigger stays as the server-side guarantee.

