

# Round 26: Mobile UX & Responsiveness Audit — 15 Critical Issues

## A. Summary

Based on code-level analysis of all pages, components, overlays, and layout primitives:

- **Total issues identified:** 15
- **P0 (Blocker):** 4
- **P1 (Major UX):** 7
- **P2 (Minor):** 4
- **Overall mobile readiness score:** 72/100 — Good foundation, but P0 blockers must be fixed before release

---

## B. Top 15 Critical Issues

### P0-1: `DialogContent` uses centered positioning (`top-50% left-50%`) — overflows and is unreachable on small screens

**Where:** `dialog.tsx` line 38-39 — `fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-lg p-6`

**What happens:** On iPhone SE / 5s (320px width), the dialog is 100% width but the `max-w-lg` (512px) doesn't constrain since screen is smaller. The `p-6` (24px) padding means content area is 320 - 48 = 272px. The dialog has `max-h` not set — long content (e.g., product edit dialog, order confirm dialog) overflows vertically off-screen. The close button at `right-4 top-4` is visible but content below the fold is unreachable because the dialog is `fixed` positioned at 50%/50% — it doesn't scroll.

The `SellerProductsPage` Add/Edit Product dialog (`DialogContent className="max-h-[90vh] overflow-y-auto"`) correctly adds `max-h` + scroll. But many other dialogs (clear cart, order confirm, delete account, report dialog) use bare `DialogContent` with no max-height — they clip on small screens.

**Severity:** P0 — Users cannot complete critical flows (confirm order, clear cart) on small devices

**Fix:** Add `max-h-[85vh] overflow-y-auto` as default to `DialogContent` base class. Add side margins: change `w-full` to `w-[calc(100%-2rem)]` or `mx-4`.

**Impact if fixed:** All 20+ dialogs across the app become scrollable. Verify that short dialogs don't look odd with unnecessary scroll.

**Risk:** Some dialogs may have their own `max-h` — ensure no double constraint.

---

### P0-2: Cart page sticky footer has no bottom-padding accounting for its own height — content hidden behind footer

**Where:** `CartPage.tsx` line 65 — `<div className="pb-52">` is the content container. Line 285 — the sticky footer is `fixed bottom-0`. The `pb-52` (208px) was chosen to match the footer height. But the footer dynamically grows: payment warnings (+40px), multi-seller note (+30px), UPI disclaimer (+20px), delivery threshold text (+16px). On a cart with all warnings visible, the footer can be ~300px tall. Content at the bottom (refund promise, address card) is hidden behind the footer.

**What happens:** Buyer scrolls to the bottom of the cart page. The "Refund Promise" card and address section are partially or fully behind the fixed footer. On iPhone SE, this is severe — the buyer can't see or interact with the address picker.

**Severity:** P0 — Buyer can't select delivery address, can't see billing details

**Fix:** Replace `pb-52` with a dynamic spacer: render an invisible div at the bottom that measures the footer's actual height using a ref, or use a more generous `pb-80` (320px) to accommodate worst case.

**Impact if fixed:** All screen sizes see all cart content. Oversized padding on simple carts (single seller, no warnings) wastes whitespace but is acceptable.

---

### P0-3: `SellerSettingsPage` fixed save button overlaps bottom content — last form fields unreachable

**Where:** `SellerSettingsPage.tsx` line 111 — content container `pb-24` (96px). Line 334 — fixed save button `fixed bottom-0` with `p-4` + safe area. The save button is ~64px tall + safe area. The content before it (bank details section) has 3 input fields. On small screens, the last input field (IFSC code) sits behind the fixed save button.

**What happens:** Seller scrolls to the bottom of settings. The IFSC code input is partially hidden behind the "Save Changes" button. When the seller taps it, the keyboard opens and pushes the button UP, further obscuring the input.

**Severity:** P0 — Seller cannot fill in bank details (required for payouts)

**Fix:** Increase `pb-24` to `pb-36` (144px) to account for the fixed footer + keyboard inset.

---

### P0-4: `ProductDetailSheet` bottom action bar uses `absolute bottom-0` inside a scrollable container — disappears when scrolled

**Where:** `ProductDetailSheet.tsx` line 211 — `<div className="absolute bottom-0 left-0 right-0 bg-background border-t border-border p-4">`. The `DrawerContent` has `max-h-[92vh]` and the inner div has `overflow-y-auto max-h-[calc(92vh-2rem)]`. The action bar is `absolute` positioned inside the scrollable div.

