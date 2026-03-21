

## Full Mobile UX & Responsiveness Audit — Sociva

### A. Summary

**Total Issues Found: 28**
- P0 (Blocker): 4
- P1 (Major): 11
- P2 (Minor): 13
- **Overall Mobile Readiness Score: 7.2 / 10**

The app has solid foundations — safe area utilities exist (`.safe-top`, `.safe-bottom`), dialogs use `max-h-[85vh]`, drawers handle bottom insets, and most pages use `AppLayout` with proper `pb-24`. However, several critical gaps exist particularly around small-screen text overflow, sticky footer occlusion, and inconsistent safe-area handling on pages that bypass `AppLayout`.

---

### B. Top 15 Critical Issues

#### P0-1: CartPage sticky footer occludes content on small screens
**Page:** `/cart` — **Devices:** iPhone SE, iPhone 5s  
The content area uses `pb-[22rem]` but the fixed footer contains dynamic elements (no-payment warning, community text, delivery upsell, Apple disclaimer, total+button). On small screens with multiple banners, the footer can exceed 22rem and overlap the bill details / address section.  
**Fix:** Replace hardcoded `pb-[22rem]` with a dynamic approach — measure footer height via `ResizeObserver` and set padding-bottom accordingly, or increase to `pb-[26rem]` as a safe minimum.

#### P0-2: OrderChat keyboard overlap on Android
**Page:** `/orders/:id` chat overlay — **Devices:** Android 8–10  
The chat uses `useChatViewport` which relies on `visualViewport` API. On older Android webviews (Capacitor), `window.visualViewport` may not fire resize events when the soft keyboard opens, causing the input to hide behind the keyboard.  
**Fix:** The `useChatViewport` hook already has Capacitor `Keyboard` plugin listeners as fallback — verify the `@capacitor/keyboard` plugin is properly installed and synced. If not present, add `resize: "none"` to `android` config in `capacitor.config.ts` and use `Keyboard.setResizeMode({ mode: 'native' })`.

#### P0-3: SellerDetailPage back button unreachable on iPhone 5s
**Page:** `/seller/:id` — **Devices:** iPhone 5s (320px width)  
Back button is positioned at `top-[max(1rem,env(safe-area-inset-top))]` on a full-bleed cover image. On iPhone 5s with no notch, this is 16px from top — but the button is only `w-10 h-10` on a 320px screen next to a Report button + Share button, creating thumb-reach issues.  
**Fix:** Increase back button to `w-11 h-11` and add `left-3` for easier thumb reach on small screens.

#### P0-4: Razorpay iframe status bar overlap (previously identified)
**Page:** Payment flow — **Devices:** All notched iPhones  
Already addressed in previous fixes but needs validation: the `body.razorpay-active::before` backdrop and `top: env(safe-area-inset-top)` positioning must be tested on physical device after `npx cap sync`.

---

#### P1-1: CartPage "Place Order" button disabled without clear reason
**Page:** `/cart` — **All devices**  
When delivery address is not set, the button is disabled but there's no visible error message explaining why. Users see a greyed-out button with no guidance.  
**Fix:** Add a small warning text below the button when `fulfillmentType === 'delivery' && !selectedDeliveryAddress`: "Please select a delivery address above".

#### P1-2: Header location pill text truncation on narrow screens
**Page:** `/` (Home) — **Devices:** iPhone 5s, SE  
Location pill uses `max-w-[50vw]` which on 320px = 160px. With long society names ("Prestige Lakeside Habitat Villas"), the text truncates aggressively and the pill can still push right-side icons off-screen.  
**Fix:** Reduce to `max-w-[40vw]` on screens < 375px using responsive class: `max-w-[40vw] min-[375px]:max-w-[50vw]`.

