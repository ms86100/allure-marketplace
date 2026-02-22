
# Hardcoded Logic and Fragile Implementation Audit

## Executive Summary

This audit identifies **23 hardcoded or fragile implementations** across the codebase that would break investor confidence during a live demo. The issues range from financial logic that should be database-driven to static content that contradicts the platform's config-driven architecture philosophy.

---

## CRITICAL (Demo-Breaking, Financial Risk)

### 1. Delivery Fee Calculated Client-Side with Magic Numbers

**Files:** `CartPage.tsx` (lines 34, 36, 399), `manage-delivery/index.ts` (lines 417-418)

The delivery fee is hardcoded as `₹20` with a free threshold of `₹500` in two separate places (frontend and edge function). Neither reads from the database.

```
const freeDeliveryThreshold = 500;
const effectiveDeliveryFee = totalAmount >= freeDeliveryThreshold ? 0 : 20;
```

**Risk:** An investor asks "Can different societies have different delivery fees?" -- the answer is technically "no" despite the architecture claiming config-driven behavior. The edge function's `calculate_fee` endpoint duplicates the same magic numbers, creating a single-point-of-failure if values diverge.

**Fix:** Store `base_delivery_fee`, `free_delivery_threshold`, and `distance_surcharge` in a `delivery_config` table scoped to society_id. CartPage should call the `calculate_fee` edge function endpoint instead of computing locally.

---

### 2. Pricing Page is 100% Static

**File:** `PricingPage.tsx` (lines 8-67)

All four pricing tiers (Free Buyers, Free Sellers, Seller Pro ₹199, Society Plan ₹999) are hardcoded arrays in the component. The platform has a full `feature_packages` and `platform_features` infrastructure in the database, but the pricing page ignores all of it.

**Risk:** If an admin changes a package price or feature list in the backend, the pricing page still shows stale data. During a demo, someone changes a price in the admin panel -- the pricing page contradicts it.

**Fix:** Fetch from `feature_packages` table joined with `feature_package_items` and `platform_features`. Render dynamically. The "Contact Us" CTA (which opens a mailto link) should also be configurable.

---

### 3. Platform Fee is Always Zero

**File:** `create_multi_vendor_orders` RPC function

The RPC inserts payment records with `platform_fee = 0` and `net_amount = _final_amount`. There is no database setting or config for platform commission rate.

**Risk:** The platform has no revenue model in the database. Seller earnings page shows `net_amount` which equals `amount` (no fee deducted). If an investor asks "What's your take rate?" there's no mechanism to enforce it.

**Fix:** Add `platform_fee_percent` to `system_settings` or a `commission_config` table. Compute `platform_fee = ROUND(amount * fee_percent / 100, 2)` and `net_amount = amount - platform_fee` inside the RPC.

---

## HIGH (Functional Gaps, Inconsistency During Demo)

### 4. App Version Hardcoded

**File:** `ProfilePage.tsx` (line 33)

```
const APP_VERSION = '2.0.0';
```

This is never updated automatically. It will remain "2.0.0" forever unless manually changed.

**Fix:** Read from `package.json` version via Vite's `define` config, or store in `system_settings`.

---

### 5. Onboarding Walkthrough Content is Static

**File:** `OnboardingWalkthrough.tsx` (lines 10-35)

All four walkthrough slides are hardcoded:
- "Buy homemade food and local goods..."
- "Browse sellers, add items to cart..."
- "Pick up from the seller's home..."
- "All sellers are verified society residents..."

These are generic and cannot be customized per society or builder.

**Fix:** Store onboarding slides in a `system_settings` key (e.g., `onboarding_slides`) as JSON, or in a dedicated `onboarding_content` table. Allow society admins to customize.

---

### 6. Landing Page Categories are Hardcoded

**File:** `LandingPage.tsx` (lines 109-116)

The "What You Can Do" section lists: Home Food, Classes, Services, Rentals, Buy & Sell, Coupons. These are frontend constants, not fetched from `parent_groups` or `category_config`.

**Risk:** If an admin adds or removes a parent group, the landing page shows stale categories.

**Fix:** Fetch `parent_groups` dynamically. The LandingPage already fetches stats from the database -- extend it to fetch groups too.

---

### 7. Community Rules and Violation Consequences are Static

**File:** `CommunityRulesPage.tsx` (lines 6-45)

