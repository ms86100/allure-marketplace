import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { jitteredStaleTime } from '@/lib/query-utils';

/**
 * Product row from get_products_for_sellers RPC.
 */
export interface MarketplaceProduct {
  product_id: string;
  seller_id: string;
  product_name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  is_veg: boolean;
  is_available: boolean;
  is_bestseller: boolean;
  is_recommended: boolean;
  is_urgent: boolean;
  action_type: string | null;
  contact_phone: string | null;
  mrp: number | null;
  discount_percentage: number | null;
  description: string | null;
}

/**
 * Phase 2: Fetch products for given seller IDs.
 * Called after sellers are loaded — can be paginated or filtered by category.
 */
export function useMarketplaceProducts(
  sellerIds: string[],
  options?: { category?: string; limit?: number; offset?: number }
) {
  const { category, limit = 500, offset = 0 } = options ?? {};
  const sortedIds = [...sellerIds].sort();
  const idsKey = sortedIds.join(',');

  return useQuery({
    queryKey: ['marketplace-products', idsKey, category ?? 'all', limit, offset],
    queryFn: async (): Promise<MarketplaceProduct[]> => {
      if (sellerIds.length === 0) return [];

      const { data, error } = await supabase.rpc('get_products_for_sellers' as any, {
        _seller_ids: sellerIds,
        _category: category ?? null,
        _limit: limit,
        _offset: offset,
      });

      if (error) {
        console.error('Marketplace products RPC error:', error);
        return [];
      }

      return (data || []) as MarketplaceProduct[];
    },
    enabled: sellerIds.length > 0,
    staleTime: jitteredStaleTime(10 * 60 * 1000),
  });
}
