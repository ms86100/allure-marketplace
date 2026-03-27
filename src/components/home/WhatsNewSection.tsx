import { useQuery } from '@tanstack/react-query';
import { optimizedImageUrl, handleImageError } from '@/utils/imageHelpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { MARKETPLACE_RADIUS_KM } from '@/lib/marketplace-constants';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { jitteredStaleTime } from '@/lib/query-utils';

/**
 * Plan #18: Dormant user re-engagement.
 * Shows new sellers that joined since the user's last order (if 2+ weeks ago).
 */
export function WhatsNewSection() {
  const { user } = useAuth();
  const { browsingLocation } = useBrowsingLocation();

  // Reuse the same query key as WelcomeBackStrip to avoid duplicate DB calls
  const { data: lastOrderCtx } = useQuery({
    queryKey: ['last-order-context', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, status, created_at, seller:seller_profiles!orders_seller_id_fkey(business_name)')
        .eq('buyer_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; status: string; created_at: string; seller: { business_name: string } | null } | null;
    },
    enabled: !!user?.id,
    staleTime: jitteredStaleTime(5 * 60_000),
  });

  const lastOrderDate = lastOrderCtx?.created_at ?? null;

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const isDormant = lastOrderDate && new Date(lastOrderDate) < twoWeeksAgo;

  const { data: newSellers = [] } = useQuery({
    queryKey: ['new-sellers-since', lastOrderDate, browsingLocation?.lat],
    queryFn: async () => {
      if (!lastOrderDate || !browsingLocation?.lat) return [];

      const { data } = await supabase
        .from('seller_profiles')
        .select('id, business_name, cover_image_url')
        .gte('created_at', lastOrderDate)
        .eq('is_available', true)
        .eq('verification_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(6);

      return (data || []) as { id: string; business_name: string; cover_image_url: string | null }[];
    },
    enabled: !!isDormant && !!browsingLocation?.lat,
    staleTime: jitteredStaleTime(10 * 60_000),
  });

  if (!isDormant || newSellers.length === 0) return null;

  return (
    <div className="px-4 mt-5">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Sparkles size={14} className="text-warning" />
        <h3 className="text-sm font-bold text-foreground">What's new since your last visit</h3>
      </div>
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
        {newSellers.map((s) => (
          <Link
            key={s.id}
            to={`/sellers/${s.id}`}
            className="shrink-0 w-28 active:scale-[0.97] transition-transform"
          >
            <div className="w-28 h-28 rounded-xl bg-muted overflow-hidden">
              {s.cover_image_url ? (
                <img src={optimizedImageUrl(s.cover_image_url, { width: 200, quality: 70 })} alt={s.business_name} className="w-full h-full object-cover" loading="lazy" onError={handleImageError} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">🏪</div>
              )}
            </div>
            <p className="text-xs font-medium mt-1 truncate text-foreground">{s.business_name}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
