import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getTerminalStatuses, invalidateStatusFlowCache } from '@/services/statusFlowCache';
import { ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { jitteredStaleTime } from '@/lib/query-utils';
import { compactETA } from '@/lib/etaEngine';
import { TRANSIT_STATUSES } from '@/lib/visibilityEngine';

interface ActiveOrder {
  id: string;
  status: string;
  created_at: string;
  estimated_delivery_at: string | null;
  seller_name: string;
  item_count: number;
  display_label: string | null;
  color: string | null;
  icon: string | null;
  first_product_image: string | null;
}

export function ActiveOrderStrip() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [terminalSet, setTerminalSet] = useState<Set<string> | null>(null);

  useEffect(() => {
    getTerminalStatuses().then(setTerminalSet).catch(() => setTerminalSet(new Set()));
  }, []);

  const { data: activeOrders = [] } = useQuery({
    queryKey: ['active-orders-strip', user?.id],
    queryFn: async (): Promise<ActiveOrder[]> => {
      if (!user?.id || !terminalSet) return [];

      const terminalArr = [...terminalSet];

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, created_at, estimated_delivery_at,
          seller:seller_profiles!orders_seller_id_fkey(business_name),
          order_items(id, product:products(image_url))
        `)
        .eq('buyer_id', user.id)
        .not('status', 'in', `(${terminalArr.map(s => `"${s}"`).join(',')})`)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.warn('[ActiveOrderStrip] Query error:', error.message);
        if (error.code === '22P02') {
          invalidateStatusFlowCache();
        }
        return [];
      }
      if (!data) return [];

      const statusKeys = [...new Set(data.map((o: any) => o.status))];
      const { data: flowData } = await supabase
        .from('category_status_flows')
        .select('status_key, display_label, color, icon')
        .in('status_key', statusKeys);

      const flowMap = new Map<string, { display_label: string | null; color: string | null; icon: string | null }>();
      for (const f of (flowData || []) as any[]) {
        if (!flowMap.has(f.status_key)) {
          flowMap.set(f.status_key, { display_label: f.display_label, color: f.color, icon: f.icon });
        }
      }

      return data.map((o: any) => {
        const flow = flowMap.get(o.status);
        const firstImage = o.order_items?.find((oi: any) => oi.product?.image_url)?.product?.image_url || null;
        return {
          id: o.id,
          status: o.status,
          created_at: o.created_at,
          estimated_delivery_at: o.estimated_delivery_at,
          seller_name: o.seller?.business_name || '',
          item_count: o.order_items?.length || 0,
          display_label: flow?.display_label || o.status.replace(/_/g, ' '),
          color: flow?.color || null,
          icon: flow?.icon || null,
          first_product_image: firstImage,
        };
      });
    },
    enabled: !!user?.id && !!terminalSet,
    staleTime: jitteredStaleTime(30_000),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['active-orders-strip'] });
    };
    window.addEventListener('order-terminal-push', handler);
    return () => window.removeEventListener('order-terminal-push', handler);
  }, [queryClient]);

  if (activeOrders.length === 0) return null;

  return (
    <div className="mt-2 px-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <AnimatePresence>
          {activeOrders.map((order) => {
            const isTransit = TRANSIT_STATUSES.has(order.status as any);
            const etaText = order.estimated_delivery_at ? compactETA(order.estimated_delivery_at) : null;
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="flex items-center gap-2 rounded-xl bg-primary/[0.06] border border-primary/12 px-2.5 py-2 cursor-pointer active:scale-[0.97] transition-transform shrink-0 min-w-0"
                style={{ maxWidth: activeOrders.length === 1 ? '100%' : '70vw' }}
              >
                {/* Thumbnail */}
                <div className="w-9 h-9 rounded-xl bg-primary/10 shrink-0 overflow-hidden flex items-center justify-center">
                  {order.first_product_image ? (
                    <img src={order.first_product_image} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-sm">📦</span>
                  )}
                </div>

                {/* Status + seller */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {isTransit && (
                      <motion.span
                        className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                    <span className="text-xs font-semibold text-foreground truncate">
                      {order.display_label}
                    </span>
                  </div>
                  {order.seller_name && (
                    <span className="text-[10px] text-muted-foreground truncate block">
                      {order.seller_name}
                    </span>
                  )}
                </div>

                {/* ETA or count */}
                <div className="shrink-0 flex items-center gap-1">
                  {etaText ? (
                    <span className="text-[10px] font-bold text-primary whitespace-nowrap">
                      {etaText}
                    </span>
                  ) : order.item_count > 0 ? (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {order.item_count} item{order.item_count > 1 ? 's' : ''}
                    </span>
                  ) : null}
                  <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
