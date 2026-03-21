import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface AvailabilityPromptBannerProps {
  sellerId: string;
}

/**
 * Shows a warning banner on the seller dashboard when the seller
 * has service listings but no configured availability schedules.
 */
export function AvailabilityPromptBanner({ sellerId }: AvailabilityPromptBannerProps) {
  const navigate = useNavigate();

  const { data: needsSetup } = useQuery({
    queryKey: ['availability-prompt', sellerId],
    queryFn: async () => {
      // Check if seller has any service listings via products
      const { data: products } = await supabase
        .from('products')
        .select('id')
        .eq('seller_id', sellerId)
        .limit(1);

      if (!products || products.length === 0) return false;

      // Check if any of these products have service listings
      const { count: listingCount } = await (supabase
        .from('service_listings') as any)
        .select('id', { count: 'exact', head: true })
        .in('product_id', products.map(p => p.id));

      if (!listingCount || listingCount === 0) return false;

      // Check if seller has any availability schedules
      const { count: scheduleCount } = await supabase
        .from('service_availability_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .eq('is_active', true);

      return (scheduleCount || 0) === 0;
    },
    enabled: !!sellerId,
    staleTime: 60_000,
  });

  if (!needsSetup) return null;

  return (
    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
        <AlertTriangle size={16} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">Set up your availability</p>
        <p className="text-xs text-amber-700 mt-0.5">
          You have service listings but no availability schedule configured. Buyers won't be able to book until you add time slots.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-7 text-xs gap-1 border-amber-300 text-amber-800 hover:bg-amber-100"
          onClick={() => navigate('/seller/settings')}
        >
          Set Up Now <ArrowRight size={12} />
        </Button>
      </div>
    </div>
  );
}
