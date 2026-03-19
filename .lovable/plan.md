

# Redesign "Meet Your Neighbor Sellers" → High-Conversion Discovery Module

## Problem
The current seller cards show only a colored letter avatar + name. The RPC `search_sellers_by_location` already returns rich data (`matching_products` array with name, price, image_url; `cover_image_url`; `description`; `categories`) but the hook discards it and the UI never displays it.

## Plan

### 1. Enrich the data hooks (`useStoreDiscovery.ts`)
- Expand `LocalSeller` and `NearbySeller` interfaces to include: `cover_image_url`, `description`, `categories`, `completed_order_count`, and a new `topProducts` array (name, price, image_url, category, is_veg)
- In both `useLocalSellers` and `useNearbySocietySellers`, parse `matching_products` JSON from RPC response, take up to 3 products sorted by price, and attach to each seller object

### 2. Redesign seller cards in `ShopByStoreDiscovery.tsx`
Replace the current minimal avatar+name cards with rich cards that show:

- **Cover image** or product image mosaic (first 2-3 product images) as card header — if no cover or product images, fall back to current colored avatar
- **Seller name** (sanitized as today)
- **Category tags** (e.g., "Snacks", "Home Food") — from actual `categories` array
- **Top products strip**: horizontal row of 2-3 product thumbnails with name + price below each
- **Starting price**: "From ₹10" derived from min price of `topProducts`
- **Social proof badge**: "X orders" if `completed_order_count > 0`, or "New Seller" otherwise (matching existing `SellerCard` pattern)

Card layout: vertical, ~140px wide for local row / ~120px for nearby. Touch-friendly with hover/active scale transitions.

### 3. Nearby society cards (`SocietyCard`)
Apply the same enrichment — each seller tile inside society cards gets product thumbnails + price instead of bare avatar.

### 4. No database changes needed
The RPC already returns all required data. No migrations, no new tables.

### Technical Details

**Files modified:**
- `src/hooks/queries/useStoreDiscovery.ts` — expand interfaces, parse `matching_products` from RPC response
- `src/components/home/ShopByStoreDiscovery.tsx` — redesign `CategorySellerRow`, `SocietyCard`, and `SellerAvatar` components with product-rich cards

**Data flow:**
```text
search_sellers_by_location RPC
  └─ matching_products (JSON array with name, price, image_url, is_veg)
  └─ cover_image_url, categories, completed_order_count
       │
       ▼
useLocalSellers / useNearbySocietySellers
  └─ parse JSON, slice top 3 by price, attach to seller
       │
       ▼
Rich seller card UI
  └─ product thumbnails + prices + category chips + social proof
```

**Constraints honored:**
- Zero hardcoded data — everything from DB
- Cards with no products gracefully degrade (show avatar + name only)
- Uses `useCurrency` for price formatting
- Maintains existing navigation to `/seller/:id`

