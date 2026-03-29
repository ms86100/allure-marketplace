

# Fix Service Availability: Flow, State Machine & UI Alignment

## Files to Change

| File | Change |
|------|--------|
| `src/components/seller/ServiceAvailabilityManager.tsx` | Full rewrite of state management, flow logic, and layout |
| `src/pages/BecomeSellerPage.tsx` | Wire `onComplete` callback |

## 1. State Machine & Props

Replace `isSaving: boolean` with `saveState: 'idle' | 'saving' | 'saved' | 'error'`. Add `useRef(true)` for mounted guard. Add `errorMessage` state.

New props:
```typescript
interface ServiceAvailabilityManagerProps {
  sellerId: string;
  onComplete?: () => void;
}
```

Reset `saveState` to `idle` whenever user edits schedule (in `updateDay`).

## 2. Flow Logic Fix (handleSaveAndGenerate)

**Idempotency guard**: Early return if `saveState === 'saving'`.

**After saving schedule rows**, query products with `approval_status`:
```typescript
const { data: products } = await supabase
  .from('products')
  .select('id, approval_status')
  .eq('seller_id', sellerId);

const hasServices = products && products.length > 0;
const approvedProducts = products?.filter(p => p.approval_status === 'approved') || [];
const pendingProducts = products?.filter(p => p.approval_status === 'pending') || [];
```

**Conditional slot generation**: Only generate slots for approved products' service_listings. Skip generation entirely if no approved products exist.

**Slot count reliability**: Track `actualInserted` from upsert `.select('id')` responses. Show count only when > 0, otherwise show generic "Slots generated successfully".

**Inline feedback state** (not toast-only):
- No services: `saveState = 'saved'`, message = "Schedule saved — add your first service to start generating slots"
- Pending only: `saveState = 'saved'`, message = "Schedule saved — slots will generate once services are approved"
- Approved + slots created: `saveState = 'saved'`, message = "Schedule saved — X slots generated"
- Error: `saveState = 'error'`, message = error text

**Mounted guard**: Check `isMounted.current` before any `setState` calls after async operations.

**onComplete**: Fire on success via `requestAnimationFrame(() => onComplete?.())`.

## 3. UI Layout Fix

Replace flex layout with CSS grid for each day row:
```
grid grid-cols-[36px_40px_1fr] items-center gap-x-3
```

- Col 1: Switch (36px)
- Col 2: Day label (40px fixed)
- Col 3: Time inputs or "Closed" text
- Time inputs: `min-w-[90px] max-w-[120px] flex-1` for mobile safety
- Inactive days: show "Closed" in muted text in col 3 for alignment
- Consistent `px-3 py-2.5` padding per row

## 4. Inline Feedback Banner

Below the save button, render based on `saveState`:
- `saving`: nothing extra (button shows spinner)
- `saved`: green banner with CheckCircle2 + contextual message, auto-dismiss after 5s
- `error`: red banner with error message + "Retry" button that calls `handleSaveAndGenerate`

## 5. BecomeSellerPage Wiring

Line 404: Pass `onComplete` that scrolls to the "Continue to Add Products" button:
```tsx
<ServiceAvailabilityManager
  sellerId={draftSellerId}
  onComplete={() => {
    requestAnimationFrame(() => {
      document.querySelector('[data-continue-products]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }}
/>
```

Add `data-continue-products` attribute to the "Continue to Add Products" button on line 407.

## No DB Changes Required

