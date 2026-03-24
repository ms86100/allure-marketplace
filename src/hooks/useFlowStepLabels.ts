import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { jitteredStaleTime } from '@/lib/query-utils';
import { useStatusLabels } from '@/hooks/useStatusLabels';

interface FlowLabel {
  label: string;
  color: string;
}

/**
 * Batch-fetches display_label + color from category_status_flows for all distinct status keys.
 * Falls back to useStatusLabels (system_settings / hardcoded) when no workflow label exists.
 *
 * Use this in list views (OrdersPage, SellerOrderCard) where per-order flow loading is too expensive.
 */
export function useFlowStepLabels() {
  const { getOrderStatus } = useStatusLabels();

  const { data: flowLabelMap } = useQuery({
    queryKey: ['flow-step-labels-batch'],
    queryFn: async (): Promise<Record<string, FlowLabel>> => {
      // Bug 1 fix: Only fetch 'default' parent_group labels to avoid cross-workflow contamination.
      // Detail page uses per-order flow for accurate labels; list views use this canonical baseline.
      const { data, error } = await supabase
        .from('category_status_flows')
        .select('status_key, display_label, color')
        .eq('parent_group', 'default');

      if (error || !data) return {};

      // Build lookup: prefer the first non-null display_label found per status_key
      const map: Record<string, FlowLabel> = {};
      for (const row of data) {
        if (!row.status_key) continue;
        // Only set if we don't have one yet, or if this row has a display_label and the existing one doesn't
        if (!map[row.status_key] || (!map[row.status_key].label && row.display_label)) {
          if (row.display_label) {
            map[row.status_key] = {
              label: row.display_label,
              color: row.color || 'bg-gray-100 text-gray-600',
            };
          }
        }
      }
      return map;
    },
    staleTime: jitteredStaleTime(30 * 60 * 1000),
  });

  const getFlowLabel = (statusKey: string): FlowLabel => {
    const flowLabel = flowLabelMap?.[statusKey];
    if (flowLabel) return flowLabel;
    // Fallback to system_settings / hardcoded labels
    return getOrderStatus(statusKey);
  };

  return { getFlowLabel };
}
