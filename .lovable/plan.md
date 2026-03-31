

# 5 Critical Silent Seller Bugs — Pre-Production Audit (Configuration & CRUD Parity)

## Bug 1: SellerProductsPage Missing Service Configuration Section

**What**: `SellerProductsPage.tsx` renders zero service-related UI — no `ServiceFieldsSection`, no `InlineAvailabilitySchedule`. The hook (`useSellerProducts.ts`) correctly exposes `isCurrentCategoryService`, `serviceFields`, and `setServiceFields`, and `handleSave` correctly upserts to `service_listings`. But the page never renders the inputs. A seller editing a service product from the Products page sees only basic product fields — duration, booking limits, cancellation policy, and availability schedule are all invisible.

**Where**: `SellerProductsPage.tsx` lines 50-72 — the dialog content renders image, name, price, category, toggles, attribute blocks — but no service section.

**Why critical**: The onboarding flow (`DraftProductManager.tsx` line 621-648) shows the full service configuration. Post-onboarding, when a seller edits a service product, they can't see or modify service settings. Worse, `handleSave` still upserts service_listings with whatever `serviceFields` state was last set (the initial defaults) — potentially overwriting correct service config with defaults.

**Gap**: Onboarding has `ServiceFieldsSection` + `InlineAvailabilitySchedule`. Products page has neither. Same hook, different surfaces.

**Impact analysis**:
- `SellerProductsPage.tsx` — add `ServiceFieldsSection` and schedule display when `sp.isCurrentCategoryService` is true
- Import `ServiceFieldsSection` and render between attribute blocks and the "Available for order" toggle

**Risks**:
1. The `InlineAvailabilitySchedule` component uses its own state — the products page hook doesn't manage schedule state. For now, only add `ServiceFieldsSection` (which the hook already manages). Schedule editing can be deferred to the dedicated availability manager.
2. Adding the section increases dialog height — acceptable as it's conditional on service category.

**Fix**: In `SellerProductsPage.tsx`, after the `AttributeBlockBuilder` (line 70), add:
```tsx
{sp.isCurrentCategoryService && (
  <ServiceFieldsSection data={sp.serviceFields} onChange={sp.setServiceFields} />
)}
```
Import `ServiceFieldsSection` from `@/components/seller/ServiceFieldsSection`.

---

## Bug 2: SellerProductsPage Missing Action Type Selector

**What**: `SellerProductsPage.tsx` has no UI to select `action_type` (add_to_cart, contact_seller, request_quote, make_offer). The form always submits whatever `formData.action_type` was loaded from the product or its default (`add_to_cart`). If a seller wants to change a product from "Add to Cart" to "Contact Seller" (or vice versa), there's no way to do it from the Products page. The validation checks `action_type === 'contact_seller'` for phone requirements, but the seller can never reach that state through the UI.

**Where**: `SellerProductsPage.tsx` — entire dialog, no `action_type` select rendered.

**Why critical**: Categories that support enquiry-only products (e.g., services, custom goods) need the seller to set the correct action type. Without this, all products default to `add_to_cart`, and category-specific behaviors (contact_seller, request_quote) are unreachable post-onboarding. The `DraftProductManager` also doesn't expose this — so it's missing from BOTH flows.

**Impact analysis**:
- `SellerProductsPage.tsx` — add a Select for `action_type` when the category config supports multiple action types
- `useSellerProducts.ts` — already handles `action_type` in `formData` and validation; no changes needed

**Risks**:
1. Showing action_type for all categories adds noise — gate it behind `activeCategoryConfig.behavior.enquiryOnly` or categories that support non-cart actions.
2. Changing action_type to `contact_seller` triggers phone validation — the auto-fill from user profile (already implemented) handles this.

**Fix**: In `SellerProductsPage.tsx`, after the category selector (line 61), add:
```tsx
{sp.activeCategoryConfig && !sp.activeCategoryConfig.behavior.supportsCart && (
  <div className="space-y-2">
    <Label>Action Type</Label>
    <Select value={sp.formData.action_type} onValueChange={(v) => sp.setFormData({ ...sp.formData, action_type: v as ProductActionType })}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="contact_seller">Contact Seller</SelectItem>
        <SelectItem value="request_quote">Request Quote</SelectItem>
        <SelectItem value="make_offer">Make Offer</SelectItem>
      </SelectContent>
    </Select>
  </div>
)}
```
Also add a contact_phone input when `action_type === 'contact_seller'`.

---

## Bug 3: Category Change Doesn't Reset Attribute Blocks on Either Surface

**What**: On `SellerProductsPage.tsx` line 61, changing the category updates `formData.category` but does NOT reset `attributeBlocks`. The `AttributeBlockBuilder` component (line 70) receives the new category and filters its library list, but the `value` prop still contains blocks from the OLD category. This means:
- Old category blocks remain in the form with stale data
- The save payload includes blocks that don't belong to the new category
- The `specifications` field in DB gets polluted with cross-category attributes

Same issue in `DraftProductManager.tsx` line 554 — category change doesn't reset `attributeBlocks`.

**Where**: `SellerProductsPage.tsx` line 61 (category onValueChange), `DraftProductManager.tsx` line 554.

**Why critical**: A seller creates a food product with nutrition blocks, then changes category to "services". The nutrition blocks silently persist in the form and get saved to the DB. Buyers see irrelevant attribute sections on the product detail page.

**Impact analysis**:
- `SellerProductsPage.tsx` — reset attribute blocks when category changes
- `DraftProductManager.tsx` — same reset on category change
- `useSellerProducts.ts` — no change needed (blocks are managed as component state)

