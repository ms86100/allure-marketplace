

## Plan: Single-Flow Profile Edit with Google Maps Autocomplete for Society/Location

### What Changes

**`src/pages/ProfileEditPage.tsx`** — Complete layout rewrite:
- Remove flat/block/phase fields from profile section entirely
- Section 1 (top): **Delivery Address** — auto-opens AddressForm if no address exists
- Section 2 (bottom): **Your Name** card — just name input (placeholder: "Enter your full name") + phone read-only + Save
- On address save, sync `flat_number` and `block` back to `profiles` table automatically

**`src/components/profile/AddressForm.tsx`** — Add Google Maps autocomplete search:
- Add a search input at the top (using existing `useAutocomplete` hook from `useGoogleMaps.ts`) so users can type and select their society/location from Google Places autocomplete — same as Swiggy/Zomato search bar
- When user selects a prediction, auto-fill coordinates, address, building name, pincode from place details
- Then show map for confirmation
- Keep existing GPS detect button as alternative option
- Add `phase` field to the structured fields
- Two ways to set location: (1) search via autocomplete, (2) GPS detect — both lead to map confirmation

### Flow

```text
/profile/edit:
  ┌─────────────────────────────┐
  │ Delivery Address            │
  │ 🔍 Search society/location  │  ← Google Maps autocomplete
  │ — OR —                      │
  │ 📍 Use current location     │  ← GPS detect
  │ [Map confirmation]          │
  │ Flat, Floor, Block/Tower,   │
  │ Building, Phase, Landmark,  │
  │ Pincode                     │
  │ [Save Address]              │
  └─────────────────────────────┘
  ┌─────────────────────────────┐
  │ Your Name                   │
  │ [Enter your full name]      │
  │ Phone: +91 xxx (locked)     │
  │ [Save]                      │
  └─────────────────────────────┘
```

### Files

| File | Change |
|------|--------|
| `src/pages/ProfileEditPage.tsx` | Remove unit fields, reorder sections, sync flat/block to profile on save |
| `src/components/profile/AddressForm.tsx` | Add Google Maps autocomplete search input + phase field |

