

## End-to-End Audit: Three Critical Issues Found

---

### Issue 1: Blank Screen on TestFlight (iOS Native)

**Root Cause Analysis:**

The `initializeCapacitorPlugins()` in `src/lib/capacitor.ts` runs before React mounts (bootstrap pattern in `main.tsx`). If any part of this initialization throws an unhandled error, the entire `bootstrap()` promise rejects silently — React never mounts, producing a blank screen.

Specific failure points identified:

1. **Line 30-43** (`capacitor.ts`): The manual session restore block parses `import.meta.env.VITE_SUPABASE_URL` to derive a storage key. If the URL parsing fails or `capacitorStorage.getItem()` returns malformed JSON, `JSON.parse(raw)` throws inside a `try/catch` that only logs a warning — this part is safe.

2. **Line 15-16**: `(supabase.auth as any).storage = capacitorStorage` — This patches the Supabase auth storage. However, `supabase.auth.getSession()` (called later in `useAuthState.ts` line 163) expects synchronous `getItem` from storage. The `CapacitorStorage.getItem()` is **async** (returns `Promise<string | null>`). Supabase JS v2's GoTrueClient **does** support async storage, but only if it was configured at client creation time. Patching `.storage` after creation may cause the internal `_loadSession()` to receive a Promise where it expects a string, leading to a silent failure or crash.

3. **No global unhandled rejection handler**: `App.tsx` has no `unhandledrejection` listener. If the bootstrap or any early async operation fails, there's no safety net — blank screen.

**Fix Plan:**

**File: `src/main.tsx`** — Wrap `bootstrap()` in try/catch with a visible fallback:
- If `initializeCapacitorPlugins()` throws, still mount the React app (skip the Capacitor initialization gracefully)
- Add a DOM-level fallback message if even React mount fails

**File: `src/App.tsx`** — Add a global `unhandledrejection` listener in the `App` component's `useEffect` (as recommended in the stack overflow pattern) to catch any floating promises and show a toast instead of crashing.

**File: `src/lib/capacitor.ts`** — Make the session restore more defensive:
- Wrap the entire `initializeCapacitorPlugins` body in a top-level try/catch so no single plugin failure prevents the rest from running
- Specifically, isolate the `StatusBar`, `Keyboard`, and `SplashScreen` calls so one failure doesn't block others (already done individually, but the storage patch at the top is not isolated from the rest)

---

### Issue 2: Product Details Not Visible by Default

**Root Cause:**

In `src/hooks/useProductDetail.ts` line 39, `showDetails` is initialized to `true`. However, in `src/components/product/ProductDetailSheet.tsx` line 96-98, the toggle button reads:

```tsx
<button onClick={() => d.setShowDetails(!d.showDetails)}>
  View product details
  <ChevronDown className={d.showDetails ? 'rotate-180' : ''} />
</button>
```

The section at lines 101-128 is conditionally rendered with `{d.showDetails && (...)}`. So the content IS shown by default (`showDetails=true`), but the button text always says **"View product details"** — it never changes to "Hide product details". This creates confusion because:
- The chevron rotates (pointing up when open) but the text stays static
- On first glance, the user sees "View product details" and thinks they need to tap it to see details, when the details are already visible below

The real UX problem: The toggle text is misleading. It should say "Hide details" when expanded and "View details" when collapsed.

**Fix Plan:**

**File: `src/components/product/ProductDetailSheet.tsx`** line 96-98:
- Change button text to be dynamic: `{d.showDetails ? 'Hide product details' : 'View product details'}`
- Keep `showDetails` default as `true` so details are visible on open (current correct behavior)

---

### Issue 3: Add to Cart Navigates Away Instead of Adding

**Root Cause:**

In `src/hooks/useProductDetail.ts` lines 82-94, `handleAdd` does this for cart actions:

```tsx
addItem({...product...});
onOpenChange?.(false);  // closes the sheet
navigate('/cart');       // navigates to cart page
```

Every time a user taps "Add to Cart" on the product detail sheet, it:
1. Adds the item to cart
2. Closes the sheet
3. **Forcefully navigates to `/cart`**

This is wrong behavior for an "Add to Cart" button. The expected behavior is:
- Add the item to cart
- Show the quantity stepper (already works if the sheet stays open)
- Let the user continue browsing

The `navigate('/cart')` and `onOpenChange?.(false)` should only happen for a "Buy Now" action, not for "Add to Cart".

Additionally, for non-cart actions (book, request_service, etc.), the `ProductCard` and `ProductGridCard` components correctly route to `onTap` or open enquiry sheets. But the `ProductDetailSheet`'s `handleAdd` conflates "add to cart" with "buy now" by always navigating away.

**Fix Plan:**

**File: `src/hooks/useProductDetail.ts`** — Modify `handleAdd`:
- For `add_to_cart`: Add item, do NOT close sheet, do NOT navigate. The stepper will appear automatically since `quantity` updates reactively.
- For `buy_now`: Add item, close sheet, navigate to `/cart` (this is the correct "buy now" flow).
- For non-cart actions (`book`, `request_service`, `contact_seller`, etc.): Current behavior is correct (opens enquiry/contact sheets).

```
// Proposed logic:
if (actionType === 'contact_seller') { setContactOpen(true); return; }
if (!isCartAction) { setEnquiryOpen(true); return; }
hapticImpact('medium');
addItem({...});
if (actionType === 'buy_now') {
  onOpenChange?.(false);
  navigate('/cart');
}
// For 'add_to_cart': do nothing extra — stepper appears in-place
```

---

### Summary of Changes

| File | Change | Risk |
|---|---|---|
| `src/main.tsx` | Wrap bootstrap in try/catch, add DOM fallback | Low |
| `src/App.tsx` | Add global `unhandledrejection` safety net | Low |
| `src/lib/capacitor.ts` | Isolate storage patch in its own try/catch, prevent cascade failures | Low |
| `src/hooks/useProductDetail.ts` | Remove navigate/close for `add_to_cart`, keep only for `buy_now` | Medium |
| `src/components/product/ProductDetailSheet.tsx` | Dynamic toggle text for details section | Low |

### Testing Required After Implementation

1. **TestFlight blank screen**: Install via TestFlight, verify app loads. Kill and reopen. Verify session persists.
2. **Product detail sheet**: Open any product card → details section should be visible by default with "Hide product details" text. Tap to collapse → text changes to "View product details".
3. **Add to Cart flow**: Tap "Add to Cart" on detail sheet → item count stepper should appear in-place, sheet stays open. User can increment/decrement. Sheet does NOT close.
4. **Buy Now flow**: For products with `buy_now` action type → tapping "Buy Now" should close sheet and navigate to cart.
5. **Book/Request/Contact flows**: Tapping "Book Now", "Request Service", or "Contact Seller" should open the appropriate enquiry/contact sheet, not add to cart.

