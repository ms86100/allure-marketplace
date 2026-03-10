

## Plan: Profile Edit Page with Delivery Address Management

### Problem
When a new user clicks "Complete your profile to enable delivery orders," they land on the Profile page which only displays info but has no way to edit name, society, flat number, or delivery address. The current address model is minimal — just `flat_number`, `block`, and `phase` fields on the `profiles` table, with the society providing the base location. There is no dedicated address entry or management system.

### Research: How Blinkit/Zomato Handle Addresses

These platforms use a multi-layered approach:
1. **GPS auto-detect** → detect current location, reverse-geocode to show address
2. **Map pin** → user drags pin to exact location for precision
3. **Structured fields** → house/flat number, floor, building/society name, landmark
4. **Address labels** → save as "Home", "Work", or custom label
5. **Multiple saved addresses** → switch between addresses at checkout

For Sociva, the model is society-based (users belong to a specific society), so the approach differs slightly — the society IS the base location, and the user provides flat/block details within it.

### Solution: Two-Part Implementation

**Part A: Profile Edit Page** — a new `/profile/edit` page with editable fields for name, flat number, block, phase. The "Update" link and profile page will route here.

**Part B: Delivery Address System** — a `delivery_addresses` table allowing users to save multiple addresses with map-pinned locations, structured fields, and labels.

### Changes

**1. Database Migration — `delivery_addresses` table**

```sql
CREATE TABLE public.delivery_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL DEFAULT 'Home',        -- Home, Work, Other
  flat_number text NOT NULL DEFAULT '',
  block text DEFAULT '',
  floor text DEFAULT '',
  building_name text DEFAULT '',             -- society/apartment name
  landmark text DEFAULT '',
  full_address text DEFAULT '',              -- reverse-geocoded or typed
  latitude double precision,
  longitude double precision,
  pincode text DEFAULT '',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.delivery_addresses ENABLE ROW LEVEL SECURITY;

-- Users can only CRUD their own addresses
CREATE POLICY "Users manage own addresses" ON public.delivery_addresses
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

**2. New page: `src/pages/ProfileEditPage.tsx`**

Editable form with sections:
- **Personal Info**: Name (text input), Phone (read-only, from auth)
- **Society Address**: Society name (read-only or searchable like signup), Flat Number, Block, Phase/Tower
- **Delivery Addresses**: List of saved addresses with add/edit/delete, each having:
  - Label selector (Home / Work / Other)
  - "Use current location" button → GPS → reverse geocode → auto-fill
  - Map pin (reusing existing `GoogleMapConfirm` component)
  - Flat/House number, Floor, Building/Society name, Landmark
  - Pincode
  - "Set as default" toggle

**3. New component: `src/components/profile/AddressForm.tsx`**

Reusable address entry form with:
- GPS location detect button (using existing `src/lib/native-location.ts`)
- Inline map with draggable pin (reusing `GoogleMapConfirm` pattern)
- Structured fields: flat, floor, building, landmark, pincode
- Label chips: Home | Work | Other
- Save button

**4. Update `src/pages/ProfilePage.tsx`**

- Add "Edit Profile" button in the profile header section
- Add "Manage Addresses" section showing saved delivery addresses
- Link to `/profile/edit`

**5. Update `src/pages/HomePage.tsx`**

- Change the "Update" link from `/profile` to `/profile/edit`

**6. Update `src/pages/CartPage.tsx`**

- Make the address card interactive — allow selecting from saved delivery addresses
- Show "Change" button linking to address picker

**7. Route registration**

- Add `/profile/edit` route in the router

### Files Affected

| File | Change |
|------|--------|
| DB migration | Create `delivery_addresses` table with RLS |
| `src/pages/ProfileEditPage.tsx` | New — edit name, flat, block + manage addresses |
| `src/components/profile/AddressForm.tsx` | New — address entry with GPS + map pin + structured fields |
| `src/components/profile/AddressCard.tsx` | New — display saved address with edit/delete |
| `src/components/profile/AddressPicker.tsx` | New — select address sheet for checkout |
| `src/pages/ProfilePage.tsx` | Add edit button + addresses section |
| `src/pages/HomePage.tsx` | Update link to `/profile/edit` |
| `src/pages/CartPage.tsx` | Make address interactive with picker |
| Router config | Add `/profile/edit` route |

### UX Flow

```text
New User OTP → Onboarding Slides → Homepage
  ↓ (banner: "Complete your profile")
  → /profile/edit
    Step 1: Name, Flat Number, Block
    Step 2: Add Delivery Address
      → "Use my location" (GPS)
      → Map with draggable pin
      → Flat, Floor, Building, Landmark, Pincode
      → Label: Home / Work / Other
    → Save → redirects to homepage
```

### Reused Existing Components
- `GoogleMapConfirm` — map with draggable pin + reverse geocoding
- `getCurrentPosition()` from `src/lib/native-location.ts` — GPS detection
- Google Maps JS SDK already loaded in the project

