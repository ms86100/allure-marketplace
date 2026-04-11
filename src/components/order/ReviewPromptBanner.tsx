// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Star } from 'lucide-react';
import { ReviewForm } from '@/components/review/ReviewForm';

/**
 * Shows a review prompt banner on the Orders page for completed orders without reviews.
 */
export function ReviewPromptBanner() {
  const { user } = useAuth();

  const { data: unreviewedOrder } = useQuery({
    queryKey: ['unreviewed-order', user?.id],
    queryFn: async () => {
      // Find the most recent completed/delivered order that has no review
      const { data: orders } = await supabase
        .from('orders')
        .select('id, seller_id, status, created_at, seller:seller_profiles!orders_seller_id_fkey(business_name)')
        .eq('buyer_id', user!.id)
        .in('status', ['delivered', 'completed', 'picked_up_by_buyer'] as any)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!orders || orders.length === 0) return null;

      // Check which ones have reviews
      const orderIds = orders.map(o => o.id);
      const { data: reviews } = await supabase
        .from('reviews')
        .select('order_id')
        .eq('buyer_id', user!.id)
        .in('order_id', orderIds);

      const reviewedSet = new Set((reviews || []).map(r => r.order_id));
      return orders.find(o => !reviewedSet.has(o.id)) || null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  if (!unreviewedOrder) return null;

  const seller = (unreviewedOrder as any).seller;

  return (
    <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Star className="text-warning shrink-0" size={18} />
        <div>
          <p className="text-sm font-semibold">Rate your recent order</p>
          <p className="text-[11px] text-muted-foreground">
            from {seller?.business_name || 'a seller'}
          </p>
        </div>
      </div>
      <ReviewForm
        orderId={unreviewedOrder.id}
        sellerId={unreviewedOrder.seller_id}
        sellerName={seller?.business_name || 'Seller'}
      />
    </div>
  );
}
