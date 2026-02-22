

# Sociva -- Critical Hardcoding and Dynamic Integrity Audit v3

## Executive Summary

The Sprint 1-4 and v2 remediation passes have resolved the majority of structural issues. The system is meaningfully config-driven for financial logic, contact info, legal pages, pricing, and feature flags. However, **11 remaining gaps** exist, including one critical item (currency symbol not adopted despite utility existing) and several medium-severity issues that would surface during investor scrutiny or multi-tenant deployment.

---

## 1. CRITICAL HARDCODING INVENTORY

### C1. Currency Symbol "₹" Still Hardcoded in 54 Files (formatPrice Exists But Is Unused)

- **Files:** 54 component files including CartPage, ProductCard, ProductDetailSheet, EarningsSummary, CouponInput, MaintenancePage, SocietyFinancesPage, SellerCard, SellerOrderCard, OrderDetailPage, etc.
- **What Happened:** `formatPrice()` was created in `src/lib/format-price.ts` and `currencySymbol` was added to `useSystemSettings`, but zero files import or use them. Every single price display still uses bare `₹` template literals.
- **Risk:** This is a "config exists but does nothing" gap identical to the old platform fee problem. If someone inspects the codebase or tries to change the currency, they'll find the setting is completely decorative.
- **Fix:** Replace all `₹${amount}` with `formatPrice(amount, settings.currencySymbol)` across all 54 files. This is mechanical but high-volume.
- **Severity:** Critical (architectural credibility gap)
- **Effort:** Medium (bulk find-and-replace with context)

### C2. "Sociva" Brand Still Hardcoded in 4 Files Despite `platformName` Existing

- **Files:**
  - `AuthPage.tsx` line 402: `<h1>Sociva</h1>` -- the login screen title
  - `LandingPage.tsx` line 184: `"-- The Sociva Team"`
  - `SearchPage.tsx` line 47: `sociva_search_filters` localStorage key
  - `useDeepLinks.ts` lines 10-17, 37: `sociva://` URL scheme in comments and code
- **What Happened:** `platformName` is used in TermsPage, PrivacyPolicyPage, ProfilePage, and CommunityRulesPage, but these 4 files were missed.
- **Risk:** Login screen and landing page are the first thing an investor or white-label client sees.
- **Fix:** Replace with `settings.platformName` in AuthPage and LandingPage. Change `sociva_search_filters` to `app_search_filters`. Deep link scheme is acceptable as a technical constant.
- **Severity:** Critical (visible on first screen)
- **Effort:** Low

### C3. Food-Biased Copy in CommunityRulesPage DEFAULT_RULES

- **File:** `CommunityRulesPage.tsx` lines 28, 36
- **Content:** "Maintain food safety and hygiene standards", "Misrepresent food items or ingredients"
- **What Happened:** The violation consequences were made dynamic (violationPolicyJson), but the default DO/DON'T rules for sellers still reference food specifically.
- **Risk:** A services-only or shopping-focused society would see irrelevant food hygiene rules.
- **Fix:** Change to generic seller rules: "Maintain quality and safety standards", "Misrepresent products or services". Or make DEFAULT_RULES configurable via system_settings.
- **Severity:** High
- **Effort:** Low (text change)

---

## 2. HIGH SEVERITY GAPS

### H1. Price Range Filter Max Hardcoded at 5000

- **Files:** `SearchFilters.tsx` lines 26, 47, 209
- **Content:** `priceRange: [0, 5000]`, `max={5000}`, `filters.priceRange[1] < 5000`
- **Also:** `SearchPage.tsx` lines 257, 502 use `5000` as the max price boundary
- **Risk:** Products priced above 5000 (electronics, furniture, services) will be filtered out by default. No way to configure this per society.
- **Fix:** Add `max_price_filter` to `system_settings` (default 5000). Read in SearchFilters and SearchPage.
- **Severity:** High (data visibility issue)
- **Effort:** Low