The rules (buyer do's/don'ts, seller do's/don'ts) and violation consequences (Warning, Temporary Suspension, Permanent Ban) are hardcoded arrays. The `societies` table has a `rules_text` field that is never used here.

**Fix:** Fetch `societies.rules_text` for the current society. If null, fall back to the hardcoded defaults. Allow society admins to customize rules.

---

### 8. Help Page Content is Static

**File:** `HelpPage.tsx` (lines 19-62)

Four help sections (How to Order, Becoming a Seller, Payments, Chat & Communication) are hardcoded. The Grievance Officer details (name, email, response time) are also static.

**Fix:** Store help content in a `system_settings` key or a `help_sections` table. Grievance officer details should come from a config table.

---

### 9. Contact Emails Hardcoded Across Multiple Files

**Files:** `HelpPage.tsx` (grievance@sociva.in), `TermsPage.tsx` (support@sociva.com), `PrivacyPolicyPage.tsx` (dpo@sociva.com), `PricingPage.tsx` (support@sociva.com)

Four different email addresses are scattered across files with no single source of truth. These should all come from one config entry.

**Fix:** Add `support_email`, `grievance_email`, `dpo_email` to `system_settings`. Read dynamically in all pages.

---

### 10. Profile Page "Start Selling" CTA Copy is Food-Biased

**File:** `ProfilePage.tsx` (line 219)

```
"Share your homemade food with neighbors"
```

This copy assumes sellers are food vendors. For a platform that supports electronics, services, rentals, etc., this is misleading.

**Fix:** Use a generic or config-driven tagline. Could be "Start selling to your community" or fetched from `system_settings`.

---

### 11. Order Status Labels and Colors are Hardcoded

**File:** `types/database.ts` (lines 321-343)

`ORDER_STATUS_LABELS`, `PAYMENT_STATUS_LABELS`, and `ITEM_STATUS_LABELS` are all hardcoded objects with labels and Tailwind color classes. If a new status is added to the database enum, the UI will crash with undefined lookups.

**Fix:** Low risk since these rarely change, but should defensively handle unknown statuses with a fallback. Consider storing label overrides in `system_settings` for white-labeling.

---

### 12. Status Reassurance Messages are Hardcoded

**File:** `OrderDetailPage.tsx` (lines 252-258)

Buyer-facing status messages like "Waiting for seller to accept. Most sellers respond within 5 minutes." are static strings. The "5 minutes" claim has no data backing.

**Fix:** Make these configurable via `system_settings` or derive wait times from actual `avg_response_minutes` data.

---

## MEDIUM (Polish Issues, Edge Cases)

### 13. `FulfillmentSelector` Default Props Duplicate Magic Numbers

**File:** `FulfillmentSelector.tsx` (line 11)

```
freeDeliveryThreshold = 500
```

This default duplicates the same `500` from CartPage. If one changes, the other doesn't.

**Fix:** Remove the default. Always pass from parent, sourced from config.

---

### 14. Delivery Address Format is Hardcoded Template

**File:** `CartPage.tsx` (line 61)

```
`Block ${profile.block}, Flat ${profile.flat_number}`
```

This template assumes all societies use "Block" and "Flat" terminology. Some societies use "Tower", "Wing", "Villa", etc.

**Fix:** Use a configurable address template from `societies` table or `system_settings`.

---

### 15. Seller Dashboard Empty State is Food-Biased

**File:** `SellerDashboardPage.tsx` (line 128)

```
"Sell homemade food, groceries, or services to your community"
```

Same issue as the ProfilePage CTA -- assumes food-first.

**Fix:** Generic or config-driven copy.

---

### 16. `DAYS_OF_WEEK` is Hardcoded

**File:** `types/database.ts` (line 345)

```
export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
```

This is English-only and uses abbreviated names. For localization, this should be configurable.

**Fix:** Low priority since the app is India-focused, but flag for future i18n.

---

### 17. Booking TimeSlotPicker Has 30-Day Hardcoded Limit

**File:** `TimeSlotPicker.tsx` (line 41)

```
const maxDate = addDays(today, 30); // Allow booking up to 30 days ahead
```

This limit should be configurable per category or seller.

**Fix:** Accept `maxBookingDays` as a prop or read from `category_config`.

---

### 18. Header Tagline is Hardcoded

**File:** `Header.tsx` (line 114)

```
"Your Society, Your Store"
```

For white-labeling (which the Society Plan promises), this needs to be customizable.

**Fix:** Store in `societies` table as `tagline` field or in `system_settings`.

