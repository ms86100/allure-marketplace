
# Dynamic Categories & Store Deployment Fixes

## Current System Analysis

### What's Working Well
- Categories are fully database-driven from `category_config` table
- Admin can enable/disable categories via the Settings tab in admin panel
- Only active categories are shown to users (proper filtering)
- All 50+ service categories are seeded with correct behavior flags
- Parent groups only appear if they have active sub-categories

### Issues to Fix

1. **Seller Category Leakage**: Sellers appear in wrong category groups because they can select categories across multiple parent groups. A food seller who also selected "tuition" will appear in Classes.

2. **No Parent Group Enforcement**: When sellers register or update their profile, they can freely mix categories from different groups (food + services + rentals).

3. **Store Metadata Outdated**: Still describes "BlockEats" as a food app. Needs update for Society Super-App scope.

4. **Capacitor Production Config**: Currently uses development server URL which won't work for store submission.

---

## Implementation Plan

### Phase 1: Enforce Category Group Consistency

**Goal**: Sellers can only select categories within one parent group

**Changes**:

1. **Update BecomeSellerPage.tsx**
   - Already has parent group selection as Step 1
   - Enforce that selected categories must all be from the chosen parent group
   - Clear previously selected categories when parent group changes

2. **Update SellerSettingsPage.tsx**
   - Add parent group display based on seller's existing categories
   - Restrict category changes to same parent group
   - Show warning if trying to switch groups (would require re-registration)

3. **Update SellerProductsPage.tsx**
   - When adding products, only show categories from seller's registered parent group

### Phase 2: Fix CategoryGroupPage Seller Filtering

**Goal**: Only show sellers whose primary group matches the current page

**Changes**:

1. **Add seller_group field or derive from categories**
   - Option A: Add `primary_group` column to `seller_profiles`
   - Option B: Derive from first category (less reliable)
   - Recommend Option A for clarity

2. **Database migration**
   - Add `primary_group TEXT` column to `seller_profiles`
   - Update BecomeSellerPage to set this during registration

3. **Update CategoryGroupPage query**
   - Filter by `primary_group` instead of `overlaps` with categories

### Phase 3: Update Store Metadata

**Goal**: Reflect Society Super-App scope for Play Store and App Store

**Changes to STORE_METADATA.md**:

- App Name: BlockEats → "Greenfield Community" or keep BlockEats
- Category: Food & Drink → "Lifestyle" or "Social"
- Description: Update to include all service categories
- Keywords: Add services, rentals, classes, community marketplace

### Phase 4: Capacitor Production Configuration

**Goal**: Prepare for app store submission

**Changes to capacitor.config.ts**:

1. Remove `server.url` for production builds (uses local dist)
2. Update `appName` to final production name
3. Keep `appId` unchanged (already set)
4. Add app version code handling note

**Create build documentation**:
- Development mode: Uses current config with server URL
- Production mode: Remove server block, use local assets

---

## Technical Details

### Database Migration

```sql
-- Add primary_group to seller_profiles
ALTER TABLE seller_profiles 
ADD COLUMN primary_group TEXT;

-- Update existing sellers based on their first category
-- (manual or via admin after deployment)
```

### BecomeSellerPage Changes

- Step 1: Select parent group (locks the group)
- Step 2: Select categories within that group only  
- Store `primary_group` when creating seller profile

### CategoryGroupPage Query Update

```typescript
// Current (shows sellers from any overlapping category)
query = query.overlaps('categories', categoryValues);

// Updated (filter by primary group)
query = query.eq('primary_group', category);
```

### Capacitor Config for Production

```typescript
const config: CapacitorConfig = {
  appId: 'app.lovable.b3f6efce9b8e4071b39db038b9b1adf4',
  appName: 'Greenfield Community', // Updated name
  webDir: 'dist',
  // server block removed for production
  plugins: {
    SplashScreen: { ... },
    StatusBar: { ... },
    PushNotifications: { ... },
  },
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/BecomeSellerPage.tsx` | Store `primary_group`, enforce group restriction |
| `src/pages/SellerSettingsPage.tsx` | Display primary group, restrict category edits |
| `src/pages/SellerProductsPage.tsx` | Filter product categories by seller's group |
| `src/pages/CategoryGroupPage.tsx` | Query by `primary_group` |
| `capacitor.config.ts` | Add production config notes, update app name |
| `STORE_METADATA.md` | Update descriptions for super-app |
| Database migration | Add `primary_group` column |

---

## Summary

The category system is already 90% correct:
- Database-driven with admin toggle control
- Active/inactive filtering works
- All categories properly seeded

The main fix needed is **seller group enforcement** so sellers stay within one parent group, preventing cross-category leakage. This requires a new `primary_group` column and updates to seller registration and category pages.

For app store deployment, we need to update the Capacitor config for production builds and refresh the store metadata to reflect the expanded super-app scope.
