

# Fix: Replace Static Address Message with Actionable Button

## Changes

### 1. `src/pages/CartPage.tsx` (line 383-385)
Replace the passive `<p>` text with a tappable Button that navigates to the address page:

```tsx
{c.fulfillmentType === 'delivery' && !c.selectedDeliveryAddress && (
  <Button
    variant="outline"
    size="sm"
    className="w-full mb-2 border-destructive text-destructive hover:bg-destructive/10"
    onClick={() => navigate('/profile/addresses', { state: { returnTo: '/cart' } })}
  >
    <MapPin size={14} className="mr-1.5" />
    Add a delivery address to continue
  </Button>
)}
```

Requires adding `MapPin` to the lucide imports and ensuring `navigate` is available (likely already destructured from `useNavigate` via the hook).

### 2. `src/hooks/useCartPage.ts` (line 391)
Update the toast message to be actionable:

```typescript
toast.error('Please add a delivery address to continue.', { id: 'checkout-no-address' });
```

## Behavior
- User taps the button → navigates to `/profile/addresses` with `returnTo: '/cart'`
- After saving an address, user returns to cart where the default address auto-selects
- The address page already exists and handles saving — no new pages needed

