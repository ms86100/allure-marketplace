

# Honest Assessment: Why Your Workflow Edit Didn't Work

## The Real Problem

You edited `preparing → is_transit = true` in **Cart Purchase**. But your order (`e1f556c4`) is NOT using Cart Purchase.

Here's the proof from the database:

| Order Field | Value |
|---|---|
| `transaction_type` | `NULL` (not stored) |
| `fulfillment_type` | `delivery` |
| `delivery_handled_by` | `seller` |
| Seller `primary_group` | `food_beverages` |

The runtime resolver (`resolveTransactionType`) sees `delivery + seller` and resolves to **`seller_delivery`** — a completely separate workflow that exists in the DB but is **hidden from your admin UI**.

Your system actually has **6 workflows**, not 4:

| Workflow | Visible in Admin? |
|---|---|
| `cart_purchase` | ✅ Yes |
| `service_booking` | ✅ Yes |
| `request_service` | ✅ Yes |
| `contact_enquiry` | ✅ Yes |
| `seller_delivery` | ❌ Hidden |
| `self_fulfillment` | ❌ Hidden |

The hidden workflows (`seller_delivery`, `self_fulfillment`) are **fulfillment sub-variants** defined in `src/components/admin/workflow/types.ts` under `FULFILLMENT_VARIANTS` — deliberately excluded from the admin UI.

In `food_beverages / seller_delivery`, `preparing` has `is_transit: false`. That's why the map doesn't show. The system IS reading from the DB correctly — it's just reading from a different workflow than the one you edited.

## Why This Is Still a Critical Problem

Even though the system is technically correct, the architecture has a serious UX gap:

1. **Invisible workflows**: You cannot see or edit `seller_delivery` / `self_fulfillment` in the admin panel, yet they control real order behavior.
2. **Silent resolution**: Orders silently resolve to hidden workflows based on `fulfillmentType` + `deliveryHandledBy`, with no visibility to the admin.
3. **Confusing admin experience**: You see "Cart Purchase → Food Beverages" linked, assume that's what your orders use, but they actually use a hidden variant.

## Fix Plan

### Step 1: Expose all workflows in admin UI
In `src/components/admin/workflow/types.ts`, the `FULFILLMENT_VARIANTS` array hides `seller_delivery` and `self_fulfillment` from the workflow list. Add them to `TRANSACTION_TYPES` so admins can see and edit them:

```
TRANSACTION_TYPES = [
  { value: 'cart_purchase', label: 'Cart Purchase' },
  { value: 'seller_delivery', label: 'Seller Delivery' },
  { value: 'self_fulfillment', label: 'Self Pickup' },
  { value: 'service_booking', label: 'Service Booking' },
  { value: 'request_service', label: 'Request Service' },
  { value: 'contact_enquiry', label: 'Contact Enquiry' },
];
```

### Step 2: Show resolution path on order detail
Add a small debug badge on the order detail page showing which workflow the order resolved to (e.g., "Workflow: food_beverages / seller_delivery"). This gives immediate visibility.

### Step 3: Fix `preparing` in the correct workflow
Once visible, you can edit `food_beverages / seller_delivery` and set `is_transit = true` on `preparing`.

### Step 4: Address the remaining 5 audit bugs
The bugs from the previous audit (hardcoded fallbacks in `DeliveryActionCard`, `DeliveryMonitoringTab`, and `transit_statuses` system_settings sync) are still valid and should be fixed in a follow-up.

## Files to Modify

| File | Change |
|---|---|
| `src/components/admin/workflow/types.ts` | Move `seller_delivery` and `self_fulfillment` into `TRANSACTION_TYPES`, remove `FULFILLMENT_VARIANTS` |
| `src/components/admin/AdminWorkflowManager.tsx` | Remove filtering that hides fulfillment variants from the workflow list |
| `src/pages/OrderDetailPage.tsx` | Add small workflow resolution indicator (optional, for admin debugging) |

