import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { MARKETPLACE_RADIUS_KM } from '@/lib/marketplace-constants';
import { useAuth } from '@/contexts/AuthContext';
import { jitteredStaleTime } from '@/lib/query-utils';

/**
 * Lightweight seller row — NO embedded products, just metadata + product_count.
 * This is the Phase 1 payload for marketplace discovery.
 */
export interface MarketplaceSeller {
  seller_id: string;
  user_id: string;
  business_name: string;
  description: string | null;
  categories: string[] | null;
  primary_group: string | null;
  cover_image_url: string | null;
  profile_image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  rating: number;
  total_reviews: number;
  society_name: string | null;
  availability_start: string | null;
  availability_end: string | null;
  seller_latitude: number | null;
  seller_longitude: number | null;
  operating_days: string[] | null;
  distance_km: number;
  product_count: number;
}

/**
 * Phase 1: Fetch nearby sellers WITHOUT products.
 * Lightweight payload (~500 bytes/seller vs ~5KB with products).
 * Products are fetched separately via useMarketplaceProducts.
 */
export function useMarketplaceSellers() {
  const { browsingLocation } = useBrowsingLocation();
  const { profile } = useAuth();

  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;
  const radiusKm = profile?.search_radius_km ?? MARKETPLACE_RADIUS_KM;

  return useQuery({
    queryKey: ['marketplace-sellers', lat, lng, radiusKm],
    queryFn: async (): Promise<MarketplaceSeller[]> => {
      if (!lat || !lng) return [];

      const { data, error } = await supabase.rpc('search_sellers_paginated' as any, {
        _lat: lat,
        _lng: lng,
        _radius_km: radiusKm,
        _limit: 200,
        _offset: 0,
      });

      if (error) {
        console.error('Marketplace sellers RPC error:', error);
        return [];
      }

      return (data || []) as MarketplaceSeller[];
    },
    enabled: !!(lat && lng),
    staleTime: jitteredStaleTime(10 * 60 * 1000),
  });
}
