

# Redesign Onboarding: Break Step 3 into a Guided, Story-like Flow

## Problem
Step 3 ("Configure your store") crams 6 distinct configuration blocks into one scrollable page: fulfillment, payments, operating days, store images, buyer interaction mode, and service availability. This overwhelms sellers.

## Solution
Split the current 5-step flow into a **7-step guided journey** where each step has one clear decision. The experience uses a conversational tone, smooth transitions (already using framer-motion), and contextual hints.

### New Step Structure

```text
Step 1: What do you sell?          (unchanged — category search)
Step 2: Your Store Identity        (unchanged — name, description, hours, location, license, beyond-community)
Step 3: How do buyers interact?    (NEW — just the interaction mode cards)
Step 4: Delivery & Payments        (NEW — fulfillment + payment methods combined, as they're related)
Step 5: Schedule & Availability    (NEW — operating days + service availability if needed)
Step 6: Store Images               (NEW — profile + cover, framed as "Make it yours")
Step 7: Add Products               (was step 4)
Step 8: Review & Submit            (was step 5)
```

Wait — 8 steps feels like too many in the stepper. Better approach: **keep 5 visual steps in the progress bar** but use **sub-steps within Step 3** that feel like a guided carousel rather than a long form.

### Refined Architecture: 5 Steps, Step 3 has Sub-Steps

```text
Step 1: What do you sell?          (category picker)
Step 2: Store Details              (name, description, hours, location, license)
Step 3: Configure (guided)         (4 mini-steps with internal navigation)
  → 3a: How buyers interact       (interaction mode cards — one decision)
  → 3b: Delivery & Payments       (fulfillment mode + COD/UPI toggles)
  → 3c: Schedule                  (operating days + service availability if booking)
  → 3d: Store Images              (profile + cover — "Make your store shine")
Step 4: Add Products
Step 5: Review & Submit
```

This keeps the top-level progress bar clean (5 steps) while each sub-step shows only 1-2 related decisions.

## UX Design

### Sub-step navigation inside Step 3
- A small **dot indicator** (4 dots) below the main stepper shows progress within Step 3
- Each sub-step has a **"Continue" button** at the bottom and a **back arrow** at top
- Sub-steps use the existing `AnimatePresence` + `motion.div` for smooth slide transitions
- Each sub-step has a **friendly headline** and **one-line helper**:
  - 3a: "How will buyers interact?" / "This sets the default — you can customize per product later"
  - 3b: "Delivery & Payments" / "How do you get products to buyers, and how do they pay?"
  - 3c: "When are you open?" / "Select your operating days" (+ availability if booking mode)
  - 3d: "Make your store shine ✨" / "Add photos to build trust — you can skip this for now"

### Sub-step 3d (Images) gets a "Skip" option
- Images are optional, so this sub-step has a clear "Skip for now" link below the Continue button

### Validation per sub-step
- 3a: Must select an interaction mode (pre-selected from category default, so always valid)
- 3b: At least one payment method; if UPI enabled, UPI ID required
- 3c: At least 1 operating day selected
- 3d: No validation (optional)

## Technical Implementation

### STEP_META update
Change from 5 entries to still 5 top-level entries (labels stay the same). Step 3's label changes from "Settings" to "Configure".

### New state: `configSubStep` (1-4)
- Added alongside existing `step` state
- Reset to 1 whenever `step` transitions to 3
- "Continue" in sub-step increments `configSubStep`; at sub-step 4, the main "Continue to Products" button advances to step 4

### Step 3 rendering
Replace the current single `{step === 3 && (...)}` block with:
```
{step === 3 && (
  <div>
    {/* Sub-step dots */}
    <SubStepDots current={configSubStep} total={4} />
    
    <AnimatePresence mode="wait">
      {configSubStep === 1 && <InteractionModeStep ... />}
      {configSubStep === 2 && <DeliveryPaymentStep ... />}
      {configSubStep === 3 && <ScheduleStep ... />}
      {configSubStep === 4 && <StoreImagesStep ... />}
    </AnimatePresence>
  </div>
)}
```

Each sub-step is extracted as a small inline component within the same file for simplicity (no new files needed).

### SubStepDots component
A row of 4 small dots (filled = completed/active, empty = upcoming). Rendered just below the main stepper when on step 3.

### Files Changed

| File | Change |
|---|---|
| `src/pages/BecomeSellerPage.tsx` | Add `configSubStep` state; split Step 3 into 4 animated sub-steps; add dot indicator; extract each section into its own sub-step render block |

No database changes. No new files needed. The existing framer-motion dependency handles transitions.

### Key Decisions
- **No new routes or pages** — sub-steps are purely internal state within the same page
- **sessionStorage** persists `configSubStep` alongside `storeActionType` to survive refresh
- **Back navigation**: sub-step 1 goes back to Step 2; sub-steps 2-4 go to previous sub-step
- **The main progress stepper** still shows 5 dots — Step 3 just takes longer to complete, which feels natural

