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

const BATCH_SIZE = 25;

/**
 * Chunk an array into batches of a given size.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Phase 2: Fetch products for given seller IDs.
 * Batches seller IDs (max 25 per call) to prevent payload overflows
 * and fires parallel RPCs, merging results.
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

      const batches = chunk(sellerIds, BATCH_SIZE);

      // Fire all batches in parallel
      const batchResults = await Promise.all(
        batches.map(async (batchIds) => {
          const { data, error } = await supabase.rpc('get_products_for_sellers' as any, {
            _seller_ids: batchIds,
            _category: category ?? null,
            _limit: limit,
            _offset: offset,
          });

          if (error) {
            console.error('Marketplace products RPC error (batch):', error);
            return [] as MarketplaceProduct[];
          }

          return (data || []) as MarketplaceProduct[];
        })
      );

      // Merge all batch results into a single flat array
      return batchResults.flat();
    },
    enabled: sellerIds.length > 0,
    staleTime: jitteredStaleTime(10 * 60 * 1000),
  });
}
