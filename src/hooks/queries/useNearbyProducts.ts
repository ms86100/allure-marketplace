import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { jitteredStaleTime } from '@/lib/query-utils';
import { mergeProductFlags } from './useProductFlags';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { MARKETPLACE_RADIUS_KM } from '@/lib/marketplace-constants';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Coordinate-based discovery hook. Always uses search_sellers_by_location
 * with browsingLocation lat/lng. Returns a flat, deduplicated product list.
 */
export function useNearbyProducts() {
  const { browsingLocation } = useBrowsingLocation();
  const { profile, effectiveSocietyId } = useAuth();

  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;
  const radiusKm = profile?.search_radius_km ?? MARKETPLACE_RADIUS_KM;

  return useQuery({
    queryKey: ['store-discovery', 'nearby-products', lat, lng, radiusKm, effectiveSocietyId],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      if (!lat || !lng) return [];

      const { data, error } = await supabase.rpc('search_sellers_by_location' as any, {
        _lat: lat,
        _lng: lng,
        _radius_km: radiusKm,
        _exclude_society_id: effectiveSocietyId || undefined,
      });

      if (error) throw error;
      if (!data || data.length === 0) return [];

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
            is_available: p.is_available ?? true,
            is_bestseller: false,
            is_recommended: false,
            is_urgent: false,
            description: null,
            action_type: p.action_type || 'add_to_cart',
            contact_phone: p.contact_phone || null,
            mrp: p.mrp || null,
            discount_percentage: p.discount_percentage || null,
            seller_name: seller.business_name || '',
            seller_rating: seller.rating || 0,
            fulfillment_mode: null,
            delivery_note: null,
            seller_availability_start: seller.availability_start || null,
            seller_availability_end: seller.availability_end || null,
            seller_operating_days: seller.operating_days || null,
            seller_is_available: seller.is_available ?? true,
            distance_km: seller.distance_km ?? null,
            society_name: seller.society_name || null,
            seller_latitude: seller.seller_latitude ?? null,
            seller_longitude: seller.seller_longitude ?? null,
            created_at: '',
            updated_at: '',
          });
        }
      }
      return mergeProductFlags(products);
    },
    enabled: !!(lat && lng),
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
