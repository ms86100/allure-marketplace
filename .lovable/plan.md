

# Fix: Search returning empty results for all queries

## Root Cause (verified from network requests)

Every call to `search_products_fts` returns `200 []` — empty array, no error. The function is `SECURITY DEFINER` so RLS is **not** the blocker. The problem is data-level:

### Issue 1: `search_vector` column is likely NULL on products
The migration that added the `search_vector` column also ran an `UPDATE` to populate existing rows. However, products added through bulk import or other code paths may have NULL search_vector values. The trigger only fires on `INSERT OR UPDATE OF name, brand, description, ingredients` — if products were inserted via a method that bypassed the trigger (e.g., direct SQL copy, or the trigger wasn't active yet), they'd have NULL vectors and never match any tsquery.

### Issue 2: FTS function has no ILIKE fallback
When a user types "chi" looking for "chicken", `websearch_to_tsquery('english', 'chi')` produces a tsquery that may not match anything because "chi" doesn't stem to a useful English word. The function needs an ILIKE fallback or prefix-matching (`to_tsquery('english', 'chi:*')`) for short/partial queries.

### Issue 3: Empty query returns nothing (blocks category-only browsing)
Lines 78-80 of `search_products_fts`: if the tsquery is empty, the function returns immediately with no rows. The frontend calls this with `_query: ''` for category-only filtering, which always returns empty.

### Issue 4: Missing `category` column on `search_demand_log`
Console logs show: `Could not find the 'category' column of 'search_demand_log'`. The frontend tries to insert a `category` field that doesn't exist in the table.

## Fix Plan

### Migration 1: Re-populate search_vector and fix the FTS function

**SQL to run in Supabase SQL Editor:**

```sql
-- 1. Re-populate search_vector for ALL products (catches any NULLs)
UPDATE public.products SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(brand, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(ingredients, '')), 'D')
WHERE search_vector IS NULL;

-- 2. Add missing category column to search_demand_log
ALTER TABLE public.search_demand_log
  ADD COLUMN IF NOT EXISTS category text;

-- 3. Replace search_products_fts with prefix-matching + empty-query support
CREATE OR REPLACE FUNCTION public.search_products_fts(
  _query text,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _radius_km double precision DEFAULT 10,
  _category text DEFAULT NULL,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  product_id uuid, product_name text, price numeric,
  image_url text, category text, is_veg boolean,
  is_available boolean, action_type text, description text,
  brand text, mrp numeric, discount_percentage numeric,
  seller_id uuid, seller_name text, seller_rating numeric,
  seller_total_reviews integer, seller_profile_image text,
  society_name text, distance_km double precision, rank real
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tsquery tsquery;
  _box_delta double precision;
  _has_query boolean;
BEGIN
  _has_query := (_query IS NOT NULL AND trim(_query) <> '');
  _box_delta := _radius_km * 0.009;

  IF _has_query THEN
    -- Try prefix matching for autocomplete: append :* to each word
    BEGIN
      _tsquery := to_tsquery('english',
        array_to_string(
          array(SELECT lexeme || ':*' FROM unnest(
            string_to_array(regexp_replace(trim(_query), '\s+', ' ', 'g'), ' ')
          ) AS lexeme WHERE length(lexeme) > 0),
          ' & '
        )
      );
    EXCEPTION WHEN OTHERS THEN
      _tsquery := plainto_tsquery('english', _query);
    END;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.price,
    p.image_url,
    p.category::text AS category,
    p.is_veg,
    p.is_available,
    p.action_type,
    p.description,
    p.brand,
    p.mrp,
    p.discount_percentage,
    sp.id AS seller_id,
    sp.business_name AS seller_name,
    sp.rating AS seller_rating,
    sp.total_reviews AS seller_total_reviews,
    sp.profile_image_url AS seller_profile_image,
    s.name AS society_name,
    CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL THEN
      public.haversine_km(_lat, _lng,
        COALESCE(sp.latitude, s.latitude::double precision),
        COALESCE(sp.longitude, s.longitude::double precision))
    ELSE NULL END AS distance_km,
    CASE WHEN _has_query AND _tsquery IS NOT NULL
      THEN ts_rank(p.search_vector, _tsquery)
      ELSE 0.0
    END::real AS rank
  FROM public.products p
  JOIN public.seller_profiles sp ON sp.id = p.seller_id
  LEFT JOIN public.societies s ON s.id = sp.society_id
  WHERE p.is_available = true
    AND p.approval_status = 'approved'
    AND sp.verification_status = 'approved'
    AND sp.is_available = true
    -- Text match: either tsquery matches OR ILIKE fallback for short queries
    AND (
      NOT _has_query  -- empty query = browse all (for category filtering)
      OR (_tsquery IS NOT NULL AND p.search_vector @@ _tsquery)
      OR p.name ILIKE '%' || trim(_query) || '%'
    )
    AND (_category IS NULL OR p.category::text = _category)
    AND (
      _lat IS NULL OR _lng IS NULL
      OR (
        COALESCE(sp.latitude, s.latitude::double precision)
          BETWEEN (_lat - _box_delta) AND (_lat + _box_delta)
        AND COALESCE(sp.longitude, s.longitude::double precision)
          BETWEEN (_lng - _box_delta) AND (_lng + _box_delta)
      )
    )
  ORDER BY rank DESC, p.is_bestseller DESC NULLS LAST, p.name
  LIMIT _limit
  OFFSET _offset;
END;
$$;
```

### What this fixes

| Problem | Fix |
|---|---|
| NULL `search_vector` on products | Re-populates all NULL rows |
| Short queries like "chi" don't match "chicken" | Prefix matching with `:*` suffix |
| Empty query returns nothing | Removed early-return; empty query now returns all products (filtered by category/location) |
| No ILIKE fallback | Added `OR p.name ILIKE` for cases where tsvector stemming misses |
| Missing `category` on `search_demand_log` | Added the column |

### No frontend changes needed
The frontend code is identical to the reference project. Only the database function and data need fixing.