**Risks**:
1. Resetting blocks on category change discards user-entered data — mitigate with a toast warning: "Category changed — extra details have been reset".
2. If the new category has its own default blocks, they should be auto-populated after reset.

**Fix**: In `SellerProductsPage.tsx` line 61, change category onValueChange:
```tsx
onValueChange={(value) => {
  sp.setFormData({ ...sp.formData, category: value as ProductCategory, subcategory_id: '' });
  sp.setAttributeBlocks([]); // Reset blocks for new category
}}
```
In `DraftProductManager.tsx` line 554, same pattern:
```tsx
onChange={(e) => {
  setNewProduct({ ...newProduct, category: e.target.value });
  setAttributeBlocks([]); // Reset blocks for new category
}}
```

---

## Bug 4: Onboarding Edit Doesn't Load Availability Schedule from DB

**What**: `DraftProductManager.tsx` `handleEditProduct` (line 315-364) loads service fields from `service_listings` but does NOT load `service_availability_schedules`. The `availabilitySchedule` state stays at `INITIAL_AVAILABILITY_SCHEDULE` (all days inactive). When the seller saves, the `handleAddProduct` function (line 260-280) upserts schedule rows — but only for `activeDays`. Since all days show as inactive (not loaded from DB), the seller unknowingly wipes their previously configured availability schedule.

**Where**: `DraftProductManager.tsx` line 340-363 — loads `service_listings` but skips `service_availability_schedules`.

**Why critical**: A seller who spent time configuring their weekly availability during onboarding edits a product name, hits save, and their entire availability schedule is silently wiped. The schedule upsert writes "inactive" over their previously active days. This is silent data destruction.

**Impact analysis**:
- `DraftProductManager.tsx` `handleEditProduct` — add query to load `service_availability_schedules` and populate `availabilitySchedule` state
- The save function already handles the upsert correctly — just needs correct input data

**Risks**:
1. If no schedule rows exist in DB (first-time setup), the default `INITIAL_AVAILABILITY_SCHEDULE` is correct — guard with `if (schedData && schedData.length > 0)`.
2. Schedule rows use composite key `seller_id,product_id,day_of_week` — loading by product_id is sufficient.

**Fix**: In `handleEditProduct`, after the service_listings load (line 363), add:
```typescript
// Load availability schedule
try {
  const { data: schedData } = await supabase
    .from('service_availability_schedules')
    .select('*')
    .eq('product_id', product.id);
  if (schedData && schedData.length > 0) {
    setAvailabilitySchedule(prev => prev.map(day => {
      const saved = schedData.find((s: any) => s.day_of_week === day.day_of_week);
      return saved ? { ...day, start_time: saved.start_time, end_time: saved.end_time, is_active: saved.is_active } : day;
    }));
  }
} catch { /* keep defaults */ }
```

---

## Bug 5: SellerProductsPage Contact Phone Input Missing

**What**: `SellerProductsPage.tsx` has no UI for `contact_phone`. The hook validates it (line 208-215) and auto-fills from `user.phone` as fallback. But if `user.phone` is also empty AND `action_type` is `contact_seller`, the seller gets the error "Phone number is required" with no visible field to fix it. The `contact_phone` field exists in `formData` and is saved to DB, but the page never renders an input for it.

**Where**: `SellerProductsPage.tsx` — entire dialog form, no contact_phone input.

**Why critical**: This is the exact bug the user reported previously ("Phone number is required for contact seller action"). The auto-fill fix partially addressed it, but if the user's profile phone is empty, the seller is completely stuck — they see an error for a field that doesn't exist in the UI.

**Impact analysis**:
- `SellerProductsPage.tsx` — add contact_phone input, conditionally shown when `action_type === 'contact_seller'`
- Wire to `fieldErrors.contact_phone` for validation highlighting

**Risks**:
1. Adding a phone field only for `contact_seller` action type requires the action type selector (Bug 2) to be visible — these two fixes are coupled.
2. If action_type is set but hidden (e.g., loaded from DB for an enquiry-only product), the phone field should still appear based on the loaded `action_type` value.

**Fix**: In `SellerProductsPage.tsx`, after the category/subcategory selectors, add:
```tsx
{sp.formData.action_type === 'contact_seller' && (
  <div className="space-y-2" id="edit-prod-contact_phone">
    <Label>Contact Phone *</Label>
    <Input
      placeholder="e.g., +91 98765 43210"
      value={sp.formData.contact_phone}
      onChange={(e) => {
        sp.setFormData({ ...sp.formData, contact_phone: e.target.value });
        if (sp.fieldErrors.contact_phone) sp.setFieldErrors(prev => { const { contact_phone, ...rest } = prev; return rest; });
      }}
      className={sp.fieldErrors.contact_phone ? 'border-destructive' : ''}
    />
    {sp.fieldErrors.contact_phone && <p className="text-xs text-destructive">{sp.fieldErrors.contact_phone}</p>}
  </div>
)}
```

---

## Summary

| # | Bug | File(s) | Severity | Effort |
|---|-----|---------|----------|--------|
| 1 | Service config missing from Products page | SellerProductsPage.tsx | High — silent data overwrite | ~5 min |
| 2 | Action type selector missing from Products page | SellerProductsPage.tsx | Medium — feature unreachable | ~10 min |
| 3 | Category change doesn't reset attribute blocks | SellerProductsPage.tsx, DraftProductManager.tsx | Medium — data pollution | ~5 min |
| 4 | Onboarding edit doesn't load availability schedule | DraftProductManager.tsx | High — silent schedule wipe | ~10 min |
| 5 | Contact phone input missing from Products page | SellerProductsPage.tsx | Medium — blocks save on contact_seller products | ~5 min |

All fixes are surgical — no new features, no schema changes, no refactoring.

