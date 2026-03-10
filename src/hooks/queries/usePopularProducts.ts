import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { useNearbyProducts, mergeProducts } from './useNearbyProducts';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';

/**
 * Popular products discovered via coordinate-based search.
 * Uses search_sellers_by_location with browsingLocation lat/lng.
 */
export function usePopularProducts(limit = 12) {
  const { browsingLocation } = useBrowsingLocation();
  const { data: nearbyProducts } = useNearbyProducts();
  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;

  const localQuery = useQuery({
    queryKey: ['popular-products', lat, lng, limit],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      if (!lat || !lng) return [];

      // Use coordinate-based RPC to find sellers, then extract products
      const { data, error } = await supabase.rpc('search_sellers_by_location' as any, {
        _lat: lat,
        _lng: lng,
        _radius_km: 5, // popular = within 5km
      });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const products: ProductWithSeller[] = [];
      for (const seller of data as any[]) {
        const items = seller.matching_products;
        if (!Array.isArray(items)) continue;
        for (const p of items) {
          products.push({
            ...p,
            seller_id: seller.seller_id,
            seller_name: seller.business_name || 'Seller',
            seller_rating: seller.rating || 0,
            is_available: true,
            is_bestseller: false,
            is_recommended: false,
            is_urgent: false,
            description: null,
            fulfillment_mode: null,
            delivery_note: null,
            seller_availability_start: seller.availability_start || null,
            seller_availability_end: seller.availability_end || null,
            seller_operating_days: seller.operating_days || null,
            seller_is_available: seller.is_available ?? true,
            distance_km: seller.distance_km ?? null,
            society_name: seller.society_name || null,
            created_at: '',
            updated_at: '',
          });
        }
      }

      // Sort: bestsellers first, then by name; limit
      return products.slice(0, limit);
    },
    enabled: !!(lat && lng),
    staleTime: 5 * 60 * 1000,
  });

  const merged = mergeProducts(localQuery.data || [], nearbyProducts);

  return {
    ...localQuery,
    data: merged,
  };
}

/**
 * Products for a specific parentGroup, coordinate-based.
 */
export function useCategoryProducts(parentGroup: string | null) {
  const { data: nearbyProducts } = useNearbyProducts();
  const { browsingLocation } = useBrowsingLocation();
  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;

  const localQuery = useQuery({
    queryKey: ['category-products', parentGroup, lat, lng],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      if (!lat || !lng) return [];

      // Get categories for this parent group
      const { data: catConfigs } = await supabase
        .from('category_config')
        .select('category')
        .eq('parent_group', parentGroup!);

      const categoryList = (catConfigs || []).map((c: any) => c.category);
      if (categoryList.length === 0) return [];

      // Use coordinate-based RPC with category filter
      // We call once per category since the RPC accepts a single _category
      // For efficiency, call without category filter and filter client-side
      const { data, error } = await supabase.rpc('search_sellers_by_location' as any, {
        _lat: lat,
        _lng: lng,
        _radius_km: 10,
      });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const categorySet = new Set(categoryList);
      const products: ProductWithSeller[] = [];

      for (const seller of data as any[]) {
        const items = seller.matching_products;
        if (!Array.isArray(items)) continue;
        for (const p of items) {
          if (!categorySet.has(p.category)) continue;
          products.push({
            ...p,
            seller_id: seller.seller_id,
            seller_name: seller.business_name || 'Seller',
            seller_rating: seller.rating || 0,
            is_available: true,
            is_bestseller: false,
            is_recommended: false,
            is_urgent: false,
            description: null,
            fulfillment_mode: null,
            delivery_note: null,
            seller_availability_start: seller.availability_start || null,
            seller_availability_end: seller.availability_end || null,
            seller_operating_days: seller.operating_days || null,
            seller_is_available: seller.is_available ?? true,
            distance_km: seller.distance_km ?? null,
            society_name: seller.society_name || null,
            created_at: '',
            updated_at: '',
          });
        }
      }
      return products;
    },
    enabled: !!parentGroup && !!(lat && lng),
    staleTime: 3 * 60 * 1000,
  });

  const merged = mergeProducts(localQuery.data || [], nearbyProducts);

  return {
    ...localQuery,
    data: merged,
  };
}
