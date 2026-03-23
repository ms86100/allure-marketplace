

# Single Workflow Architecture — Full Implementation Plan

## The Core Insight

Comparing the three workflows side by side:

```text
STEP            cart_purchase    seller_delivery    self_fulfillment
─────────────   ──────────────   ───────────────    ────────────────
placed          ✅ buyer         ✅ buyer            ✅ buyer
accepted        ✅ seller        ✅ seller            ✅ seller
preparing       ✅ seller        ✅ seller            ✅ seller
ready           ✅ seller        ✅ seller            ✅ seller
picked_up       ✅ delivery,sel  ✅ seller            ❌ skip
on_the_way      ✅ delivery,sel  ✅ seller            ❌ skip
delivered       ✅ system        ✅ seller            ❌ skip
buyer_received  ❌ skip          ❌ skip              ✅ buyer
completed       ✅ buyer         ✅ buyer             ✅ seller
cancelled       ✅ admin         ✅ admin             ✅ admin
```

**Key difference:** Self-pickup skips transit steps entirely and uses `buyer_received` instead of `delivered`. The actor on transit steps varies by who handles delivery (seller vs platform).

## Solution: `fulfillment_scope` Column

Add ONE column to `category_status_flows` and `category_status_transitions`:

| Value | Meaning |
|-------|---------|
| `null` | Step applies to ALL fulfillment types |
| `delivery` | Step only applies when fulfillment involves delivery (seller or platform) |
| `pickup` | Step only applies when fulfillment is self-pickup |

Then ONE `cart_purchase` workflow contains ALL steps, and the system filters at query time based on the order's `fulfillment_type`.

## Merged Workflow: `cart_purchase`

```text
sort  status_key      actor             scope     is_transit
───── ──────────────  ────────────────  ────────  ──────────
10    placed          buyer             null      false
20    accepted        seller            null      false
30    preparing       seller            null      (configurable)
40    ready           seller            null      false
50    picked_up       delivery,seller   delivery  true
60    on_the_way      delivery,seller   delivery  true
65    buyer_received  buyer             pickup    false
70    delivered       system            delivery  false
80    completed       buyer             null      true (terminal)
90    cancelled       admin             null      false (terminal)
100   failed          system            null      false (terminal)
```

**Actor on delivery steps:** Already handled — `delivery,seller` means the system picks the right actor based on `delivery_handled_by`. No separate workflow needed.

---

## Implementation Steps

### Step 1: Database Migration

**Add column + merge data:**

```sql
-- 1. Add fulfillment_scope to flows and transitions
ALTER TABLE category_status_flows
  ADD COLUMN IF NOT EXISTS fulfillment_scope text DEFAULT null;

ALTER TABLE category_status_transitions
  ADD COLUMN IF NOT EXISTS fulfillment_scope text DEFAULT null;

-- 2. Tag existing cart_purchase delivery-only steps
UPDATE category_status_flows
  SET fulfillment_scope = 'delivery'
  WHERE transaction_type = 'cart_purchase'
    AND status_key IN ('picked_up', 'on_the_way', 'delivered');

-- 3. Copy self_fulfillment's buyer_received into cart_purchase (all parent_groups)
INSERT INTO category_status_flows (
  parent_group, transaction_type, status_key, sort_order, actor,
  is_terminal, is_success, is_transit, requires_otp,
  display_label, color, icon, buyer_hint, seller_hint,
  fulfillment_scope, ...
)
SELECT parent_group, 'cart_purchase', status_key, 65, actor,
  is_terminal, is_success, is_transit, requires_otp,
  display_label, color, icon, buyer_hint, seller_hint,
  'pickup', ...
FROM category_status_flows
WHERE transaction_type = 'self_fulfillment'
  AND status_key = 'buyer_received'
ON CONFLICT DO NOTHING;

-- 4. Similarly merge transitions with scope tags
-- 5. Delete old seller_delivery and self_fulfillment rows
-- 6. Update existing orders: transaction_type → 'cart_purchase'
UPDATE orders SET transaction_type = 'cart_purchase'
  WHERE transaction_type IN ('seller_delivery', 'self_fulfillment');
```

### Step 2: Update Backend RPCs

**`seller_advance_order` and `buyer_advance_order`:**

Replace the entire fulfillment → transaction_type resolution block with:

```sql
-- For purchase orders, always use 'cart_purchase'
IF v_order.order_type = 'purchase' THEN
  v_transaction_type := 'cart_purchase';
END IF;
```

The transition lookup query adds scope filtering:

```sql
SELECT EXISTS (
  SELECT 1 FROM category_status_transitions
  WHERE from_status = v_order.status::text
    AND to_status = _new_status::text
    AND allowed_actor = 'seller'
    AND parent_group = v_parent_group
    AND transaction_type = v_transaction_type
    AND (
      fulfillment_scope IS NULL
      OR fulfillment_scope = CASE
        WHEN v_order.fulfillment_type = 'self_pickup' THEN 'pickup'
        ELSE 'delivery'
      END
    )
) INTO v_valid;
```

### Step 3: Update `create_multi_vendor_orders` RPC

Replace the 10-line `IF/ELSIF` block (lines 179-189) with:

```sql
-- Purchase orders always use cart_purchase
_resolved_txn_type := 'cart_purchase';
```

### Step 4: Update `resolveTransactionType.ts`

Remove fulfillment sub-variant logic:

```typescript
export function resolveTransactionType(...): string {
  if (storedTransactionType) return storedTransactionType;
  if (listingType === 'contact_enquiry') return 'contact_enquiry';
  if (orderType === 'enquiry') { /* service_booking or request_service */ }
  if (orderType === 'booking') return 'service_booking';
  // ALL purchase orders → cart_purchase (no more fulfillment branching)
  return 'cart_purchase';
}
```

### Step 5: Update `useCategoryStatusFlow` Hook

Add `fulfillmentType` to the fetch function so it filters steps by scope:

```typescript
export async function fetchStatusFlow(
  parentGroup: string,
  transactionType: string,
  fulfillmentScope?: 'delivery' | 'pickup' | null
): Promise<StatusFlowStep[]> {
  let query = supabase
    .from('category_status_flows')
    .select('...')
    .eq('parent_group', parentGroup)
    .eq('transaction_type', transactionType);

  // Filter by fulfillment scope
  if (fulfillmentScope) {
    query = query.or(`fulfillment_scope.is.null,fulfillment_scope.eq.${fulfillmentScope}`);
  }

  // ... rest unchanged
}
```

Similarly update `fetchStatusTransitions`.

The `useCategoryStatusFlow` hook gains a `fulfillmentType` parameter that maps to scope (`self_pickup` → `pickup`, else → `delivery`).

### Step 6: Update `useOrderDetail.ts`

Pass `fulfillmentType` through to the flow hook so it filters correctly.

### Step 7: Update Admin Workflow Manager UI

- Remove `seller_delivery` and `self_fulfillment` from `TRANSACTION_TYPES`
- Add a "Scope" column to the step editor (dropdown: All / Delivery Only / Pickup Only)
- When editing `cart_purchase`, admin sees ALL steps with scope badges
- Steps tagged `delivery` show a 🚚 badge, `pickup` shows a 🏪 badge

### Step 8: Remove Global `transit_statuses` Sync

The cross-workflow leakage bug is eliminated since there's now only one workflow. But the sync itself should be scoped:

```typescript
// Only sync transit statuses for the current workflow being saved
const transitKeys = steps.filter(s => s.is_transit).map(s => s.status_key);
```

### Step 9: Update `CategoryWorkflowPreview`

Show scope badges on steps. No more confusing "which workflow is linked?" question — it's always `cart_purchase` for purchases.

---

## Files Modified

| File | Change |
|---|---|
| **DB Migration** | Add `fulfillment_scope` column, merge data, update RPCs |
| `src/lib/resolveTransactionType.ts` | Remove fulfillment branching — always return `cart_purchase` |
| `src/hooks/useCategoryStatusFlow.ts` | Add scope filtering to fetch functions |
| `src/hooks/useOrderDetail.ts` | Pass fulfillment scope to flow hook |
| `src/components/admin/workflow/types.ts` | Remove `seller_delivery`, `self_fulfillment` from types |
| `src/components/admin/AdminWorkflowManager.tsx` | Add scope UI, remove transit_statuses leaky sync |
| `src/components/admin/CategoryWorkflowPreview.tsx` | Show scope badges |
| `src/pages/OrderDetailPage.tsx` | Cleanup debug badge (always shows `cart_purchase` now) |
| `src/components/home/ActiveOrderStrip.tsx` | Remove `self_fulfillment`/`seller_delivery` from IN clause |

## Risk Assessment

| Area | Risk | Mitigation |
|---|---|---|
| Existing orders | Medium | Bulk-update `transaction_type` to `cart_purchase` in migration |
| RPCs | Medium | Simplified logic (fewer branches = fewer bugs) |
| Frontend hooks | Low | Additive change (scope filter) |
| Admin UI | Low | Cosmetic — scope dropdown on steps |
| Edge functions | Low | Most already read `transaction_type` from order row |

## Result

After this change:
- **4 workflows total**: `cart_purchase`, `service_booking`, `request_service`, `contact_enquiry`
- Admin edits ONE workflow, ALL fulfillment types reflect the change
- No hidden resolution, no invisible variants
- `fulfillment_scope` makes pickup vs delivery step differences explicit and configurable

