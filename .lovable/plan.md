

# Workflow-Driven Role-Specific Status Labels for Self Pickup

## Problem

The `category_status_flows` table has a single `display_label` column shared between buyer and seller views. For self-pickup, "Confirm Receipt" and "Ready" are generic — the seller should see "Handed Over" while the buyer sees "Picked Up", and "Ready" should show as "Ready for Pickup" to buyers.

## Root Cause

No mechanism exists for role-specific display labels. The `buyer_hint` / `seller_hint` columns exist for hints, but `display_label` is always the same for both roles.

## Solution: Add Role-Specific Label Columns + Data Update

### Step 1: Migration — Add `buyer_display_label` and `seller_display_label`

Add two nullable text columns to `category_status_flows`. When set, they override `display_label` for that role. When null, the system falls back to `display_label` (backward-compatible).

```sql
ALTER TABLE public.category_status_flows
  ADD COLUMN IF NOT EXISTS buyer_display_label text,
  ADD COLUMN IF NOT EXISTS seller_display_label text;
```

### Step 2: Data Update — Self Fulfillment Steps

Using the insert tool (data update, not schema):

| status_key | display_label | buyer_display_label | seller_display_label | buyer_hint | seller_hint |
|---|---|---|---|---|---|
| `ready` | Ready | Ready for Pickup | Ready | Your order is ready for pickup! | Order is ready. Hand it over when the buyer arrives. |
| `buyer_received` | Picked Up | Picked Up | Handed Over | You've collected your order. | You handed this order to the buyer. Waiting for their confirmation. |

### Step 3: Update `useOrderDetail.ts` — Role-Aware Label Resolution

Update `getFlowStepLabel` to accept a role parameter:

```typescript
const getFlowStepLabel = (statusKey: string, role?: 'buyer' | 'seller') => {
  const step = flow.find(s => s.status_key === statusKey);
  if (step) {
    const label = (role === 'buyer' && step.buyer_display_label)
      ? step.buyer_display_label
      : (role === 'seller' && step.seller_display_label)
        ? step.seller_display_label
        : step.display_label;
    if (label) return { label, color: step.color || '...' };
  }
  return getOrderStatus(statusKey);
};
```

### Step 4: Update `useFlowStepLabels.ts` — List View Role Support

Update `getFlowLabel` to optionally accept a role, and fetch the new columns:

```typescript
const getFlowLabel = (statusKey: string, role?: 'buyer' | 'seller'): FlowLabel => {
  const entry = flowLabelMap?.[statusKey];
  if (entry) {
    const label = (role === 'buyer' && entry.buyerLabel) || (role === 'seller' && entry.sellerLabel) || entry.label;
    return { label, color: entry.color };
  }
  return getOrderStatus(statusKey);
};
```

### Step 5: Update Consumers — Pass Role Context

- **`OrdersPage.tsx`** — `OrderCard` already knows `type` (buyer/seller), pass it to `getFlowLabel(order.status, type)`
- **`OrderDetailPage.tsx`** — Already has `isSellerView`/`isBuyerView`, pass the role when calling `getFlowStepLabel`
- **`useCategoryStatusFlow.ts`** — Add `buyer_display_label, seller_display_label` to the select query

### Step 6: Admin Workflow UI

Add `buyer_display_label` and `seller_display_label` fields to the workflow step editor so admins can configure role-specific labels for any workflow — fully DB-driven.

## Files Changed

| File | Change |
|---|---|
| Migration | Add `buyer_display_label`, `seller_display_label` columns |
| Data update (insert tool) | Set role labels for self_fulfillment `ready` + `buyer_received` steps |
| `src/hooks/useOrderDetail.ts` | Role-aware `getFlowStepLabel` |
| `src/hooks/useFlowStepLabels.ts` | Role-aware `getFlowLabel` + fetch new columns |
| `src/hooks/useCategoryStatusFlow.ts` | Add new columns to select |
| `src/pages/OrdersPage.tsx` | Pass role to `getFlowLabel` |
| `src/pages/OrderDetailPage.tsx` | Pass role to `getFlowStepLabel` |
| `src/components/admin/workflow/*.tsx` | Add buyer/seller label fields to step editor |

## Why This is Bulletproof

- **Zero hardcoding** — all labels come from DB
- **Backward compatible** — null role-specific labels fall back to `display_label`
- **Admin configurable** — any workflow can have role-specific labels via the admin UI
- **Applies everywhere** — list views, detail views, timeline, notifications all respect the role

