

# Fix: "Seller not found" — Missing Foreign Key Constraint

## Root Cause

The network logs show a clear error when clicking a store listing:

```
GET /seller_profiles?select=*,profile:profiles!seller_profiles_user_id_fkey(...)
→ 400: "Could not find a relationship between 'seller_profiles' and 'profiles' 
        using the hint 'seller_profiles_user_id_fkey'"
```

The `SellerDetailPage.tsx` (line 76-78) queries `seller_profiles` with a join to `profiles` using `seller_profiles_user_id_fkey`. This FK constraint **does not exist** in your database. The migration file `20260130092020` defines it but was never applied.

Without this FK, PostgREST returns a 400 error, the seller data is `null`, and the page shows "Seller not found."

The reference project has this exact same FK and it works because it was applied to their DB.

## Additional Broken Queries (from network logs)

While investigating, the network logs reveal **6 more column/table mismatches** between your code and DB:

| Query | Error | Fix |
|---|---|---|
| `product_favorites` table | `404: table not found` (hint: use `favorites`) | Rename table reference in code |
| `user_notifications.reference_path` | `42703: column does not exist` | Remove or add column |
| `profiles.has_seen_onboarding` | `42703: column does not exist` | Remove or add column |
| `featured_items.schedule_start` | `42703: column does not exist` | Remove or add column |
| `order_suggestions.dismissed` | `42703: column is_dismissed not dismissed` | Fix column name in code |
| `category_status_flows.display_label` | `42703: column is display_name not display_label` | Fix column name in code |

## Implementation Plan

### Step 1: SQL to run in Supabase (fixes the FK — the primary blocker)

Run the migration SQL from `20260130092020` that was never applied:

```sql
ALTER TABLE public.seller_profiles 
  DROP CONSTRAINT IF EXISTS seller_profiles_user_id_fkey;
ALTER TABLE public.seller_profiles 
  ADD CONSTRAINT seller_profiles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS orders_buyer_id_fkey;
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_buyer_id_fkey 
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.reviews 
  DROP CONSTRAINT IF EXISTS reviews_buyer_id_fkey;
ALTER TABLE public.reviews 
  ADD CONSTRAINT reviews_buyer_id_fkey 
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
```

### Step 2: Fix 6 column/table name mismatches in code

| File | Change |
|---|---|
| Favorites hook | `product_favorites` → `favorites` |
| Notifications hook | `reference_path` → correct column name (or remove) |
| Onboarding hook | `has_seen_onboarding` → remove or add column |
| Featured items hook | `schedule_start`/`schedule_end` → remove or add columns |
| Order suggestions hook | `dismissed` → `is_dismissed` |
| Status flow hook | `display_label` → `display_name` |

### Step 3: Verify against reference project

Cross-check each fix against the reference project's column names to ensure alignment.

## Priority

Step 1 (SQL) is the **immediate fix** for the "seller not found" issue. Step 2 fixes the other silent errors causing broken notifications, favorites, and featured items.

