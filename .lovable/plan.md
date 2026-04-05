

# Fix: Add 'ayurveda' to `product_category` enum

## Problem
The `product_category` enum in your database only has: `home_food`, `bakery`, `snacks`, `groceries`, `other`. The seed script added an `ayurveda` row to `category_config`, but when the seller store setup tries to use it, Postgres rejects the value.

## Solution
Run this single SQL statement in the **[Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new)**:

```sql
ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS 'ayurveda';
```

No code changes needed — this is purely a database enum gap.

## Why This Happened
The `category_config` table's `category` column uses the `product_category` enum type. When we inserted the `ayurveda` row in the seed script, we should have extended the enum first. The source project had already added this value to their enum.

