

## Plan: Progressive Profile Completion (Zomato/Swiggy Pattern)

### Current Problem

The Profile Edit page (`/profile/edit`) dumps everything on one screen: name, phone, society info, flat number, block, phase, AND a full delivery address form with GPS/map. This violates the progressive disclosure pattern that top delivery apps use. The user sees a wall of fields, many of which feel redundant (flat/block appears twice — once under "Society Address" and again in the delivery address form).

Additionally, push notification permission is requested on login via `attemptRegistration`, which only checks existing permissions but never triggers the OS prompt. The prompt should come after a meaningful user action (e.g., first order placed), not at login.

### Design: Progressive Profile Completion

Following Zomato/Swiggy/Blinkit, the profile should be built incrementally:

```text
Login (Phone + OTP)
  ↓
Society Selection (already done during signup)
  ↓
Homepage (with "Complete Profile" banner)
  ↓
/profile/edit — Clean, focused sections:
  Section 1: Your Details (Name, Flat, Block, Tower)
  Section 2: Delivery Addresses (GPS + Map + structured fields)
```

The key insight: **Society membership** (flat/block/tower) and **delivery addresses** are separate concerns. Society membership = identity within the community. Delivery address = where orders go (could be same society or different).

### Changes

**1. Redesign `src/pages/ProfileEditPage.tsx` — Clean Two-Section Layout**

Remove the confusing three-section layout. Replace with:

- **Section 1: "Your Details"** — One card with: Name (editable), Phone (read-only), Society (read-only chip, not a disabled input showing "Not assigned"), Flat Number, Block/Tower, Phase/Wing. Single "Save" button.
  - If no society assigned, show a subtle note: "Society will be assigned based on your delivery address" instead of the jarring "Not assigned" input.
  - Remove redundant "Personal Information" and "Society Address" headers — merge into one clean section.

- **Section 2: "Delivery Addresses"** — Existing address cards + "Add New" button. The AddressForm is already well-built (GPS detect, map pin, structured fields, label chips). Keep it as-is but remove the `block` field from AddressForm since block/tower already lives in the profile section. Add `society_id` linkage to auto-populate building_name from society name.

**2. Smart Defaults — Pre-populate address from society**

When user clicks "Add New" address and has a society assigned:
- Auto-fill `building_name` with society name
- Auto-fill `latitude`/`longitude` from society coordinates
- Auto-fill `pincode` from society pincode
- User just needs to confirm location on map + add flat/landmark

**3. Push Notification Timing — After First Cart Action**

Per Swiggy's pattern (and the user's research), move the notification permission prompt to after the first meaningful action. The current code already has a hook in `useCartPage` that calls `requestFullPermission` after placing an order. This is the correct place.

The login flow in `usePushNotifications.ts` (lines 1148-1173) currently calls `attemptRegistration` which only checks permissions but never requests them. Change this so:
- On login: only call `attemptRegistration` (silent re-register if already granted) — **keep as-is**
- Remove the `setPushStage('full')` call on login (line 1140-1141) — this prematurely marks stage as 'full' even though no prompt was shown
- The first prompt should come from `EnableNotificationsBanner` or cart checkout — **already implemented correctly**

The actual issue is that `setPushStage('full')` on line 1141 marks the stage as complete before any prompt happens, which prevents future prompts. Fix: only set stage to 'full' after `requestFullPermission` actually succeeds.

**4. Profile Completion Progress on Homepage**

Update the incomplete profile banner on HomePage to show what's missing specifically:
- Missing name → "Add your name"
- Missing flat number → "Add your flat number"  
- No delivery address → "Add a delivery address"

Show as a progress indicator: "Profile 60% complete — Add flat number to enable orders"

### Files Affected

| File | Change |
|------|--------|
| `src/pages/ProfileEditPage.tsx` | Redesign to two clean sections, smart defaults from society |
| `src/pages/HomePage.tsx` | Upgrade incomplete profile banner with progress + specific prompts |
| `src/hooks/usePushNotifications.ts` | Remove premature `setPushStage('full')` on login (line 1140-1141) |
| `src/components/profile/AddressForm.tsx` | Remove duplicate block field, accept society defaults as props |

### What stays unchanged
- `useDeliveryAddresses.ts` — works correctly
- `AddressCard.tsx` — display is fine
- `AddressPicker.tsx` — checkout integration stays
- `OnboardingWalkthrough.tsx` — onboarding slides stay as-is
- Push notification core architecture (FROZEN) — only removing the premature stage setter

### UX Flow After Changes

```text
New User:
  Phone + OTP → Society Selection → Onboarding Slides → Homepage
    ↓
  Banner: "Complete your profile (40%)" → tap "Update"
    ↓
  /profile/edit:
    Card 1: Name, Flat, Block (one-tap save)
    Card 2: Delivery Addresses
      → "Add Address" → GPS auto-detect → Map pin → Flat + Landmark → Save
    ↓
  Back to Homepage (banner gone, profile 100%)
    ↓
  Browse → Add to cart → Place order
    ↓
  Push notification permission prompt appears ← (Swiggy pattern)
```

