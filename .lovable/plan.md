
# Fix Dynamic Categories & Duplicate Seller Error

## Issues Identified

### Issue 1: "To add new categories" limitation
The `category` column in `category_config` uses the `service_category` enum type. PostgreSQL enums require `ALTER TYPE` commands to add new values, which cannot be done dynamically from the admin UI.

**Solution**: Convert the `category` column from `service_category` enum to `TEXT` type. This allows admins to create, edit, and delete categories dynamically without database migrations.

### Issue 2: Duplicate seller registration error
The error `duplicate key value violates unique constraint "seller_profiles_user_id_key"` occurs because:
- There's a **UNIQUE constraint** on `user_id` in `seller_profiles`
- This means **one user can only have ONE seller profile**
- The `BecomeSellerPage` doesn't check if the user is already a seller before attempting to insert

**Solution**: 
1. Check if user already has a seller profile before showing the registration form
2. If they are already a seller, redirect them to their settings page instead
3. Show a clear message explaining they can update their categories there

---

## Implementation Plan

### Phase 1: Database Migration - Make Categories Dynamic

Convert enum columns to TEXT for full flexibility:

```sql
-- Convert category_config.category from enum to TEXT
ALTER TABLE category_config 
  ALTER COLUMN category TYPE TEXT 
  USING category::TEXT;

-- Convert seller_profiles.categories from enum[] to TEXT[]
ALTER TABLE seller_profiles 
  ALTER COLUMN categories TYPE TEXT[] 
  USING categories::TEXT[];

-- Convert products.category from enum to TEXT
ALTER TABLE products 
  ALTER COLUMN category TYPE TEXT 
  USING category::TEXT;
```

### Phase 2: Enhance CategoryManager with Full CRUD

Add these features to the admin category management:

1. **Add Category Button**
   - Opens dialog with form: category key (auto-generated), display name, icon, color, parent group
   - Inserts new row into `category_config`

2. **Delete Category**
   - Soft delete by setting `is_active = false` 
   - Or hard delete with confirmation (if no sellers use it)

3. **Remove the limitation message**
   - Delete the "contact support" note from UI

**UI Changes**:
```text
Enhanced Category Management:
+---------------------------------------------------+
| Food & Groceries                    [+ Add] [Off] |
|   🍲 Home Food              [Edit] [Delete]  [✓] |
|   🧁 Bakery                 [Edit] [Delete]  [✓] |
+---------------------------------------------------+
```

### Phase 3: Fix BecomeSellerPage Duplicate Check

Add logic to check for existing seller profile:

```typescript
// On page load
useEffect(() => {
  const checkExistingSeller = async () => {
    const { data } = await supabase
      .from('seller_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (data) {
      toast.info('You are already registered as a seller');
      navigate('/seller/settings');
    }
  };
  
  if (user) checkExistingSeller();
}, [user]);
```

### Phase 4: Update TypeScript Types

Since we're moving to TEXT type, update the TypeScript to be more flexible:

```typescript
// In src/types/categories.ts
// Keep ServiceCategory as a type for IDE autocomplete,
// but allow any string for dynamic categories
export type ServiceCategory = string;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| New migration | Convert enum columns to TEXT for dynamic categories |
| `src/components/admin/CategoryManager.tsx` | Add Create/Delete buttons, remove limitation message |
| `src/pages/BecomeSellerPage.tsx` | Add existing seller check and redirect |
| `src/types/categories.ts` | Make ServiceCategory more flexible for dynamic values |

---

## Technical Notes

### Why TEXT instead of ENUM?
- **ENUM pros**: Type safety, smaller storage
- **ENUM cons**: Cannot add/remove values without migrations, requires downtime
- **TEXT pros**: Fully dynamic, admin can manage without developer help
- **TEXT cons**: Slightly larger storage, no database-level validation

For a community marketplace where admins need flexibility, TEXT is the better choice.

### Preventing Duplicate Sellers
The unique constraint on `user_id` is intentional - one user = one seller profile. Users who want to offer services in multiple categories should:
1. Add multiple categories to their single profile
2. Use "Seller Settings" to update their categories

---

## Expected Outcome

After implementation:
1. Admin can add new categories directly from the UI (no support contact needed)
2. Admin can edit and soft-delete categories
3. Users who are already sellers see a redirect to settings instead of an error
4. The system remains stable with proper validation

