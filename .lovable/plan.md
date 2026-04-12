

# Auto-Accept Order — Audit & Fix Plan

## Current State

The feature exists and has three layers:
1. **UI toggle** in Store Settings → Automation tab — works correctly, persists `auto_accept_enabled` to `seller_profiles`
2. **DB trigger** (`trg_order_auto_accept`, BEFORE INSERT on orders) — mechanically functional, changes `NEW.status` from `'placed'` to `'preparing'` with operating-hours/day/limit guards
3. **Notifications** — **completely broken for auto-accepted orders**

## Critical Bug Found

**The seller receives NO notification when an order is auto-accepted.**

Root cause chain:

1. `trg_order_auto_accept` (BEFORE INSERT) changes `NEW.status` to `'preparing'`
2. `fn_enqueue_new_order_notification` (AFTER INSERT) checks `IF NEW.status NOT IN ('placed', 'enquired')` — since status is now `'preparing'`, it **silently exits** and enqueues nothing
3. `fn_enqueue_order_status_notification` (AFTER UPDATE) never fires because there was no UPDATE — the status was set during INSERT
4. Result: **the order is accepted silently with zero seller awareness** — the exact opposite of what's needed

Additionally, the buyer notification (`fn_enqueue_order_status_notification` INSERT branch from migration 20260410) sends a generic "Order Placed" message even though the order was already auto-accepted to `'preparing'`.

## Fix Plan

### A. Update `fn_enqueue_new_order_notification` to handle auto-accepted orders

**Migration change**: Modify the function to also fire when `NEW.status = 'preparing'` (auto-accepted case). When the status is `'preparing'` at INSERT time, send a distinct notification:

- **Seller gets**: "Order Auto-Accepted ✅ — [buyer name] placed an order. It's been auto-accepted. Start preparing!"
- **Buyer gets**: "Order Confirmed! Your order has been accepted and is being prepared."

```sql
-- Expand the guard clause
IF NEW.status NOT IN ('placed', 'enquired', 'preparing') THEN
  RETURN NEW;
END IF;

-- Add 'preparing' case to the notification title/body
CASE WHEN NEW.status = 'placed' THEN 'New Order Received! 🛒'
     WHEN NEW.status = 'preparing' THEN 'Order Auto-Accepted ✅'
     ELSE 'New Enquiry Received! 💬'
END
```

### B. Add buyer notification for auto-accepted orders

In the same trigger function, when `NEW.status = 'preparing'`, also enqueue a buyer-facing notification:
- Title: "Order Confirmed! ✅"  
- Body: "Your order has been accepted and is being prepared."

This replaces the misleading "Order Placed" message the buyer currently gets.

### C. Update `fn_enqueue_order_status_notification` INSERT branch

The simplified version from migration 20260410 always sends "Order Placed" on INSERT. Update it to check the actual status:
- If `'placed'` → "Order Placed" (existing)
- If `'preparing'` → "Order Accepted — being prepared" (auto-accept case)

### D. Add `auto_accepted` flag to notification payload

Add `"auto_accepted": true` to the notification payload JSON so the frontend can render a distinct UI treatment (e.g., a different badge or toast message in the seller dashboard).

### E. Frontend: distinct auto-accept toast in seller dashboard

In the real-time order listener on the seller dashboard, when a new order arrives with `status = 'preparing'` and `auto_accepted = true` in the payload, show:
- A green toast: "Order #XXXX auto-accepted — start preparing!"
- Instead of the regular "New order received" alert

---

### Files Changed

| File | Change |
|------|--------|
| New migration SQL | Update `fn_enqueue_new_order_notification` to handle `'preparing'` status, notify both seller and buyer |
| New migration SQL | Update `fn_enqueue_order_status_notification` INSERT branch for auto-accept awareness |
| `src/lib/order-notification-titles.ts` | Add `auto_accepted` title variant |
| `src/components/seller/NewOrderAlert.tsx` (or equivalent) | Render distinct auto-accept toast |

No new dependencies. No new tables. One migration with two function replacements.