#### P1-3: Bottom nav + FloatingCartBar stacking collision
**Pages:** All pages with cart — **Devices:** All  
The FloatingCartBar positions itself at `bottom-[calc(4.25rem+env(safe-area-inset-bottom))]` and the BottomNav is `h-16` (4rem) + safe-area padding. This leaves only ~4px gap. When the BottomNav grows due to safe-area-inset-bottom on newer iPhones (~34px), the cart bar and nav can visually merge.  
**Fix:** Increase FloatingCartBar bottom offset to `bottom-[calc(4.75rem+env(safe-area-inset-bottom))]` for breathing room.

#### P1-4: Dialog close button too close to edge on small screens
**Component:** `dialog.tsx` — **Devices:** iPhone 5s  
Close button is at `right-4 top-4` (16px from edge) with `w-11 h-11`. On 320px screens with `w-[calc(100%-2rem)]` dialog, the close button can crowd the title text.  
**Fix:** Add `sm:right-4 right-3 sm:top-4 top-3` for slightly tighter positioning on small screens.

#### P1-5: SellerSettingsPage content hidden behind fixed save button
**Page:** `/seller/settings` — **All devices**  
Uses `pb-36` for scroll clearance but the fixed save button container has `pb-[calc(1rem+env(safe-area-inset-bottom))]`. On devices with large safe areas, the save button area exceeds the assumed 36 spacing.  
**Fix:** Increase to `pb-44` to account for safe-area devices.

