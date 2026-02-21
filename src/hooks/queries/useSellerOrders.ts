import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 20;

interface SellerDashboardStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  preparingOrders: number;
  readyOrders: number;
  todayOrders: number;
  totalEarnings: number;
  todayEarnings: number;
  weekEarnings: number;
}

/**
 * Consolidated seller dashboard stats — merges old useSellerOrderStats + useSellerOrderFilterCounts
 * into a single query with 3 lightweight DB calls instead of 15.
 */
export function useSellerOrderStats(sellerId: string | null) {
  return useQuery({
    queryKey: ['seller-dashboard-stats', sellerId],
    queryFn: async (): Promise<SellerDashboardStats> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekISO = weekStart.toISOString();

      // Single query: fetch status + total_amount + created_at for all seller orders
      // With 1-2 users this is tiny; even at scale the seller's own orders are bounded
      const { data: orders } = await supabase
        .from('orders')
        .select('status, total_amount, created_at')
        .eq('seller_id', sellerId!);

      const rows = orders || [];

      let totalOrders = 0;
      let pendingOrders = 0;
      let completedOrders = 0;
      let preparingOrders = 0;
      let readyOrders = 0;
      let todayOrders = 0;
      let totalEarnings = 0;
      let todayEarnings = 0;
      let weekEarnings = 0;

      for (const row of rows) {
        totalOrders++;
        const amt = Number(row.total_amount) || 0;
        const isToday = row.created_at >= todayISO;
        const isWeek = row.created_at >= weekISO;

        switch (row.status) {
          case 'completed':
          case 'delivered':
            completedOrders++;
            totalEarnings += amt;
            if (isToday) todayEarnings += amt;
            if (isWeek) weekEarnings += amt;
            break;
          case 'preparing':
            preparingOrders++;
            pendingOrders++;
            break;
          case 'ready':
            readyOrders++;
            pendingOrders++;
            break;
          case 'cancelled':
            break;
          default:
            // placed, accepted, etc. = pending
            pendingOrders++;
            break;
        }

        if (isToday) todayOrders++;
      }

      return {
        totalOrders,
        pendingOrders,
        completedOrders,
        preparingOrders,
        readyOrders,
        todayOrders,
        totalEarnings,
        todayEarnings,
        weekEarnings,
      };
    },
    enabled: !!sellerId,
    staleTime: 10_000, // 10s — prevents refetch on every tab switch
  });
}

/**
 * Filter counts derived from the same stats query — no extra DB calls needed.
 */
export function useSellerOrderFilterCounts(sellerId: string | null) {
  const { data: stats } = useSellerOrderStats(sellerId);

  return useQuery({
    queryKey: ['seller-order-filter-counts', sellerId],
    queryFn: () => ({
      all: stats?.totalOrders || 0,
      today: stats?.todayOrders || 0,
      pending: stats?.pendingOrders || 0,
      preparing: stats?.preparingOrders || 0,
      ready: stats?.readyOrders || 0,
      completed: stats?.completedOrders || 0,
    }),
    enabled: !!sellerId && !!stats,
    staleTime: 10_000,
  });
}

export function useSellerOrdersInfinite(sellerId: string | null, filter: string = 'all') {
  return useInfiniteQuery({
    queryKey: ['seller-orders', sellerId, filter],
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('orders')
        .select(`*, buyer:profiles!orders_buyer_id_fkey(name, block, flat_number), items:order_items(id, product_name, quantity, unit_price, status)`)
        .eq('seller_id', sellerId!)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      // Apply filter
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      switch (filter) {
        case 'today':
          query = query.gte('created_at', today.toISOString());
          break;
        case 'pending':
          query = query.in('status', ['placed', 'accepted']);
          break;
        case 'preparing':
          query = query.eq('status', 'preparing');
          break;
        case 'ready':
          query = query.eq('status', 'ready');
          break;
        case 'completed':
          query = query.eq('status', 'completed');
          break;
      }

      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data } = await query;
      return (data as any[]) || [];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1]?.created_at;
    },
    enabled: !!sellerId,
    staleTime: 10_000,
  });
}
