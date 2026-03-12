

# Fix Missing Location Link in Product Detail Sheet and Seller Switcher Text Overflow

## Issue 1: Product Detail Sheet — Location icon not clickable

The first screenshot shows the product detail sheet for "Ac Service." The location icon (MapPin) and text on line 159 of `ProductDetailSheet.tsx` are static — they don't link to Google Maps. The seller detail page was fixed earlier, but the product detail sheet was missed.

The product object has `seller_id` but no direct lat/lng. We need to use the seller's coordinates (already fetched or fetchable) to build the Google Maps link.

**Fix in `src/components/product/ProductDetailSheet.tsx`** (line 159):
- Wrap the MapPin + locationText in a clickable button that opens Google Maps
- The seller coordinates aren't on the product object directly, so fetch them alongside the existing `fetchedSellerAvailability` query (add `latitude, longitude` to the select on line 71) or use a separate lightweight query
- When coordinates are available, make the location span clickable; otherwise keep it static

## Issue 2: Seller Switcher — Business name truncated on mobile

The second screenshot shows the StoreStatusCard where "2 businesses" badge overlaps with the business name text. In `StoreStatusCard.tsx` line 42-48, the business name and badge are on the same flex row with `gap-2`, causing truncation on small screens.

**Fix in `src/components/seller/StoreStatusCard.tsx`** (lines 41-48):
- Stack the business name and "N businesses" badge vertically instead of horizontally
- Move the badge below the business name or make it part of the subtitle line (next to "Store is live · Open")

## Files to modify

1. **`src/components/product/ProductDetailSheet.tsx`** — Add lat/lng to seller availability query, make location label clickable to open Google Maps
2. **`src/components/seller/StoreStatusCard.tsx`** — Stack business name and badge count vertically to prevent text cutoff on mobile

