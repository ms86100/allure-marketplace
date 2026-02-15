
# Production-Grade Product & Service Listing Card System

## Overview

Rebuild the product card system into a unified, conversion-optimized component that adapts its layout based on product type (physical product, service, food) while extracting and displaying every available structured detail. This requires both database schema extensions and a new multi-layout card component.

---

## Phase 1: Database Schema Extensions

Add missing fields to the `products` table that are required for a marketplace-grade listing:

| New Column | Type | Purpose |
|---|---|---|
| `mrp` | numeric | Original price for strike-through display |
| `brand` | text | Brand name for trust signals |
| `unit_type` | text | kg, g, ml, plate, session, visit, etc. |
| `price_per_unit` | text | e.g. "per kg", "per session" |
| `stock_quantity` | integer | For scarcity indicator ("Only 3 left") |
| `secondary_images` | text[] | Array of additional image URLs |
| `bullet_features` | text[] | Quick feature bullets |
| `specifications` | jsonb | Key-value specs (color, weight, material) |
| `ingredients` | text | For food/grocery items |
| `serving_size` | text | e.g. "Serves 2", "250g" |
| `spice_level` | text | mild / medium / hot / extra_hot |
| `cuisine_type` | text | For food: North Indian, Chinese, etc. |
| `warranty_period` | text | For services/products |
| `service_scope` | text | What's included in the service |
| `visit_charge` | numeric | Inspection/visit fee for services |
| `minimum_charge` | numeric | Minimum order/service charge |
| `delivery_time_text` | text | "30 min", "Same Day", "2-3 days" |
| `tags` | text[] | Trending, New Arrival, Limited Stock, etc. |

Add a computed trigger to auto-calculate `discount_percentage` from `mrp` and `price`.

---

## Phase 2: New Unified `ProductListingCard` Component

Create `src/components/product/ProductListingCard.tsx` -- a single, reusable card that replaces `ProductGridCard` for all listing surfaces.

### Layout Detection Logic

```text
if parent_group in (food, grocery)  --> Food Layout
if parent_group in (services, personal, professional, events) --> Service Layout
else --> E-commerce Layout
```

### Common Elements (all layouts)

- Image container with lazy loading and fallback emoji
- Bestseller / New / Limited Stock badge overlay (top-left)
- Wishlist heart icon (top-right, future hook)
- Veg/Non-veg badge where applicable
- Seller name with verified tick
- Price block: bold selling price, strike-through MRP, discount badge
- Dynamic action button (ADD / Book / Contact / View) based on `action_type`
- Quantity stepper when item is in cart
- Out-of-stock overlay
- Scarcity indicator ("Only 3 left!")

### E-commerce Layout (Grocery, Electronics, Beauty)

```text
+---------------------------+
| [Badge]          [Heart]  |
|       [Product Image]     |
|       (object-contain)    |
|  [Veg]                    |
+---------------------------+
| Brand Name (if exists)    |
| Product Title (2-line)    |
| Unit: 500g                |
| Seller Name  [Verified]   |
| ₹199  ~~₹299~~  33% OFF  |
| Delivery: 30 min          |
| [Stock warning]    [ADD]  |
+---------------------------+
```

### Food Layout (Home Food, Restaurant, Bakery)

```text
+---------------------------+
| [Bestseller]     [Heart]  |
|       [Dish Image]        |
|  [Veg/NonVeg]             |
+---------------------------+
| Dish Name (2-line)        |
| Kitchen: Mom's Kitchen    |
| Cuisine: North Indian     |
| Serves 2 | Prep ~20 min   |
| Spice: Medium 🌶️          |
| ₹149           [ADD]     |
+---------------------------+
```

### Service Layout (Electrician, Yoga, Salon)

```text
+---------------------------+
| [Badge]          [Heart]  |
|     [Service Image]       |
+---------------------------+
| Service Name (2-line)     |
| Provider: Ravi Electricals|
| Duration: 60 min          |
| Delivery & Pickup         |
| Visit charge: ₹99        |
| Starting ₹499    [Book]  |
+---------------------------+
```

### Props Interface

```typescript
interface ProductListingCardProps {
  product: ProductWithSeller;
  layout?: 'auto' | 'ecommerce' | 'food' | 'service';
  onTap?: (product: ProductWithSeller) => void;
  showWishlist?: boolean;
  className?: string;
}
```

---

## Phase 3: Enhanced ProductDetailSheet

Update the bottom sheet to show all new fields:

- Image carousel (primary + secondary images)
- MRP with strike-through and discount percentage
- Bullet features list
- Specifications table (key-value pairs)
- Ingredients section (food items)
- Service scope / what's included
- Delivery time estimate
- Stock status
- Scarcity warning
- Variant selector (future-ready via specifications jsonb)

---

## Phase 4: Integration Across All Surfaces

Replace `ProductGridCard` usage with `ProductListingCard` in:

1. `MarketplaceSection.tsx` (Home page - Local + Nearby tabs)
2. `CategoryPage.tsx` (Category browsing)
3. `SearchPage.tsx` (Search results)
4. `SellerDetailPage.tsx` (Seller store - keep horizontal `ProductCard` but enhance it)

---

## Phase 5: Conversion Optimization Features

- **Scarcity indicator**: Show "Only X left!" when `stock_quantity` is between 1-5
- **Popular tag**: Show "X+ orders" from seller's `completed_order_count`
- **Discount badge**: Auto-calculated from MRP vs selling price
- **Delivery ETA chip**: From `delivery_time_text`
- **Social proof**: Seller rating stars + review count inline
- **Smart fallbacks**: Graceful handling for missing images, zero price, inactive sellers, out-of-stock

---

## Edge Cases Handled

| Scenario | Behavior |
|---|---|
| No image | Show category-specific emoji placeholder |
| Out of stock | Grey overlay + "Out of stock" label, disable action button |
| No MRP | Hide strike-through, show only selling price |
| Service unavailable | Show "Unavailable" instead of action button |
| No seller name | Show "Seller" as fallback |
| Zero price (contact_seller) | Show "Contact for price" |
| Missing category config | Default to e-commerce layout |

---

## Files to Create/Modify

| File | Action |
|---|---|
| `supabase/migrations/...` | Add new columns to `products` table |
| `src/components/product/ProductListingCard.tsx` | **Create** - New unified card |
| `src/components/product/ProductDetailSheet.tsx` | **Modify** - Show all new fields |
| `src/components/product/ProductGridCard.tsx` | **Deprecate** - Replace usages with new card |
| `src/components/home/MarketplaceSection.tsx` | **Modify** - Use new card |
| `src/pages/CategoryPage.tsx` | **Modify** - Use new card |
| `src/pages/SearchPage.tsx` | **Modify** - Use new card |
| `src/types/database.ts` | **Modify** - Extend Product interface |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |

---

## Technical Notes

- All new DB columns are nullable with sensible defaults so existing products continue to work without data migration
- The layout detection uses `parent_group` from `category_config` (already cached via `useCategoryConfigs` hook) -- no new API calls
- Dark mode compatibility is automatic via existing Tailwind CSS variables (bg-card, text-foreground, etc.)
- The card is fully responsive: 2-col mobile, 3-col tablet, 4-col desktop (matches current grid)
- The `ACTION_CONFIG` from `marketplace-constants.ts` continues to be the single source of truth for button labels/icons
