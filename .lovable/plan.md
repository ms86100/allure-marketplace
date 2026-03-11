

# Supplementary Fixes: Additional Risks from Architecture Review

Your review correctly identified gaps. Here is what the deeper investigation found.

## Verified Safe (No Action Needed)

| Area | Finding |
|------|---------|
| **Seller Storefront Query** | `SellerDetailPage.tsx` uses Supabase SDK `.select('*, society:societies!...')` which is a LEFT JOIN by default. Commercial sellers with `society_id = null` will load fine — `society` field will simply be `null`. The COALESCE pattern on lines 115-116 already handles this. **No fix needed.** |
| **Map Pins** | Product listing cards use `seller_latitude` / `seller_longitude` from the `search_sellers_by_location` RPC, which already returns `COALESCE(sp.latitude, s.latitude)`. **No fix needed.** |
| **Push Notifications** | No notification logic uses `buyer.society_id = seller.society_id` for targeting. All notifications are triggered by order status changes, reviews, disputes — none by society matching. **No fix needed.** |
| **Analytics GROUP BY** | No frontend code uses `GROUP BY society_id`. The `useSellerAnalytics` hook queries by `seller_id` directly. **No fix needed.** |

## One Real Issue Found: `get_seller_demand_stats` RPC

**File**: Migration `20260225110843` — `get_seller_demand_stats` function

**Current logic** (line 117-124):
```sql
SELECT society_id INTO _society_id FROM seller_profiles WHERE id = _seller_id;

SELECT COUNT(DISTINCT o.buyer_id) INTO _active_buyers
FROM orders o
JOIN profiles p ON p.id = o.buyer_id
WHERE p.society_id = _society_id  -- NULL for commercial sellers
  AND o.created_at > now() - interval '30 days'
```

**Problem**: For commercial sellers, `_society_id` is `NULL`. The condition `p.society_id = NULL` always evaluates to `FALSE` in SQL (not `NULL = NULL`). Result: `active_buyers_in_society` always returns **0** for commercial sellers.

**Impact**: The "Demand Intelligence" card in `SellerAnalytics.tsx` shows 0 active buyers for commercial sellers — misleading but not breaking.

**Risk**: Low-Medium

**Fix**: For commercial sellers, count active buyers who have ordered from THIS seller instead of from the same society:

```sql
IF _society_id IS NOT NULL THEN
  -- Society seller: count buyers in same society
  SELECT COUNT(DISTINCT o.buyer_id) INTO _active_buyers
  FROM orders o
  JOIN profiles p ON p.id = o.buyer_id
  WHERE p.society_id = _society_id
    AND o.created_at > now() - interval '30 days'
    AND o.status != 'cancelled';
ELSE
  -- Commercial seller: count unique buyers who ordered from this seller
  SELECT COUNT(DISTINCT o.buyer_id) INTO _active_buyers
  FROM orders o
  WHERE o.seller_id = _seller_id
    AND o.created_at > now() - interval '30 days'
    AND o.status != 'cancelled';
END IF;
```

Also rename the JSON key from `active_buyers_in_society` to `active_buyers` (or keep both for backward compat) and update the label in `SellerAnalytics.tsx` accordingly.

## Secondary Issue: `search_demand_log` RLS Policy

**Current** (line 149-155):
```sql
CREATE POLICY "Sellers can read unmet demand via RPC" ON public.search_demand_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.seller_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.society_id = search_demand_log.society_id
    )
  );
```

**Problem**: Commercial sellers (`society_id = NULL`) will never match this policy, so they cannot read demand logs.

**Fix**: Add a commercial seller bypass:
```sql
USING (
  EXISTS (
    SELECT 1 FROM public.seller_profiles sp
    WHERE sp.user_id = auth.uid()
      AND (sp.society_id = search_demand_log.society_id OR sp.seller_type = 'commercial')
  )
)
```

## Summary

| Area | Status | Action |
|------|--------|--------|
| Storefront query | Safe | None |
| Map pins | Safe | None |
| Push notifications | Safe | None |
| Analytics GROUP BY | Safe | None |
| `get_seller_demand_stats` RPC | Needs fix | Update to handle NULL society_id |
| `search_demand_log` RLS | Needs fix | Add commercial seller bypass |

## Implementation

One migration with two changes:
1. Recreate `get_seller_demand_stats` with the IF/ELSE branching for commercial sellers
2. Drop and recreate the `search_demand_log` RLS policy with commercial bypass

No frontend changes needed — the JSON keys remain the same.

