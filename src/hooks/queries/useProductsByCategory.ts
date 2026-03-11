import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { jitteredStaleTime } from '@/lib/query-utils';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { MARKETPLACE_RADIUS_KM } from '@/lib/marketplace-constants';

interface CategoryGroup {
  category: string;
  parentGroup: string;
  displayName: string;
  icon: string;
  products: ProductWithSeller[];
}

/**
 * Coordinate-based product discovery grouped by category.
 * Uses search_sellers_by_location RPC with browsingLocation lat/lng.
 */
export function useProductsByCategory(limit = 50) {
  const { browsingLocation } = useBrowsingLocation();
  const queryClient = useQueryClient();
  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;

  const localQuery = useQuery({
    queryKey: ['products-by-category', lat, lng, limit],
    queryFn: async (): Promise<CategoryGroup[]> => {
      if (!lat || !lng) return [];

      let configs: any[] | undefined = queryClient.getQueryData(['category-configs']);

      const configPromise = configs
        ? Promise.resolve(configs)
        : supabase
            .from('category_config')
            .select('category, display_name, icon, supports_cart, parent_group')
            .eq('is_active', true)
            .order('display_order')
            .then(({ data }) => data || []);

      // Use coordinate-based RPC
      const rpcPromise = supabase.rpc('search_sellers_by_location' as any, {
        _lat: lat,
        _lng: lng,
        _radius_km: MARKETPLACE_RADIUS_KM,
      });

      const [resolvedConfigs, rpcResult] = await Promise.all([configPromise, rpcPromise]);

      if (rpcResult.error) throw rpcResult.error;

      // Build config map
      const configMap = new Map(
        (resolvedConfigs || []).map((c: any) => [
          c.category,
          { parent_group: c.parent_group || c.parentGroup, display_name: c.display_name || c.displayName, icon: c.icon },
        ])
      );

      // Flatten seller → products
      const allProducts: ProductWithSeller[] = [];
      for (const seller of (rpcResult.data || []) as any[]) {
        const items = seller.matching_products;
        if (!Array.isArray(items)) continue;
        for (const p of items) {
          allProducts.push({
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

      // Group by category
      const grouped: Record<string, ProductWithSeller[]> = {};
      for (const product of allProducts) {
        const cat = product.category;
        if (!grouped[cat]) grouped[cat] = [];
        if (grouped[cat].length < limit) grouped[cat].push(product);
      }

      const result: CategoryGroup[] = [];
      for (const [category, items] of Object.entries(grouped)) {
        const cfg = configMap.get(category);
        result.push({
          category,
          parentGroup: cfg?.parent_group || category,
          displayName: cfg?.display_name || category,
          icon: cfg?.icon || '📦',
          products: items,
        });
      }

      return result;
    },
    enabled: !!(lat && lng),
    staleTime: jitteredStaleTime(10 * 60 * 1000),
  });

  return {
    ...localQuery,
    data: localQuery.data || [],
  };
}