### H2. PRICE_TIER_MAP Still Contains Hardcoded ₹ Symbol

- **File:** `PricingPage.tsx` lines 53-57
- **Content:** `pro: { price: '₹199', ... }, enterprise: { price: '₹999', ... }`
- **Issue:** While the code now prefers `price_amount` from DB, the fallback map uses `₹` literally instead of `currencySymbol`.
- **Fix:** Use `${currencySymbol}199` pattern or remove hardcoded prices from fallback since DB columns now exist.
- **Severity:** High (inconsistency with config-driven claim)
- **Effort:** Low

### H3. "All prices are in INR" Hardcoded on Pricing Page

- **File:** `PricingPage.tsx` line 182
- **Content:** `"All prices are in INR. GST applicable where required."`
- **Risk:** Contradicts any currency configurability claim.
- **Fix:** Use `settings.currencySymbol` to derive currency name, or make this footer configurable.
- **Severity:** High
- **Effort:** Low

---

## 3. MEDIUM SEVERITY GAPS

### M1. Landing Page Marketing Copy Not Configurable

- **File:** `LandingPage.tsx` lines 80-213
- **Content:** 5 slides with hardcoded text: "Your Society. Your Marketplace.", "Only Verified Residents", "Turn Your Passion Into Income", etc.
- **Status:** `landingSlidesJson` was added to `useSystemSettings` but is never read in `LandingPage.tsx`. The setting exists as dead configuration.
- **Fix:** Parse `settings.landingSlidesJson` in LandingPage and use it when non-empty, falling back to current slides.
- **Severity:** Medium (white-label blocker)
- **Effort:** Medium

### M2. Seller Onboarding Placeholder Text Hardcoded Per Group

- **File:** `BecomeSellerPage.tsx` lines 757-761
- **Content:** `selectedGroup === 'food' ? "e.g., Amma's Kitchen, Fresh Bakes" : ...`
- **Risk:** New parent groups added by admin will get the generic fallback "e.g., Your Store Name" -- acceptable but not polished.
- **Fix:** Add `placeholder_hint` column to `parent_groups` table. Low priority.
- **Severity:** Medium
- **Effort:** Low

### M3. Help Sections Default to Hardcoded Array Despite DB Setting

- **File:** `HelpPage.tsx` lines 28-76
- **Status:** The page reads `settings.helpSectionsJson` and parses it, but the JSON format requires icon names as strings that must map to Lucide components. This mapping is incomplete -- the HelpPage only maps 4 icons (ShoppingBag, Store, CreditCard, MessageCircle). A CMS-driven help section with different icons would fail silently.
- **Fix:** Expand icon mapping or use a generic icon fallback.
- **Severity:** Medium
- **Effort:** Low

### M4. SearchPage localStorage Key Still Uses "sociva_" Prefix

- **File:** `SearchPage.tsx` line 47
- **Content:** `const FILTER_STORAGE_KEY = 'sociva_search_filters';`
- **Status:** ProfilePage and tooltip-guide were fixed to use `app_` prefix, but SearchPage was missed.
- **Fix:** Change to `app_search_filters`.
- **Severity:** Medium (white-label leak)
- **Effort:** Trivial

### M5. Onboarding localStorage Key "hasSeenOnboarding" Not Prefixed

- **File:** `OnboardingWalkthrough.tsx` lines 141, 149, 154
- **Content:** `localStorage.getItem('hasSeenOnboarding')`
- **Risk:** Could collide with other apps on the same domain.
- **Fix:** Change to `app_has_seen_onboarding`.
- **Severity:** Low
- **Effort:** Trivial

---

## 4. LOW SEVERITY (Future-Proofing)

### L1. "en-IN" Locale Hardcoded in Date/Number Formatting

