

# Fix Remaining Bugs 4 & 8

## Bug 4: Booking Flow Server-Side Idempotency

**Problem:** Two concurrent `handleConfirm` calls create two orders. The second fails at `book_service_slot` (slot already booked), leaving an orphan order.

**Fix — DB migration + client change:**

### Migration
Add an `idempotency_key` column to `orders` with a unique partial index for booking orders:

```sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_booking_idempotency 
  ON public.orders (buyer_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL AND order_type = 'booking';
```

### Client: `ServiceBookingFlow.tsx`
Before the order insert, generate a deterministic key:
```typescript
const idempotencyKey = `booking_${user.id}_${productId}_${dateStr}_${normalizedTime}`;
```
Insert with `idempotency_key: idempotencyKey`. Use `.upsert()` with `onConflict: 'buyer_id,idempotency_key'` or handle the unique violation — if the insert returns a conflict, query for the existing order and continue with it.

This means if the same user tries to book the same product+date+time twice, the second attempt reuses the first order instead of creating a duplicate.

---

## Bug 8: RecentlyViewedRow Closed-Store UX

**Problem:** The "+" button appears on products from closed stores. `useCart.addItem` rejects with a toast, but the UX is confusing.

**Fix — `RecentlyViewedRow.tsx`:**

1. Change the products query to join seller availability:
```sql
select('id, name, price, image_url, seller_id, is_available, ..., action_type, seller_profiles!inner(is_available, availability_start, availability_end, operating_days)')
```

2. Add a helper to check if store is currently open (reuse the same logic from `ProductListingCard` or `useCart`).

3. For closed-store products: show a "Closed" overlay on the image and hide the "+" button, or make it visually disabled.

No data integrity risk — `useCart` already blocks the add. This is purely UX.

---

## Files Changed

| File | Change |
|------|--------|
| DB migration | Add `idempotency_key` column + unique partial index |
| `src/components/booking/ServiceBookingFlow.tsx` | Generate and pass idempotency key on order insert |
| `src/components/home/RecentlyViewedRow.tsx` | Join seller availability, show closed-store overlay |

## Impact Analysis

- **Idempotency key** is nullable, so all existing orders are unaffected. The unique index only applies to `order_type = 'booking'` rows with a non-null key.
- **RecentlyViewedRow** seller join uses `!inner` which excludes products from deleted sellers — a minor improvement. The cart guard remains as a safety net.
- No changes to checkout, cart, or payment flows.

