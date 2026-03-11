import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

export type PeriodFilter = 'today' | '7d' | '30d' | 'all';

function getDateFrom(period: PeriodFilter): string | null {
  const now = new Date();
  switch (period) {
    case 'today': return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case '7d': { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); }
    case '30d': { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString(); }
    default: return null;
  }
}

export function useAdminAnalytics() {
  const [period, setPeriod] = useState<PeriodFilter>('7d');
  const dateFrom = getDateFrom(period);

  // Platform overview
  const overview = useQuery({
    queryKey: ['admin-analytics-overview', period],
    queryFn: async () => {
      const base = supabase.from('orders').select('id, total_amount, status, created_at', { count: 'exact' });
      const q = dateFrom ? base.gte('created_at', dateFrom) : base;
      const { data: orders, count } = await q.neq('status', 'cancelled');

      const totalRevenue = (orders || []).reduce((s, o) => s + (o.total_amount || 0), 0);
      const completedOrders = (orders || []).filter(o => ['completed', 'delivered'].includes(o.status)).length;

      // Active sellers in period
      const sellerQ = supabase.from('seller_profiles').select('id', { count: 'exact' }).eq('verification_status', 'approved').eq('is_available', true);
      const { count: activeSellers } = await sellerQ;

      // Products sold (order_items count)
      const itemsQ = supabase.from('order_items').select('id', { count: 'exact' });
      const { count: productsSold } = dateFrom
        ? await itemsQ.gte('created_at', dateFrom)
        : await itemsQ;

      return { totalOrders: count || 0, totalRevenue, completedOrders, activeSellers: activeSellers || 0, productsSold: productsSold || 0 };
    },
    staleTime: 30_000,
  });

  return { period, setPeriod, overview };
}

// Orders monitor with pagination
export function useOrdersMonitor(filters: {
  status?: string;
  paymentStatus?: string;
  societyId?: string;
  sellerId?: string;
  dateFrom?: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: ['admin-orders-monitor', filters],
    queryFn: async () => {
      const from = filters.page * filters.pageSize;
      const to = from + filters.pageSize - 1;

      let q = supabase.from('orders').select(`
        id, buyer_id, seller_id, society_id, status, total_amount, payment_type, payment_status,
        delivery_address, notes, order_type, created_at, updated_at,
        seller:seller_profiles!orders_seller_id_fkey(id, business_name, user_id),
        buyer:profiles!orders_buyer_id_fkey(id, name, phone, flat_number, block),
        items:order_items(id, product_name, quantity, unit_price, product_id)
      `, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);

      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status as any);
      if (filters.paymentStatus && filters.paymentStatus !== 'all') q = q.eq('payment_status', filters.paymentStatus as any);
      if (filters.societyId) q = q.eq('society_id', filters.societyId);
      if (filters.sellerId) q = q.eq('seller_id', filters.sellerId);
      if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);

      const { data, count, error } = await q;
      if (error) throw error;
      return { orders: data || [], total: count || 0 };
    },
    staleTime: 15_000,
  });
}

// Seller performance
export function useSellerPerformance(period: PeriodFilter) {
  const dateFrom = getDateFrom(period);
  return useQuery({
    queryKey: ['admin-seller-performance', period],
    queryFn: async () => {
      const { data: sellers } = await supabase.from('seller_profiles').select(`
        id, business_name, rating, total_reviews, is_available, verification_status, society_id,
        society:societies!seller_profiles_society_id_fkey(name)
      `).eq('verification_status', 'approved').order('rating', { ascending: false }).limit(200);

      if (!sellers?.length) return [];

      const sellerIds = sellers.map(s => s.id);
      let ordersQ = supabase.from('orders').select('seller_id, total_amount, status, created_at').in('seller_id', sellerIds).neq('status', 'cancelled');
      if (dateFrom) ordersQ = ordersQ.gte('created_at', dateFrom);
      const { data: orders } = await ordersQ;

      const orderMap = new Map<string, { count: number; revenue: number; todayCount: number }>();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      (orders || []).forEach(o => {
        const cur = orderMap.get(o.seller_id) || { count: 0, revenue: 0, todayCount: 0 };
        cur.count++;
        cur.revenue += o.total_amount || 0;
        if (new Date(o.created_at) >= todayStart) cur.todayCount++;
        orderMap.set(o.seller_id, cur);
      });

      return sellers.map(s => ({
        ...s,
        societyName: (s.society as any)?.name || '—',
        orderCount: orderMap.get(s.id)?.count || 0,
        todayOrders: orderMap.get(s.id)?.todayCount || 0,
        revenue: orderMap.get(s.id)?.revenue || 0,
      })).sort((a, b) => b.orderCount - a.orderCount);
    },
    staleTime: 30_000,
  });
}

