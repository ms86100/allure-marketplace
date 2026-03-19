import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getTerminalStatuses } from '@/services/statusFlowCache';
import { useNavigate } from 'react-router-dom';
import { Package, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

const TRANSIT_STATUSES = new Set(['on_the_way', 'out_for_delivery', 'at_gate', 'in_transit']);

/**
 * Compact ETA strip shown in the header area when there's an active order.
 * Implements "time anchoring" — the user always sees delivery progress
 * regardless of which screen they're on.
 */
export function ActiveOrderETA() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [terminalSet, setTerminalSet] = useState<Set<string> | null>(null);

  useEffect(() => {
    getTerminalStatuses().then(setTerminalSet).catch(() => setTerminalSet(new Set()));
  }, []);

  const { data: activeOrder } = useQuery({
    queryKey: ['active-order-eta', user?.id],
    queryFn: async () => {
      if (!user?.id || !terminalSet) return null;
      const terminalArr = [...terminalSet];
      const { data } = await supabase
        .from('orders')
        .select('id, status, estimated_delivery_at')
        .eq('buyer_id', user.id)
        .not('status', 'in', `(${terminalArr.map(s => `"${s}"`).join(',')})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id && !!terminalSet,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Listen for terminal pushes → invalidate to clear stale strip
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['active-order-eta'] });
    };
    window.addEventListener('order-terminal-push', handler);
    return () => window.removeEventListener('order-terminal-push', handler);
  }, [queryClient]);

  if (!activeOrder) return null;

  const etaMinutes = activeOrder.estimated_delivery_at
    ? Math.max(0, Math.ceil((new Date(activeOrder.estimated_delivery_at).getTime() - Date.now()) / 60000))
    : null;

  const isArriving = etaMinutes !== null && etaMinutes <= 0;
  const isTransit = TRANSIT_STATUSES.has(activeOrder.status || '');

  const etaText = etaMinutes !== null
    ? isArriving
      ? 'Arriving now'
      : `${etaMinutes} min`
    : null;

  const statusLabel = activeOrder.status?.replace(/_/g, ' ') || 'Processing';

  return (
    <AnimatePresence>
      <motion.button
        key="active-eta"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={() => navigate(`/orders/${activeOrder.id}`)}
        className="w-full flex items-center gap-2.5 px-4 py-2 bg-primary/8 border-b border-primary/15 overflow-hidden"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Package size={14} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0 text-left flex items-center gap-2">
          {/* Pulsing dot for transit statuses — activity illusion */}
          {isTransit && (
            <motion.span
              className="w-2 h-2 rounded-full bg-green-500 shrink-0"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <p className="text-[12px] font-bold text-foreground capitalize truncate">
            {statusLabel}
          </p>
        </div>
        {etaText && (
          <span className={`text-[12px] font-extrabold whitespace-nowrap ${isArriving ? 'text-green-600 dark:text-green-400' : 'text-primary'}`}>
            {etaText}
          </span>
        )}
        <ChevronRight size={14} className="text-muted-foreground shrink-0" />
      </motion.button>
    </AnimatePresence>
  );
}
