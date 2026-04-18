

## How the ₹20 Delivery Fee Flows Today

This is a **research answer**, no code changes. Here's the actual data flow end-to-end:

### 1. Source of truth — `system_settings` table (DB)
Currently stored in Postgres:
```
key = 'base_delivery_fee'        value = '20'   (last updated 2026-04-05)
key = 'free_delivery_threshold'  value = '500'
key = 'platform_fee_percent'     value = '0'
```
This row was originally seeded by migration `20260222101455_…sql`:
```sql
INSERT INTO system_settings (key, value, description) VALUES
  ('base_delivery_fee', '20', 'Base delivery fee in INR'),
  ('free_delivery_threshold', '500', ...),
```
So the ₹20 you see is **coming from the database**, not hardcoded — but it has never been changed since the seed.

### 2. Admin can edit it (UI exists)
`src/components/admin/PlatformSettingsManager.tsx` exposes both keys under the **Financial** group:
```ts
{ key: 'base_delivery_fee', label: 'Base Delivery Fee', ... }
{ key: 'free_delivery_threshold', label: 'Free Delivery Threshold', ... }
```
Admin → Platform Settings → Financial → updates the same `system_settings` rows. This is the intended editing path.

### 3. How the buyer app reads it
- `useMarketplaceConfig()` runs **one** query: `SELECT key, value FROM system_settings`, caches it under React Query key `['system-settings-all']` for 30 minutes.
- `useSystemSettings()` reads that same cache and exposes `baseDeliveryFee` / `freeDeliveryThreshold`.
- `CartPage.tsx` uses it directly:
  ```tsx
  <FulfillmentSelector
    deliveryFee={c.settings.baseDeliveryFee}
    freeDeliveryThreshold={c.settings.freeDeliveryThreshold}
    orderValue={c.totalAmount}
  />
  ```
- The actual rule applied at cart/checkout (mirrored in tests as `computeDeliveryFee`):
  ```
  if fulfillment == 'self_pickup'         → 0
  if orderAmount >= freeDeliveryThreshold → 0
  else                                    → baseDeliveryFee
  ```

### 4. How the server confirms it (authoritative)
The edge function `supabase/functions/manage-delivery/index.ts` re-reads the same keys when an order is created (so a tampered client can't override):
```ts
const baseFee  = parseInt(settingsMap.base_delivery_fee, 10) ?? 20;
const freeThr  = parseInt(settingsMap.free_delivery_threshold, 10) ?? 500;
```
This becomes the `delivery_fee` written onto the order/delivery row that the delivery partner sees on their dashboard.

### 5. The fallback `20` you keep seeing in code
In both `useSystemSettings.ts` (line 73) and `manage-delivery/index.ts` (line 666) there's a **hardcoded `20` fallback**, used only if the DB key is missing/null. Today that branch never fires because the row exists — but it's why the number "20" appears in source.

---

### Summary picture
```
admin UI (PlatformSettingsManager)
        │  writes
        ▼
system_settings table  ──── value '20'  ◄── original seed migration
        │  read by
        ├─► useMarketplaceConfig (cache 30m)
        │       └─► useSystemSettings → CartPage → FulfillmentSelector
        └─► manage-delivery edge fn (server-side authoritative)
                └─► writes delivery_fee onto orders/deliveries
```

### Where it can break / what to know
- Admin edits update the DB instantly, but the buyer's React Query cache is **stale for up to 30 minutes** (`staleTime: 30 * 60 * 1000` in `useMarketplaceConfig`). A user already in-app won't see the new fee until that window expires or they re-login.
- There is no per-society / per-seller / distance-based delivery fee yet — it's a single global value.
- Self-pickup always overrides to 0, regardless of admin value.

If you want, next step could be: (a) shorten the cache + invalidate on admin save so changes propagate live, or (b) introduce per-society / distance-based delivery pricing.