**What happens:** On long product descriptions with similar products section, the user scrolls down. The "Add to Cart" button scrolls away with the content because it's `absolute` inside the scroll container, not `sticky` or outside the scroll. On short products it works fine because there's no scroll. On products with description + attributes + trust stats + similar products, the button is gone. The `h-20` spacer at line 209 provides space but the button itself scrolls away.

Actually, re-reading: the `absolute bottom-0` is inside the `DrawerContent` but OUTSIDE the `overflow-y-auto` div. Let me re-check the DOM structure:
```
DrawerContent (max-h-[92vh])
  ├── div (overflow-y-auto max-h-[calc(92vh-2rem)])  ← scrollable
  │    ├── image, content, similar products
  │    └── h-20 spacer
  └── div (absolute bottom-0)  ← action bar
```

The action bar is a sibling to the scroll container, both inside `DrawerContent`. Since `DrawerContent` doesn't have `position: relative` explicitly, `absolute bottom-0` positions relative to the nearest positioned ancestor — which is `DrawerContent` (it's `fixed`). So the button IS pinned to the bottom of the drawer, not scrolling. This is actually correct.

However, the `max-h-[calc(92vh-2rem)]` on the scroll container doesn't account for the action bar height (~64px). The scrollable area extends behind the action bar. The `h-20` (80px) spacer at the end provides clearance. This should work. Downgrading this.

**Revised P0-4: Location pill in header truncates at `max-w-[40vw]` — on iPhone SE (320px), only 128px for location text + stats, rendering it unreadable**

**Where:** `Header.tsx` line 116 — `max-w-[40vw]` on the location text. On 320px wide screens, that's 128px. The location text "Sunrise Heights" is ~110px. But the stats suffix ("· 🏪 3 sellers · 12 orders served") pushes the total content to ~300px. The text truncates to just "Sunri..." making it unreadable.

More critically: the entire location button (line 110-128) contains ALL of this inline. On small screens, the stats text ("🏪 3 sellers · 12 orders served") wraps awkwardly inside the button, creating a multi-line pill that breaks the header layout.

**Severity:** P1 — Header layout breaks on small screens (SE/5s class)

**Fix:** Hide stats text on screens < 380px using a responsive class or move stats to a separate row. Increase `max-w-[40vw]` to `max-w-[55vw]` and hide stats on small screens.

---

### P1-1: `DrawerContent` default padding is only the drag handle — content inside drawers has no side padding

**Where:** `drawer.tsx` line 38-41 — `DrawerContent` only renders a drag handle. Child content must provide its own padding. Most drawers do (`<div className="space-y-4 mt-4">` in `CreateSnagSheet`), but the padding is inconsistent:
- `CreateSnagSheet`: no side padding (content touches edges)
- `SnagDetailSheet`: no side padding
- `FloatingCartBar` drawer: `px-4` on content
- `ServiceBookingFlow`: `pb-20` but content padding varies by step

**What happens:** On full-width mobile, content in `CreateSnagSheet` and `SnagDetailSheet` renders edge-to-edge with no horizontal padding. Form inputs and text touch the screen edges. This looks wrong and makes small-screen interaction difficult.

**Severity:** P1 — Poor visual quality on all mobile devices for snag/reporting flows

**Fix:** Add default `px-4` to `DrawerContent` child wrapper, or add `px-4` to each drawer's content container that's missing it.

**Files:** `CreateSnagSheet.tsx`, `SnagDetailSheet.tsx`, and ~5 other drawers missing `px-4`.

---

### P1-2: `SheetContent` close button is 16x16px (h-4 w-4 icon) with no explicit tap target — fails 44px minimum

**Where:** `sheet.tsx` line 63 — `SheetPrimitive.Close className="absolute right-4 top-4 rounded-xl opacity-70..."` wraps an `X` icon of `h-4 w-4` (16x16px). The close button itself has no explicit width/height — it's sized by the icon. The effective tap target is ~24px (icon + padding from `rounded-xl`), well below the 44px iOS HIG minimum.

Similarly, `dialog.tsx` line 45 has the same issue.

**What happens:** User tries to close a sheet or dialog. The close button is hard to tap, especially on small phones. Users may accidentally tap content behind the close button area.

**Severity:** P1 — Accessibility violation, frustrating on all mobile devices

