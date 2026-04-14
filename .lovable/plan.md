

# Bulletproof Card Consistency, Seller Dashboard Black Screen, and Query Fix

## Problems

1. **Product cards have inconsistent heights/widths in discovery rows**: The content area below the image varies based on product name length, seller info, badges, etc. Cards in the same horizontal row appear jagged.

2. **Seller dashboard shows black/blank screen**: The console shows a fatal query error: `service_recurring_configs` has a broken FK hint (`service_recurring_configs_product_id_fkey`) that doesn't exist in the schema cache. This crashes the `useServiceBookings` hook, which is used by the seller dashboard. The `RouteErrorBoundary` catches it but may not render visibly depending on the background.

3. **Festival banner text invisible on light gradients**: White text on yellow Diwali gradients — the current `text-shadow` approach is insufficient on very bright backgrounds.

## Changes

### 1. Fix `ProductListingCard.tsx` — Enforce rigid card dimensions

The root cause is that compact discovery cards have variable content heights. Fix:

- **Fixed total card height**: Set a strict `h-[260px]` on the root `motion.div` when `compact` is true, making every card identical height regardless of content
- **Fixed image area**: Keep `aspect-square` but also add `h-[160px]` to the image container for compact mode — guarantees the image area is always the same pixel height
- **Clamp ALL text**: Product name already has `line-clamp-2` and `min-h-[2lh]`, but seller name, variant text, and other optional rows need `line-clamp-1` with fixed heights so they don't cause expansion
- **Overflow hidden on content section**: Add `overflow-hidden` to the content div so nothing ever pushes the card taller

### 2. Fix `MarketplaceSection.tsx` — Consistent card wrapper width

- Keep the `w-[160px]` on each card wrapper (already correct)
- Ensure `flex` class on wrapper so inner card fills height (already present)
- No max-width constraint on the marketplace container (stays full-width as user requested)

### 3. Fix `useServiceBookings.ts` — Remove broken FK hint

Line 155: `.select('*, product:products!service_recurring_configs_product_id_fkey(name)')` uses a FK hint that doesn't exist in the DB schema cache.

Fix: Change to `.select('*, product:products(name)')` (remove the explicit FK hint, let PostgREST auto-detect). If there's no FK at all, change to a separate query or remove the join entirely.

This is the **root cause of the seller dashboard black screen** — the query throws a PGRST200 error that crashes the component tree.

### 4. Fix `FestivalBannerModule.tsx` — Dark overlay for text readability

The `text-shadow` approach is too weak for bright yellow. Instead:

- Add a `bg-gradient-to-t from-black/40 to-transparent` overlay div behind the text content
- Keep white text — the dark overlay guarantees contrast on ANY background color
- Remove the `perceivedBrightness` function (unnecessary with overlay approach)

## Files Modified

| File | Change |
|------|--------|
| `src/components/product/ProductListingCard.tsx` | Fixed height for compact cards, overflow hidden, clamped all text |
| `src/hooks/useServiceBookings.ts` | Remove broken FK hint from query |
| `src/components/home/FestivalBannerModule.tsx` | Add dark gradient overlay behind text |

## Scope
- 3 files modified
- No database changes or migrations
- No new dependencies
- Fixes a crash (seller dashboard), visual inconsistency (cards), and accessibility (banner contrast)