- **Files:** `format-price.ts`, `PaymentMilestonesPage.tsx`, `BuilderAnalyticsPage.tsx`, `PostDetailSheet.tsx`
- **Content:** `toLocaleDateString('en-IN', ...)`, `toLocaleString('en-IN', ...)`
- **Risk:** Blocks localization for non-Indian deployments.
- **Fix:** Add `locale` to `system_settings`. Very low priority for India-only launch.
- **Severity:** Low
- **Effort:** Low

### L2. AUTOPLAY_INTERVAL (8000ms) and Urgent Timer (3 min) Hardcoded

- **Files:** `LandingPage.tsx` line 14, `CartPage.tsx` line 282
- **Risk:** Minor UX constants. 3-min urgent timer is enforced server-side so frontend display is cosmetic.
- **Severity:** Low
- **Effort:** Trivial

---

## 5. UI-TO-BACKEND INTEGRITY CHECK

| Area | Status | Notes |
|------|--------|-------|
| Feature flags (FeatureGate) | OK | Enforced via DB function + UI gating |
| Role checks | OK | Server-side via user_roles table + RLS |
| Order status transitions | OK | Enforced by DB trigger |
| Platform fee calculation | OK | Now reads from system_settings in RPC |
| Delivery fee | OK | Reads from system_settings |
| Pricing display | Partial | DB columns exist but PRICE_TIER_MAP fallback has ₹ |
| Currency display | FAIL | formatPrice exists but is never imported anywhere |
| Legal CMS | OK | ReactMarkdown renders DB content, falls back to HTML |
| Help CMS | Partial | JSON parsing works but icon mapping is limited |
| Landing slides CMS | FAIL | Setting exists but LandingPage never reads it |
| Violation policy CMS | OK | Reads from violationPolicyJson |
| Contact emails | OK | All pages use settings |
| Address labels | OK | Auth page uses settings |
| Platform name | Partial | 4 files still use "Sociva" literally |

---

## 6. PRIORITIZED EXECUTION ROADMAP

### Phase 1 -- Critical (Before Any Demo)

| # | Gap | Files | Effort |
|---|-----|-------|--------|
| C2 | Fix "Sociva" in AuthPage, LandingPage, SearchPage | 3 files | 15 min |
| C3 | Fix food-biased community rules text | 1 file | 5 min |
| H2 | Fix ₹ in PRICE_TIER_MAP fallback | 1 file | 5 min |
| H3 | Fix "All prices are in INR" text | 1 file | 5 min |
| M4 | Fix sociva_ localStorage key in SearchPage | 1 file | 2 min |

### Phase 2 -- Structural (Currency Symbol Adoption)

| # | Gap | Files | Effort |
|---|-----|-------|--------|
| C1 | Replace ₹ with formatPrice() across 54 files | 54 files | 2-3 hours |
| H1 | Add max_price_filter to system_settings | 3 files + migration | 30 min |

### Phase 3 -- CMS Completion

| # | Gap | Files | Effort |
|---|-----|-------|--------|
| M1 | Wire landingSlidesJson into LandingPage | 1 file | 30 min |
| M3 | Expand HelpPage icon mapping | 1 file | 15 min |
| M2 | Add placeholder_hint to parent_groups | 2 files + migration | 30 min |

### Phase 4 -- Cleanup

| # | Gap | Effort |
|---|-----|--------|
| M5 | Prefix onboarding localStorage key | 5 min |
| L1 | Configurable locale | Low priority |
| L2 | Configurable carousel interval | Trivial |

---

## Summary Scorecard

| Category | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| Critical | 3 | 0 | 3 |
| High | 3 | 0 | 3 |
| Medium | 5 | 0 | 5 |
| Low | 2 | 0 | 2 |

**Overall Assessment:** The platform has strong config-driven bones but the currency symbol gap (C1) is the single largest credibility risk -- a utility was created but never connected. Phase 1 fixes are all under 30 minutes combined and should be done immediately. Phase 2 (currency adoption) is the most impactful structural change.

