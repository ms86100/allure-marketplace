// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const ACTION_LABELS: Record<string, string> = {
  order_created: 'Order placed',
  order_status_changed: 'Status updated',
  payment_confirmed: 'Payment confirmed',
  payment_received: 'Payment received',
  delivery_assigned: 'Delivery partner assigned',
  delivery_picked_up: 'Order picked up',
  delivery_completed: 'Order delivered',
  review_submitted: 'Review submitted',
  order_cancelled: 'Order cancelled',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Order received',
  accepted: 'Seller accepted your order',
  preparing: 'Being prepared',
  ready: 'Ready for pickup',
  picked_up: 'Picked up by delivery',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered successfully',
  completed: 'Order completed',
  cancelled: 'Order cancelled',
  rejected: 'Order rejected by seller',
};

function getTimelineLabel(action: string, metadata: any): string {
  if (action === 'order_status_changed' && metadata?.new_status) {
    return STATUS_LABELS[metadata.new_status] || `Status: ${metadata.new_status.replace(/_/g, ' ')}`;
  }
  return ACTION_LABELS[action] || action.replace(/_/g, ' ');
}

function getActorLabel(actorId: string | null, metadata: any): string {
  if (!actorId) return 'System';
  if (metadata?.actor_role === 'seller') return 'Seller';
  if (metadata?.actor_role === 'buyer') return 'You';
  return 'System';
}

interface OrderTimelineProps {
  orderId: string;
}

export function OrderTimeline({ orderId }: OrderTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: events = [] } = useQuery({
    queryKey: ['order-timeline', orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('id, action, actor_id, metadata, created_at')
        .eq('target_type', 'order')
        .eq('target_id', orderId)
        .order('created_at', { ascending: true });
      return (data || []) as { id: string; action: string; actor_id: string | null; metadata: any; created_at: string }[];
    },
    staleTime: 60_000,
  });

  if (events.length === 0) return null;

  const visibleEvents = isExpanded ? events : events.slice(-3);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full mb-3"
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Order Timeline
        </p>
        {events.length > 3 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {isExpanded ? 'Show less' : `Show all (${events.length})`}
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}
      </button>

      <div className="relative pl-4">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        {visibleEvents.map((event, i) => (
          <div key={event.id} className="relative flex items-start gap-3 pb-3 last:pb-0">
            <div className={cn(
              "w-3 h-3 rounded-full border-2 shrink-0 mt-0.5 -ml-4 z-10",
              i === visibleEvents.length - 1
                ? "bg-primary border-primary"
                : "bg-card border-muted-foreground/30"
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {getTimelineLabel(event.action, event.metadata)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(event.created_at), 'MMM d, h:mm a')}
                {' · '}
                {getActorLabel(event.actor_id, event.metadata)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
