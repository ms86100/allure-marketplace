import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { jitteredStaleTime } from '@/lib/query-utils';
import { MARKETPLACE_RADIUS_KM } from '@/lib/marketplace-constants';

/**
 * Fetches trending products based on coordinate-based discovery.
 * Always follows the active browsingLocation, not the user's registered society.
 */
export function useTrendingProducts(limit = 10) {
  const { browsingLocation } = useBrowsingLocation();

  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;
  const hasCoords = !!(lat && lng);

  return useQuery({
    queryKey: ['trending-products', lat, lng, limit],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      if (!hasCoords) return [];

      const { data, error } = await supabase.rpc('search_sellers_by_location', {
        _lat: lat!, _lng: lng!, _radius_km: MARKETPLACE_RADIUS_KM,
      });
      if (error || !data) return [];

      const products: ProductWithSeller[] = [];
      const seen = new Set<string>();

      (data as any[]).forEach((seller) => {
        (seller.matching_products || []).forEach((p: any) => {
          if (seen.has(p.id)) return;
          seen.add(p.id);
          products.push({
            id: p.id, name: p.name, description: null, price: p.price,
            image_url: p.image_url, category: p.category || '', is_veg: p.is_veg ?? true,
            is_available: true, is_bestseller: false, is_recommended: false, is_urgent: false,
            seller_id: seller.seller_id, created_at: '', updated_at: '',
            seller_name: seller.business_name || 'Seller',
            seller_rating: seller.rating || 0,
            action_type: p.action_type || 'add_to_cart',
            contact_phone: p.contact_phone || null,
            mrp: p.mrp || null,
            discount_percentage: p.discount_percentage || null,
            fulfillment_mode: null, delivery_note: null,
            seller_availability_start: seller.availability_start || null,
            seller_availability_end: seller.availability_end || null,
            seller_operating_days: seller.operating_days || null,
            seller_is_available: seller.is_available ?? true,
            distance_km: seller.distance_km ?? null,
            society_name: seller.society_name || null,
            seller_latitude: seller.seller_latitude ?? null,
            seller_longitude: seller.seller_longitude ?? null,
          } as ProductWithSeller);
        });
      });
      return products.slice(0, limit);
    },
    enabled: hasCoords,
    staleTime: jitteredStaleTime(5 * 60 * 1000),
  });
}