---

### 19. Security Mode "AI Match" Shows "Coming Soon" Badge

**File:** `SecurityModeSettings.tsx` (line 99)

```
<Badge>Coming Soon</Badge>
```

A feature advertised with "Coming Soon" during a demo raises questions about product maturity.

**Fix:** Either hide the option entirely or remove the badge if the feature is planned for a later phase. Use a feature flag from `platform_features` to control visibility.

---

### 20. `MarketplaceSection` Empty State Copy is Static

**File:** `MarketplaceSection.tsx` (line 122)

```
"Sellers from your community are setting up shop. Fresh products, homemade food & services..."
```

Food-biased again, and not customizable per society.

**Fix:** Generic copy or config-driven.

---

## LOW (Cosmetic, Future-Proofing)

### 21. Landing Page Testimonial is Fake

**File:** `LandingPage.tsx` (lines 162-166)

```
"Finally a marketplace just for our community!..."
-- Priya S., Verified Resident
```

This is a fabricated testimonial. If challenged during a demo, it undermines trust.

**Fix:** Either remove or fetch real reviews from the database.

---

### 22. Legal Page Content Should Be Editable

**Files:** `TermsPage.tsx`, `PrivacyPolicyPage.tsx`

Legal text is hardcoded in React components. Any legal update requires a code deployment.

**Fix:** Store in a `legal_documents` table or CMS. Render markdown from the database.

---

### 23. Delivery Address Card Shows "Deliver to" Even for Self-Pickup

**File:** `CartPage.tsx` (lines 453-463)

The address card always says "Deliver to" regardless of fulfillment type. For self-pickup, it should say "Pickup from" with the seller's location.

**Fix:** Conditionally render based on `fulfillmentType`.

---

## Prioritized Implementation Plan

### Sprint 1 (Critical -- Do Before Any Demo)

| # | Gap | Effort | Impact |
|---|-----|--------|--------|
| 1 | Delivery fee from DB config | Medium | Eliminates financial inconsistency |
| 2 | Dynamic pricing page from DB | Medium | Aligns UI with backend reality |
| 3 | Platform fee configuration | Low | Enables revenue model discussion |

### Sprint 2 (High -- For Investor Readiness)

| # | Gap | Effort | Impact |
|---|-----|--------|--------|
| 4 | App version from build | Low | Professionalism |
| 9 | Contact emails from config | Low | Single source of truth |
| 10-15-20 | Remove food-biased copy | Low | Platform credibility |
| 6 | Dynamic landing page categories | Low | Consistency with admin |
| 23 | Fix address label for pickup | Low | UX accuracy |

### Sprint 3 (Medium -- For Production Polish)

| # | Gap | Effort | Impact |
|---|-----|--------|--------|
| 5 | Configurable onboarding | Medium | White-label readiness |
| 7 | Society-specific community rules | Low | Uses existing `rules_text` field |
| 8 | Dynamic help content | Medium | Maintainability |
| 11 | Defensive status label fallbacks | Low | Prevents crashes |
| 12 | Data-driven status messages | Low | Credibility |
| 14 | Configurable address template | Low | Multi-society support |
| 18 | Configurable header tagline | Low | White-label readiness |

### Sprint 4 (Low -- Future-Proofing)

| # | Gap | Effort | Impact |
|---|-----|--------|--------|
| 16 | i18n-ready day labels | Low | Localization prep |
| 17 | Configurable booking window | Low | Flexibility |
| 19 | Remove "Coming Soon" badges | Low | Product maturity |
| 21 | Real testimonials or removal | Low | Trust |
| 22 | CMS for legal pages | Medium | Operational efficiency |

---

## Technical Notes

### Where to store new config values

The project already has two config tables:
- `system_settings` (key-value, global scope) -- Use for: delivery fees, contact emails, app version, tagline, platform fee
- `admin_settings` (key-value with `is_active` flag) -- Use for: fulfillment labels (already used)

For society-scoped config, use the existing `societies` table columns (`rules_text` already exists) or create a `society_config` table for extensibility.

### Config read pattern

The existing `useMarketplaceConfig` hook demonstrates the correct pattern: fetch from DB, fall back to constants, cache with `staleTime`. All new config reads should follow this pattern.

### Migration strategy

New `system_settings` rows can be seeded in a migration with default values matching current hardcoded values. This ensures zero behavior change on deployment while enabling future dynamic updates.