#### P1-6: Guard Kiosk tabs overflow horizontally on small screens
**Page:** `/guard-kiosk` — **Devices:** Small Android (5"), iPhone SE  
7 tabs (QR, OTP, Delivery, Workers, Expected, Manual, Log) in a horizontal `TabsList`. On narrow screens these overflow without scroll indication.  
**Fix:** Add `overflow-x-auto scrollbar-hide` to the `TabsList` and ensure horizontal scroll is smooth.

#### P1-7: BecomeSellerPage form inputs hidden behind keyboard
**Page:** `/become-seller` — **Devices:** All mobile  
Multi-step form with text inputs. No `scrollIntoView` logic for inputs when keyboard opens (unlike AuthPage OTP which has it).  
**Fix:** Add a global CSS rule or per-input `onFocus` handler that scrolls the focused input into view: `e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })`.

#### P1-8: OrderDetailPage content bottom padding insufficient
**Page:** `/orders/:id` — **All devices**  
The main content uses `AppLayout` with default `pb-24`. However, the seller/buyer action bar is a fixed footer with `h-12` + padding + safe area, which can be 80-100px total. Items at the bottom of the page (e.g., "Instructions" section) can be hidden behind the action bar.  
**Fix:** Add conditional extra padding when action bars are visible: `pb-36` when `hasSellerActionBar || hasBuyerActionBar`.

#### P1-9: SearchPage input auto-focus blocks scroll on iOS Safari
**Page:** `/search` — **Devices:** iOS Safari / Capacitor  
Auto-focusing the search input on page load triggers the keyboard, which can cause layout jump since the sticky header and content shift simultaneously.  
**Fix:** Delay auto-focus by 300ms to let the page transition complete.

#### P1-10: DeliveryFeedbackForm star targets slightly undersized
**Component:** `DeliveryFeedbackForm.tsx`  
Star buttons use `min-w-[44px] min-h-[44px]` — this is correct. However the `p-1.5` padding means the visual star icon is only 28px. The tap target is fine but on iPhone 5s the 5 stars span 220px on a 288px usable width (320-32px padding), which is tight but acceptable.  
**Status:** Acceptable — no fix needed.

#### P1-11: AuthPage hero image covers 40% of small screens
**Page:** `/auth` — **Devices:** iPhone 5s, SE  
Hero section is `h-40 sm:h-56`. On iPhone 5s (568px viewport), 160px is 28% of the screen, leaving 408px for the form. With the keyboard open, the visible area above it drops to ~200px — barely enough for the form.  
**Fix:** Reduce to `h-28 sm:h-40 md:h-56` for progressive enhancement.

---

### C. Device-Specific Issues

#### iOS-Only
1. **Status bar text readability** — On pages using `safe-top` utility class, light-mode text can be hard to read against the transparent status bar. The Header component's `bg-[hsl(var(--header-bg))]` backdrop helps, but pages bypassing Header (CartPage, SellerSettingsPage) show content directly under translucent status bar.
2. **iOS swipe-back gesture** — Works naturally with React Router since navigation uses `navigate(-1)`. No issues found.
3. **Dynamic Island** — `env(safe-area-inset-top)` handles this correctly on iPhone 14 Pro/15 Pro.

#### Android-Only
1. **Android back button** — Pages with custom back buttons work, but the hardware back button in Capacitor isn't explicitly handled. Consider adding `App.addListener('backButton')` for Capacitor Android to prevent app exit from non-root routes.
2. **Small Android devices (5")** — The `text-[10px]` and `text-[11px]` sizes used throughout (disclaimers, community text) may be unreadable on low-DPI small Android screens.

---

### D. P2 Issues (Minor)

1. **P2-1:** NotificationInboxPage has no pull-to-refresh — uses a manual "Refresh" button which is non-standard on mobile.
2. **P2-2:** WelcomeCarousel / OnboardingWalkthrough doesn't show page indicator dots for swipe progress.
3. **P2-3:** ProfilePage menu items lack chevron icons for consistency — some have `ChevronRight`, others don't.
4. **P2-4:** CategoriesPage sticky header uses `bg-background/95` — on fast scroll, the 5% transparency can show content bleeding through.
5. **P2-5:** CartPage "Clear" button is `text-xs h-8` — slightly small for fat-finger use but meets 44px minimum via `min-w-[44px]`.
6. **P2-6:** SellerDashboardPage tabs (Orders/Analytics/Coupons) don't persist selection on navigation — returning always resets to default tab.
7. **P2-7:** Empty states across pages use inconsistent icon sizes (40px, 48px, 64px) — not a functional issue but feels inconsistent.
8. **P2-8:** OrdersPage and NotificationInboxPage lack skeleton loaders for individual list items during pagination.
9. **P2-9:** SocietyDashboardPage quick-link icons are `text-lg` (variable size) — should use fixed icon sizes for visual consistency.
10. **P2-10:** HelpPage uses `showNav={false}` — users can only exit via back button, which could feel trapped if they navigated directly.
11. **P2-11:** Drawer drag handle is `w-[100px]` — standard is ~40-48px; this oversized handle is functional but looks non-standard.
12. **P2-12:** ThemeToggle hidden below 375px (`hidden min-[375px]:inline-flex`) — iPhone 5s users cannot switch themes.
13. **P2-13:** Toast notifications (sonner) appear at top and can overlap with the header on pages with `sticky top-0` headers.

---

### E. Surgical Fix Priority Order

| Priority | Issue | Files to Edit | Lines Changed |
|----------|-------|---------------|---------------|
| P0-1 | Cart footer occlusion | `CartPage.tsx` line 65 | ~3 lines |
| P0-3 | Seller detail back button | `SellerDetailPage.tsx` line 253-256 | ~2 lines |
| P1-1 | Place order disabled reason | `CartPage.tsx` line 306-309 | ~5 lines |
| P1-2 | Header location truncation | `Header.tsx` line 116 | ~1 line |
| P1-3 | Cart bar + nav gap | `FloatingCartBar.tsx` line 53 | ~1 line |
| P1-5 | Seller settings padding | `SellerSettingsPage.tsx` line 111 | ~1 line |
| P1-7 | Form keyboard scroll | Global utility or `BecomeSellerPage.tsx` | ~5 lines |
| P1-8 | Order detail bottom padding | `OrderDetailPage.tsx` | ~3 lines |
| P1-11 | Auth hero height | `AuthPage.tsx` line 87 | ~1 line |

**Total estimated: ~25 lines across 8 files. No new features, no redesigns.**

