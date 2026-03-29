

# Fix: Field-Level Validation with Visual Indicators for Product Creation

## Problem
The `handleAddProduct` function validates sequentially with generic toast errors. When the image field (or other fields) is missing, the user sees "Product image is required" as a toast but the form doesn't highlight which field failed. The user scrolls up/down confused.

## Root Cause
- Validation uses sequential `if/return` with `toast.error()` — no field-level error state
- No visual red border or inline error message on invalid fields
- No auto-scroll to the first invalid field

## Fix — 2 files

### 1. `src/components/seller/DraftProductManager.tsx`

**Add validation error state:**
```typescript
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
```

**Replace sequential validation in `handleAddProduct`** with a single pass that collects ALL errors:
```typescript
const errors: Record<string, string> = {};
if (!newProduct.name.trim()) errors.name = 'Product name is required';
if (requiresPrice && newProduct.price <= 0) errors.price = 'Price must be greater than 0';
if (newProduct.mrp && newProduct.mrp > 0 && newProduct.price > newProduct.mrp) errors.price = 'Price cannot exceed MRP';
if (!newProduct.image_url.trim()) errors.image_url = 'Product image is required';

if (Object.keys(errors).length > 0) {
  setFieldErrors(errors);
  toast.error(`Please fix ${Object.keys(errors).length} field(s) highlighted below`);
  // Scroll to first error
  const firstErrorId = `prod-${Object.keys(errors)[0]}`;
  document.getElementById(firstErrorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return;
}
setFieldErrors({});
```

**Add inline error display under each field** — a small `<p className="text-xs text-destructive">` below each input when `fieldErrors[fieldKey]` exists.

**Add red border on invalid inputs** — conditionally apply `border-destructive` class to inputs with errors.

**Clear field error on change** — when user types in a field, remove that field's error:
```typescript
onChange={(e) => {
  setNewProduct({ ...newProduct, name: e.target.value });
  if (fieldErrors.name) setFieldErrors(prev => { const { name, ...rest } = prev; return rest; });
}}
```

### 2. `src/hooks/useSellerProducts.ts` — Same pattern for edit dialog

Apply identical field-level error state and inline messages to `handleSave` validation. Collect all errors first, then display with field highlighting.

## Fields to validate with visual indicators:
| Field | ID | Condition |
|---|---|---|
| Name | `prod-name` | empty |
| Price | `prod-price` | ≤0 when required, or > MRP |
| Image | `prod-image` | empty URL |
| Phone | `prod-phone` | empty when action_type = contact_seller |

## UX Behavior:
- On submit: highlight ALL invalid fields at once (not one at a time)
- Show count in toast: "Please fix 2 field(s) highlighted below"
- Auto-scroll to first error field
- Clear individual field error when user edits that field
- Red border + inline error text below field

