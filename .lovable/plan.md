

# Fix: Make Store Location Required During Onboarding

## Problem
The seller onboarding flow collects business details, categories, and products but **never requires location**. Location is only available as an optional post-approval action in the seller dashboard. This means approved stores can have `latitude=NULL`, `longitude=NULL`, and `society_id=NULL`, making them completely invisible to buyers.

## Solution
Add a mandatory location step to the seller onboarding flow and block submission if no location is set.

### Changes

**1. `src/hooks/useSellerApplication.ts`**
- Add `latitude` and `longitude` to `SellerFormData` and `INITIAL_FORM`
- Include coordinates in `saveDraft()` and `handleSubmit()` payloads
- Add validation in `handleSubmit()`: block submission if both coordinates and society_id are null
- Add `loadSellerDataIntoForm` to also restore lat/lng from existing drafts

**2. `src/components/seller/SellerOnboardingStep3.tsx` (or equivalent store details step)**
- Embed the existing `SetStoreLocationSheet` component (or a simplified inline version) in the store setup form
- Show a "Store Location" section with a map pin button
- Display a green checkmark when coordinates are set, red warning when missing

**3. `src/hooks/useSellerApplication.ts` → `handleSubmit()` validation**
- Add check: if `!formData.latitude && !profile?.society_id`, show toast error "Please set your store location before submitting"
- This prevents the invisible-store scenario entirely

**4. Seller Dashboard fallback warning**
- In the seller dashboard, if an *already approved* store has no coordinates, show a prominent banner: "Your store is not visible to buyers. Set your store location to appear in search results."
- This handles legacy stores that were approved before this fix

### Flow After Fix
```text
Step 1: Choose Group
Step 2: Select Categories  
Step 3: Store Details + 📍 SET LOCATION (required)
Step 4: Settings (hours, delivery, payment)
Step 5: Add Products
Step 6: Review & Submit (blocked if no location)
```

### No DB migration needed
The `latitude` and `longitude` columns already exist on `seller_profiles`. We just need to write to them during onboarding.

