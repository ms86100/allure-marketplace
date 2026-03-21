import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Package, ChevronRight } from 'lucide-react';
import { jitteredStaleTime } from '@/lib/query-utils';

/**
 * Plan #15: Welcome back context strip.
 * Shows "Last order: [Seller] · [date]" when user has no active orders
 * but does have order history.
 */
export function WelcomeBackStrip() {
  const { user } = useAuth();

  const { data: lastOrder } = useQuery({
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

  if (!lastOrder?.seller) return null;

  const dateLabel = format(new Date(lastOrder.created_at), 'MMM d');
  const statusLabel = lastOrder.status.replace(/_/g, ' ');

  return (
    <Link
      to={`/orders/${lastOrder.id}`}
      className="mx-4 mt-2 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs active:scale-[0.99] transition-transform"
    >
      <Package size={14} className="text-muted-foreground shrink-0" />
      <span className="text-muted-foreground truncate">
        Last order: <span className="font-medium text-foreground">{lastOrder.seller.business_name}</span> · {dateLabel} · <span className="capitalize">{statusLabel}</span>
      </span>
      <ChevronRight size={14} className="text-muted-foreground/40 shrink-0 ml-auto" />
    </Link>
  );
}