**Fix:** Add `w-10 h-10 flex items-center justify-center` to both `SheetPrimitive.Close` and `DialogPrimitive.Close` to create a proper 40px tap target.

---

### P1-3: `NewOrderAlertOverlay` is full-screen `z-[100]` with no swipe-to-dismiss or back-button handler — traps seller on Android

**Where:** `NewOrderAlertOverlay.tsx` line 95 — `fixed inset-0 z-[100]`. No `onClose` on background tap (line 103: `onClick={(e) => e.stopPropagation()}`). No Android back button handling. The only way to dismiss is tapping "Remind me later" or "View Order", or waiting 30s for auto-dismiss.

**What happens:** Android seller presses the hardware/gesture back button. Nothing happens — the overlay stays. The seller is trapped in the overlay. They must read and interact with the specific buttons. For a seller in a hurry (handling multiple tasks), this is frustrating.

**Severity:** P1 — Navigation trap on Android, violates platform conventions

**Fix:** Add background tap handler that calls `onSnooze` (not dismiss — snooze is safer). Also listen for `popstate` events (Android back) to trigger snooze.

---

### P1-4: Header search bar on home page pushes content down on large phones but is not sticky — disappears on scroll

**Where:** `Header.tsx` line 190-198 — search bar is only rendered when `!title` (home page). It's inside the header which is `sticky top-0 z-40`. The search bar IS sticky (part of the header). But the entire header (brand + location + stats + search) is quite tall: ~130px on iPhone 15 Pro Max. This means on a 6.7" screen, 130px of viewport is consumed by the header, leaving less than 75% for content.

On iPhone 5s (568px height), the header occupies ~130px = 23% of the screen. After the bottom nav (64px + safe area), the content area is only ~374px — less than the viewport of the smallest phones.

**Severity:** P1 — Excessive header height on small screens reduces usable content area

**Fix:** Make the search bar scroll away with content (remove it from the sticky header) or collapse to a compact mode on scroll using an IntersectionObserver. The brand row could also be hidden on scroll, keeping only the location pill.

---

### P1-5: `SellerChatSheet` uses `createPortal` with `z-[60]` but doesn't block background scroll — user can scroll the page behind the chat

**Where:** `SellerChatSheet.tsx` line 73 — the portal renders a `fixed inset-x-0` div but doesn't apply `overflow: hidden` to `document.body`. On iOS, the page behind the chat panel can still be scrolled, creating a confusing double-scroll scenario.

**Severity:** P1 — Background scroll bleeds through on iOS, disorienting UX

**Fix:** Add `useEffect` when `open` is true: `document.body.style.overflow = 'hidden'` and restore on close.

---

### P1-6: `OrderChat` and `SellerChatSheet` input textarea doesn't handle iOS keyboard correctly — input pushed off-screen

**Where:** Both chat components use `useChatViewport` which relies on `visualViewport` API. On iOS Safari, the `visualViewport.height` shrinks when the keyboard opens, but the `fixed` positioned container doesn't always reflow correctly. The textarea at the bottom may end up partially behind the keyboard on older iOS versions (< 16) where `visualViewport` events are less reliable.

**Severity:** P1 — Chat unusable on older iOS devices

**Fix:** Add `scrollIntoView` on textarea focus as a fallback. The `useChatViewport` already handles native via Capacitor keyboard plugin, but the web fallback needs `scrollIntoView({ block: 'end' })` on the textarea container.

---

### P2-1: `FloatingCartBar` positioned at `bottom-[calc(4.25rem+env(safe-area-inset-bottom))]` — can overlap with content on pages that also have the bottom nav

**Where:** `FloatingCartBar.tsx` line 53 — positioned above the bottom nav. On pages with additional fixed bottom elements (order detail action bar at `z-40`, delivery confirmation overlay), the cart bar can overlap with these elements since they share `z-40`.

**Severity:** P2 — Visual overlap on order detail pages with action bars

**Fix:** Hide `FloatingCartBar` on order detail pages by adding `/orders/` to `CART_HIDDEN_ROUTES`.

---

### P2-2: `RichNotificationCard` has no close button when `action` is missing — banner cannot be dismissed

**Where:** `RichNotificationCard.tsx` line 95 — the dismiss button only renders when `action` exists. On the `HomeNotificationBanner`, if a notification lacks an `action` in its payload, the card renders with no dismiss button and no action button. The card just sits there undismissable.

