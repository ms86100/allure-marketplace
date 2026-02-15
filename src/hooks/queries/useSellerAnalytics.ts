import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SellerAnalytics {
  topProducts: { product_name: string; total_ordered: number }[];
  peakHours: { hour: number; order_count: number }[];
  repeatCustomers: number;
  totalCustomers: number;
  cancellationRate: number;
  totalOrders: number;
}

export function useSellerAnalytics(sellerId: string | null) {
  return useQuery({
    queryKey: ['seller-analytics', sellerId],
    queryFn: async (): Promise<SellerAnalytics> => {
      if (!sellerId) throw new Error('No seller ID');

      // Top products by order count
      const { data: topProducts } = await supabase
        .from('order_items')
        .select('product_name, quantity, order:orders!inner(seller_id, status)')
        .eq('order.seller_id', sellerId)
        .neq('order.status', 'cancelled');

      const productCounts: Record<string, number> = {};
      (topProducts || []).forEach((item: any) => {
        productCounts[item.product_name] = (productCounts[item.product_name] || 0) + item.quantity;
      });
      const sortedProducts = Object.entries(productCounts)
        .map(([product_name, total_ordered]) => ({ product_name, total_ordered }))
        .sort((a, b) => b.total_ordered - a.total_ordered)
        .slice(0, 5);

      // All orders for this seller
      const { data: allOrders } = await supabase
        .from('orders')
        .select('id, buyer_id, status, created_at')
        .eq('seller_id', sellerId);

      const orders = allOrders || [];
      const totalOrders = orders.length;
      const cancelledOrders = orders.filter((o) => o.status === 'cancelled').length;
      const cancellationRate = totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 100) : 0;

      // Peak hours
      const hourCounts: Record<number, number> = {};
      orders.forEach((o) => {
        const hour = new Date(o.created_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      const peakHours = Object.entries(hourCounts)
        .map(([hour, order_count]) => ({ hour: Number(hour), order_count }))
        .sort((a, b) => b.order_count - a.order_count)
        .slice(0, 5);

      // Repeat customers
      const buyerCounts: Record<string, number> = {};
      orders.filter((o) => o.status !== 'cancelled').forEach((o) => {
        buyerCounts[o.buyer_id] = (buyerCounts[o.buyer_id] || 0) + 1;
      });
      const totalCustomers = Object.keys(buyerCounts).length;
      const repeatCustomers = Object.values(buyerCounts).filter((c) => c >= 2).length;

      return {
        topProducts: sortedProducts,
        peakHours,
        repeatCustomers,
        totalCustomers,
        cancellationRate,
        totalOrders,
      };
    },
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
  });
}
