import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { jitteredStaleTime } from '@/lib/query-utils';

export interface SystemSettings {
  baseDeliveryFee: number;
  freeDeliveryThreshold: number;
  platformFeePercent: number;
  supportEmail: string;
  grievanceEmail: string;
  dpoEmail: string;
  grievanceOfficerName: string;
  headerTagline: string;
  appVersion: string;
}

const DEFAULTS: SystemSettings = {
  baseDeliveryFee: 20,
  freeDeliveryThreshold: 500,
  platformFeePercent: 0,
  supportEmail: 'support@sociva.com',
  grievanceEmail: 'grievance@sociva.in',
  dpoEmail: 'dpo@sociva.com',
  grievanceOfficerName: 'Sociva Grievance Cell',
  headerTagline: 'Your Society, Your Store',
  appVersion: '2.0.0',
};

export function useSystemSettings(): SystemSettings {
  const { data = DEFAULTS } = useQuery({
    queryKey: ['system-settings-core'],
    queryFn: async (): Promise<SystemSettings> => {
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', [
          'base_delivery_fee', 'free_delivery_threshold', 'platform_fee_percent',
          'support_email', 'grievance_email', 'dpo_email', 'grievance_officer_name',
          'header_tagline', 'app_version',
        ]);

      const map: Record<string, string> = {};
      for (const row of data || []) {
        if (row.key && row.value) map[row.key] = row.value;
      }

      return {
        baseDeliveryFee: parseInt(map.base_delivery_fee || '20', 10) || 20,
        freeDeliveryThreshold: parseInt(map.free_delivery_threshold || '500', 10) || 500,
        platformFeePercent: parseFloat(map.platform_fee_percent || '0') || 0,
        supportEmail: map.support_email || DEFAULTS.supportEmail,
        grievanceEmail: map.grievance_email || DEFAULTS.grievanceEmail,
        dpoEmail: map.dpo_email || DEFAULTS.dpoEmail,
        grievanceOfficerName: map.grievance_officer_name || DEFAULTS.grievanceOfficerName,
        headerTagline: map.header_tagline || DEFAULTS.headerTagline,
        appVersion: map.app_version || DEFAULTS.appVersion,
      };
    },
    staleTime: jitteredStaleTime(15 * 60 * 1000),
  });

  return data;
}
