import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getTerminalStatuses, invalidateStatusFlowCache } from '@/services/statusFlowCache';
import { Package, ChevronRight, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { jitteredStaleTime } from '@/lib/query-utils';

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
          order_items(id)
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

      // Fetch display labels for these statuses from category_status_flows
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
        };
      });
    },
    enabled: !!user?.id && !!terminalSet,
    staleTime: jitteredStaleTime(30_000),
    refetchInterval: 60_000,
  });

  if (activeOrders.length === 0) return null;

  return (
    <div className="px-4 mt-3 space-y-2">
      <AnimatePresence>
        {activeOrders.map((order) => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={() => navigate(`/orders/${order.id}`)}
            className="rounded-2xl bg-primary/5 border border-primary/15 px-4 py-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Package size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-foreground truncate">
                  {order.display_label}
                </span>
                {order.color && (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${order.color.split(' ')[0]}`}
                  />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {order.seller_name}{order.seller_name && order.item_count > 0 ? ' · ' : ''}
                {order.item_count > 0 && `${order.item_count} item${order.item_count > 1 ? 's' : ''}`}
                {order.estimated_delivery_at && (() => {
                  const mins = Math.max(0, Math.ceil((new Date(order.estimated_delivery_at).getTime() - Date.now()) / 60000));
                  if (mins <= 0) return ' · Arriving soon';
                  if (mins <= 60) return ` · ETA ${mins} min`;
                  return '';
                })()}
              </p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground shrink-0" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