// Buyer activity
export function useBuyerActivity(period: PeriodFilter) {
  const dateFrom = getDateFrom(period);
  return useQuery({
    queryKey: ['admin-buyer-activity', period],
    queryFn: async () => {
      let ordersQ = supabase.from('orders').select('buyer_id, seller_id, total_amount, status, created_at').neq('status', 'cancelled');
      if (dateFrom) ordersQ = ordersQ.gte('created_at', dateFrom);
      const { data: orders } = await ordersQ.limit(5000);

      const buyerMap = new Map<string, { count: number; totalSpent: number; sellers: Set<string>; lastDate: string }>();
      (orders || []).forEach(o => {
        const cur = buyerMap.get(o.buyer_id) || { count: 0, totalSpent: 0, sellers: new Set(), lastDate: '' };
        cur.count++;
        cur.totalSpent += o.total_amount || 0;
        cur.sellers.add(o.seller_id);
        if (o.created_at > cur.lastDate) cur.lastDate = o.created_at;
        buyerMap.set(o.buyer_id, cur);
      });

      const buyerIds = Array.from(buyerMap.keys()).slice(0, 200);
      if (!buyerIds.length) return [];

      const { data: profiles } = await supabase.from('profiles').select('id, name, phone, flat_number, block, society_id, society:societies!profiles_society_id_fkey(name)').in('id', buyerIds);

      return (profiles || []).map(p => {
        const stats = buyerMap.get(p.id)!;
        return {
          ...p,
          societyName: (p.society as any)?.name || '—',
          orderCount: stats.count,
          totalSpent: stats.totalSpent,
          sellerCount: stats.sellers.size,
          lastOrderDate: stats.lastDate,
        };
      }).sort((a, b) => b.orderCount - a.orderCount);
    },
    staleTime: 30_000,
  });
}

// Society breakdown
export function useSocietyBreakdown(period: PeriodFilter) {
  const dateFrom = getDateFrom(period);
  return useQuery({
    queryKey: ['admin-society-breakdown', period],
    queryFn: async () => {
      const { data: societies } = await supabase.from('societies').select('id, name, member_count, is_verified').eq('is_active', true).order('member_count', { ascending: false }).limit(100);
      if (!societies?.length) return [];

      const { data: sellers } = await supabase.from('seller_profiles').select('id, society_id').eq('verification_status', 'approved');

      let ordersQ = supabase.from('orders').select('society_id, total_amount, status').neq('status', 'cancelled');
      if (dateFrom) ordersQ = ordersQ.gte('created_at', dateFrom);
      const { data: orders } = await ordersQ.limit(5000);

      const sellerCountMap = new Map<string, number>();
      (sellers || []).forEach(s => { if (s.society_id) sellerCountMap.set(s.society_id, (sellerCountMap.get(s.society_id) || 0) + 1); });

      const orderMap = new Map<string, { count: number; revenue: number }>();
      (orders || []).forEach(o => {
        if (!o.society_id) return;
        const cur = orderMap.get(o.society_id) || { count: 0, revenue: 0 };
        cur.count++;
        cur.revenue += o.total_amount || 0;
        orderMap.set(o.society_id, cur);
      });

      return societies.map(s => ({
        ...s,
        sellerCount: sellerCountMap.get(s.id) || 0,
        orderCount: orderMap.get(s.id)?.count || 0,
        revenue: orderMap.get(s.id)?.revenue || 0,
      })).sort((a, b) => b.orderCount - a.orderCount);
    },
    staleTime: 30_000,
  });
}

// Category analytics
export function useCategoryAnalytics(period: PeriodFilter) {
  const dateFrom = getDateFrom(period);
  return useQuery({
    queryKey: ['admin-category-analytics', period],
    queryFn: async () => {
      let q = supabase.from('order_items').select('product_id, product_name, quantity, unit_price, created_at');
      if (dateFrom) q = q.gte('created_at', dateFrom);
      const { data: items } = await q.limit(5000);
      if (!items?.length) return { categories: [], topProducts: [] };

      const productIds = [...new Set((items || []).map(i => i.product_id).filter(Boolean))];
      const { data: products } = await supabase.from('products').select('id, category').in('id', productIds.slice(0, 500));

      const catMap = new Map<string, string>();
      (products || []).forEach(p => catMap.set(p.id, p.category));

      const categoryStats = new Map<string, { orders: number; revenue: number; quantity: number }>();
      const productStats = new Map<string, { name: string; orders: number; revenue: number; quantity: number }>();

      (items || []).forEach(item => {
        const cat = catMap.get(item.product_id || '') || 'unknown';
        const cs = categoryStats.get(cat) || { orders: 0, revenue: 0, quantity: 0 };
        cs.orders++;
        cs.revenue += (item.unit_price || 0) * (item.quantity || 1);
        cs.quantity += item.quantity || 1;
        categoryStats.set(cat, cs);

        const key = item.product_id || item.product_name;
        const ps = productStats.get(key) || { name: item.product_name, orders: 0, revenue: 0, quantity: 0 };
        ps.orders++;
        ps.revenue += (item.unit_price || 0) * (item.quantity || 1);
        ps.quantity += item.quantity || 1;
        productStats.set(key, ps);
      });

      const categories = Array.from(categoryStats.entries()).map(([cat, s]) => ({ category: cat, ...s })).sort((a, b) => b.orders - a.orders);
      const topProducts = Array.from(productStats.entries()).map(([_, s]) => s).sort((a, b) => b.orders - a.orders).slice(0, 20);

      return { categories, topProducts };
    },
    staleTime: 30_000,
  });
}
