

# Redesign: Split Store Settings into Step-by-Step Tabbed Sections

## Current Problem
The `SellerSettingsPage.tsx` (428 lines) renders ~12 different settings groups in one long scrollable page. This is overwhelming, especially on mobile.

## Proposed Structure: Horizontal Tab Navigation

Instead of a wizard (which implies linear progression), we'll use a **scrollable horizontal tab bar** at the top — sellers can jump to any section freely. Each tab renders only its section's content. The sticky Save button remains at the bottom across all tabs.

### Tab Layout

| Tab | Icon | Contents |
|---|---|---|
| **Store Info** | `Building2` | Business name, description, primary group, categories |
| **Photos** | `Camera` | Cover image, profile photo |
| **Location** | `MapPin` | Store location (existing `StoreLocationSection`) |
| **Hours & Days** | `Clock` | Operating days, availability hours, vacation mode |
| **Payments** | `Banknote` | Payment methods (pickup/delivery configs), UPI ID, minimum order amount |
| **Delivery** | `Truck` | Fulfillment mode, delivery note, cross-society sales, delivery radius |
| **Payouts** | `Building2` | Bank account details, license upload |

The **Pause/Resume** card and **status banner** stay pinned above the tabs (always visible).

## Implementation

### Files Changed

| File | Change |
|---|---|
| `src/pages/SellerSettingsPage.tsx` | Refactor into tab-based layout with 7 tab panels. Add `activeTab` state. Extract each section into its own render block. Keep the sticky Save button. Service availability and preview link move into relevant tabs. |

### Key Details

- **State**: Single `activeTab` string state, defaults to `'store-info'`
- **Tab bar**: Horizontal scrollable row of small pill buttons (like the onboarding step indicators), using existing `cn()` utility for active styling
- **No new files**: All sections remain inline in the same page component — just conditionally rendered based on `activeTab`
- **Save button**: Stays fixed at bottom, works across all tabs (saves entire `formData` as today)
- **`useSellerSettings` hook**: No changes needed — the hook already manages all form state centrally
- **Mobile-first**: Tab pills are scrollable horizontally with `overflow-x-auto`, each ~70px wide with icon + label

### Tab bar UI sketch

```text
┌─────────────────────────────────────────────┐
│ ← Store Settings                            │
├─────────────────────────────────────────────┤
│ [Store Open ✓]  [Pause Shop]                │
├─────────────────────────────────────────────┤
│ Store Info | Photos | Location | Hours | ... │  ← scrollable
├─────────────────────────────────────────────┤
│                                             │
│   (Only the active tab's content renders)   │
│                                             │
├─────────────────────────────────────────────┤
│          [ Save Changes ]                   │
└─────────────────────────────────────────────┘
```

