

# Improve: Block submission until all validation errors are resolved inline

## Current behavior

When the user clicks "Submit Application" on step 5, `handleSubmit` runs validation checks and shows **toast errors** (e.g., "Please set your store location before submitting"). The submit button remains enabled and clickable — the user can keep pressing it and getting toasts without being directed to fix the issue.

This is a **UX improvement** — the reference project has the same behavior, so this is new functionality.

## Validation checks that need inline treatment

From `handleSubmit` (lines 358-378):

1. **No products** — `draftProducts.length === 0`
2. **Declaration not accepted** — `!acceptedDeclaration` (already handled: button is disabled)
3. **No operating days** — `formData.operating_days.length === 0`
4. **UPI enabled but no UPI ID** — `formData.accepts_upi && !formData.upi_id.trim()`
5. **No location set** (no coords AND no society) — `!formData.latitude && !profile?.society_id`
6. **Society has no coordinates** — async check

## Plan

### Step 1: Add validation state to the Review step (BecomeSellerPage.tsx)

Compute a `validationErrors` array when step 5 renders, checking all conditions synchronously (skip the async society-coords check — handle that on submit still):

```typescript
const validationErrors: { key: string; message: string; section: string }[] = [];
if (draftProducts.length === 0) validationErrors.push({ key: 'products', message: 'Add at least one product', section: 'Products' });
if (formData.operating_days.length === 0) validationErrors.push({ key: 'days', message: 'Select at least one operating day', section: 'Store Settings' });
if (formData.accepts_upi && !formData.upi_id.trim()) validationErrors.push({ key: 'upi', message: 'Enter your UPI ID or disable UPI payments', section: 'Store Settings' });
if (!formData.latitude && !profile?.society_id) validationErrors.push({ key: 'location', message: 'Set your store location', section: 'Store Settings' });
```

### Step 2: Show inline error alerts in the Application Summary

For each validation error, render an inline `Alert` with destructive styling next to the relevant summary row. Each alert includes a "Fix this" button that navigates back to the appropriate step:

- Products errors → `handleStepBack(4)`
- Store Settings errors (operating days, UPI, location) → `handleStepBack(3)`

### Step 3: Disable the Submit button when errors exist

Change the submit button's `disabled` condition:

```typescript
disabled={isLoading || !acceptedDeclaration || validationErrors.length > 0}
```

### Step 4: Keep toast errors as fallback in handleSubmit

The `handleSubmit` validation stays as-is for the async society-coordinates check and as a safety net, but users will rarely hit it because the inline errors block submission first.

## Files changed

| File | Change |
|---|---|
| `src/pages/BecomeSellerPage.tsx` | Add `validationErrors` computation in step 5, render inline error alerts with "Fix this" navigation buttons, disable submit when errors exist |

## Result

- Errors are surfaced directly in the review summary with clear "Fix this" links
- Submit button is disabled until all fixable issues are resolved
- Users cannot proceed without addressing validation problems
- The async society-coordinates check remains as a toast fallback since it requires a DB query

