import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches admin_settings keys relevant to the marketplace UI.
 * Returns a typed config object with fallbacks.
 */
interface MarketplaceConfig {
  lowStockThreshold: number;
  fulfillmentLabels: Record<string, string>;
}

const DEFAULTS: MarketplaceConfig = {
  lowStockThreshold: 5,
  fulfillmentLabels: {
    delivery: '🚚 Delivery',
    self_pickup: '📍 Pickup',
    both: '🚚 Delivery & Pickup',
  },
};

export function useMarketplaceConfig() {
  const { data: config = DEFAULTS } = useQuery({
    queryKey: ['marketplace-config'],
    queryFn: async (): Promise<MarketplaceConfig> => {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['low_stock_threshold', 'fulfillment_labels'])
        .eq('is_active', true);

      if (error) {
        console.error('Failed to fetch marketplace config:', error);
        return DEFAULTS;
      }

      const map: Record<string, string> = {};
      for (const row of data || []) {
        if (row.key && row.value) map[row.key] = row.value;
      }

      let fulfillmentLabels = DEFAULTS.fulfillmentLabels;
      try {
        if (map.fulfillment_labels) {
          fulfillmentLabels = JSON.parse(map.fulfillment_labels);
        }
      } catch { /* use defaults */ }

      return {
        lowStockThreshold: parseInt(map.low_stock_threshold || '5', 10) || 5,
        fulfillmentLabels,
      };
    },
    staleTime: 15 * 60 * 1000, // 15 min — rarely changes
  });

  return config;
}
