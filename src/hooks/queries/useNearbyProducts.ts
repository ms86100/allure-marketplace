import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { jitteredStaleTime } from '@/lib/query-utils';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';

/**
 * Shared hook that calls `search_sellers_by_location` RPC (coordinate-based)
 * or falls back to `search_nearby_sellers` (society-based) and returns
 * a flat, deduplicated list of cross-society products.
 */
export function useNearbyProducts() {
  const { effectiveSocietyId, profile } = useAuth();
  const { browsingLocation } = useBrowsingLocation();

  const browseBeyond = profile?.browse_beyond_community !== false;
  const searchRadius = profile?.search_radius_km ?? 10;

  // Use coordinate-based search when browsing location has an override (GPS or address)
  const useCoordSearch = browsingLocation && browsingLocation.source !== 'society';
  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;

  return useQuery({
    queryKey: ['store-discovery', 'nearby-products', useCoordSearch ? `loc-${lat}-${lng}` : effectiveSocietyId, searchRadius],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      let data: any[] | null = null;

      if (useCoordSearch && lat && lng) {
        // Coordinate-based discovery
        const result = await supabase.rpc('search_sellers_by_location' as any, {
          _lat: lat,
          _lng: lng,
          _radius_km: searchRadius,
        });
        if (result.error) throw result.error;
        data = result.data;
      } else if (effectiveSocietyId) {
        // Society-based discovery (fallback)
        const result = await supabase.rpc('search_nearby_sellers', {
          _buyer_society_id: effectiveSocietyId,
          _radius_km: searchRadius,
        });
        if (result.error) throw result.error;
        data = result.data;
      }

      if (!data || data.length === 0) return [];

      // Flatten: each seller row has a `matching_products` JSONB array
      const products: ProductWithSeller[] = [];
      for (const seller of data as any[]) {
        const items = seller.matching_products;
        if (!Array.isArray(items)) continue;

        for (const p of items) {
          products.push({
            id: p.id,
            seller_id: seller.seller_id,
            name: p.name,
            price: p.price,
            image_url: p.image_url,
            category: p.category,
            is_veg: p.is_veg ?? true,
            is_available: true,
            is_bestseller: false,
            is_recommended: false,
            is_urgent: false,
            description: null,
            action_type: p.action_type || 'add_to_cart',
            contact_phone: p.contact_phone || null,
            mrp: p.mrp || null,
            discount_percentage: p.discount_percentage || null,
            seller_name: seller.business_name || 'Seller',
            seller_rating: seller.rating || 0,
            fulfillment_mode: null,
            delivery_note: null,
            created_at: '',
            updated_at: '',
          });
        }
      }
      return products;
    },
    enabled: browseBeyond && !!(useCoordSearch ? (lat && lng) : effectiveSocietyId),
    staleTime: jitteredStaleTime(10 * 60 * 1000),
  });
}

/** Utility: merge local products with nearby products, dedup by id */
export function mergeProducts(
  local: ProductWithSeller[],
  nearby: ProductWithSeller[] | undefined,
): ProductWithSeller[] {
  if (!nearby || nearby.length === 0) return local;
  const seen = new Set(local.map((p) => p.id));
  const merged = [...local];
  for (const p of nearby) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }
  return merged;
}