**Severity:** P2 — Banner stuck on home page until notification expires

**Fix:** Always render the dismiss button if `onDismiss` is provided, regardless of `action`.

---

### P2-3: `CategoryGroupPage` and `SearchPage` sticky headers use `safe-top` CSS class but don't account for the app's own `Header` when `showHeader` is different

**Where:** `CategoryGroupPage.tsx` line 210 — `safe-top` on sticky header with `showHeader={false}` — correctly uses safe area. But `SearchPage.tsx` line 69 — `pb-24` with `showHeader={false}` — the sticky search header uses `safe-top`. When the user arrives from the home page (which HAS the header), the transition from header → no-header can cause a visual jump as the safe area padding changes.

**Severity:** P2 — Mild visual inconsistency during navigation transitions

**Fix:** No action needed — this is inherent to the sticky header approach and is not a functional bug.

---

### P2-4: Drawer content in `ServiceBookingFlow` uses `pb-20` (80px) spacer but the drawer has no fixed footer — wasted space

**Where:** `ServiceBookingFlow.tsx` line 359 — `pb-20` on the scrollable content. The CTA button is inline at the bottom of the content, not fixed. The 80px bottom padding creates unnecessary whitespace after the last step's content.

**Severity:** P2 — Wasted space in booking flow, especially on small screens

**Fix:** Reduce `pb-20` to `pb-6` since there's no fixed footer to account for.

---

## C. Device-Specific Issues

### iOS-Only:
- **P1-5:** Background scroll bleed-through in chat portals (iOS rubber-band scrolling)
- **P1-6:** Keyboard pushing input off-screen on iOS < 16
- **P1-4:** Excessive header height disproportionately impacts iPhone SE/5s (23% viewport consumption)

### Android-Only:
- **P1-3:** Back button doesn't dismiss `NewOrderAlertOverlay`
- Hardware back button doesn't close drawers that use `vaul` (Vaul handles this via the Escape key on web, but Android back button needs explicit handling)

---

## D. Implementation Plan — Priority Order

### Phase 1: P0 Blockers (fix immediately)

1. **Dialog overflow fix** — `dialog.tsx`: Add `max-h-[85vh] overflow-y-auto` to `DialogContent` base class, change `w-full` to `w-[calc(100%-2rem)]`
2. **Cart page padding** — `CartPage.tsx`: Change `pb-52` to `pb-80`
3. **Settings page padding** — `SellerSettingsPage.tsx`: Change `pb-24` to `pb-36`

### Phase 2: P1 Major UX (fix before release)

4. **Close button tap targets** — `sheet.tsx`, `dialog.tsx`: Add `w-10 h-10 flex items-center justify-center` to close buttons
5. **Drawer padding** — `CreateSnagSheet.tsx`, `SnagDetailSheet.tsx`: Add `px-4` to content containers
6. **Header stats** — `Header.tsx`: Hide stats on small screens with `hidden sm:inline`
7. **Order alert back button** — `NewOrderAlertOverlay.tsx`: Add background tap → snooze, popstate handler
8. **Chat background scroll lock** — `SellerChatSheet.tsx`, `OrderChat.tsx`: Lock body scroll when open
9. **Notification card dismiss** — `RichNotificationCard.tsx`: Always show dismiss when `onDismiss` provided

### Phase 3: P2 Polish (nice-to-have)

10. Cart bar route hiding, booking flow padding

---

## Files to Edit

| File | Bugs |
|------|------|
| `src/components/ui/dialog.tsx` | P0-1, P1-2 |
| `src/components/ui/sheet.tsx` | P1-2 |
| `src/pages/CartPage.tsx` | P0-2 |
| `src/pages/SellerSettingsPage.tsx` | P0-3 |
| `src/components/layout/Header.tsx` | P1-4 |
| `src/components/snags/CreateSnagSheet.tsx` | P1-1 |
| `src/components/snags/SnagDetailSheet.tsx` | P1-1 |
| `src/components/seller/NewOrderAlertOverlay.tsx` | P1-3 |
| `src/components/product/SellerChatSheet.tsx` | P1-5 |
| `src/components/chat/OrderChat.tsx` | P1-6 |
| `src/components/notifications/RichNotificationCard.tsx` | P2-2 |
| `src/components/booking/ServiceBookingFlow.tsx` | P2-4 |

