import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { jitteredStaleTime } from '@/lib/query-utils';

/**
 * Fetches trending products based on recent order velocity.
 * Uses society-based RPC when society is available, otherwise falls back
 * to coordinate-based discovery so users without a society still see content.
 */
export function useTrendingProducts(limit = 10) {
  const { effectiveSocietyId } = useAuth();
  const { browsingLocation } = useBrowsingLocation();

  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;
  const hasCoords = !!(lat && lng);

  return useQuery({
    queryKey: ['trending-products', effectiveSocietyId, lat, lng, limit],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      // If we have a society, use the society-based trending RPC (order-velocity based)
      if (effectiveSocietyId) {
        const { data, error } = await supabase.rpc('get_trending_products_by_society', {
          _society_id: effectiveSocietyId,
          _limit: limit,
        });

        if (!error && data && data.length > 0) {
          return data.map((p: any) => ({
            id: p.id, name: p.name, description: p.description, price: p.price,
            image_url: p.image_url, category: p.category, is_veg: p.is_veg,
            is_available: p.is_available, is_bestseller: p.is_bestseller,
            is_recommended: p.is_recommended, is_urgent: p.is_urgent,
            seller_id: p.seller_id, created_at: p.created_at, updated_at: p.updated_at,
            seller_name: p.seller_business_name || 'Seller',
            seller_rating: p.seller_rating || 0,
            completed_order_count: p.seller_completed_order_count || 0,
            last_active_at: p.seller_last_active_at || null,
            fulfillment_mode: p.seller_fulfillment_mode || null,
            delivery_note: p.seller_delivery_note || null,
            seller_availability_start: p.seller_availability_start || null,
            seller_availability_end: p.seller_availability_end || null,
            seller_operating_days: p.seller_operating_days || null,
            seller_is_available: p.seller_is_available ?? true,
            _orderCount: p.order_count || 0,
          }));
        }
      }

      // Fallback: coordinate-based discovery for users without a society
      if (hasCoords) {
        const { data, error } = await supabase.rpc('search_sellers_by_location', {
          _lat: lat!, _lng: lng!, _radius_km: 3,
        });
        if (error || !data) return [];

        const products: ProductWithSeller[] = [];
        (data as any[]).forEach((seller) => {
          (seller.matching_products || []).forEach((p: any) => {
            if (!products.some(x => x.id === p.id)) {
              products.push({
                id: p.id, name: p.name, description: null, price: p.price,
                image_url: p.image_url, category: p.category || '', is_veg: p.is_veg ?? true,
                is_available: true, is_bestseller: false, is_recommended: false, is_urgent: false,
                seller_id: seller.seller_id, created_at: '', updated_at: '',
                seller_name: seller.business_name || 'Seller',
                seller_rating: seller.rating || 0,
                fulfillment_mode: null, delivery_note: null,
              } as ProductWithSeller);
            }
          });
        });
        return products.slice(0, limit);
      }

      return [];
    },
    enabled: !!effectiveSocietyId || hasCoords,
    staleTime: jitteredStaleTime(5 * 60 * 1000),
  });
}
