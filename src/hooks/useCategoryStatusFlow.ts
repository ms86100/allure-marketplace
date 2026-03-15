import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StatusFlowStep {
  status_key: string;
  sort_order: number;
  actor: string;
  is_terminal: boolean;
  display_label: string | null;
  color: string | null;
  icon: string | null;
  buyer_hint: string | null;
}

export interface StatusTransition {
  from_status: string;
  to_status: string;
  allowed_actor: string;
}

/**
 * Fetches category-driven status flow for an order based on its seller's
 * parent_group and the order's type (purchase vs enquiry vs booking).
 */
export function useCategoryStatusFlow(
  sellerPrimaryGroup: string | null | undefined,
  orderType: string | null | undefined,
  fulfillmentType?: string | null
) {
  const [flow, setFlow] = useState<StatusFlowStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const transactionType = resolveTransactionType(sellerPrimaryGroup || 'default', orderType, fulfillmentType);

    (async () => {
      // Try specific parent_group first, then fallback to 'default'
      const parentGroup = sellerPrimaryGroup || 'default';
      
      let { data, error } = await supabase
        .from('category_status_flows')
        .select('status_key, sort_order, actor, is_terminal, display_label, color, icon, buyer_hint')
        .eq('parent_group', parentGroup)
        .eq('transaction_type', transactionType)
        .order('sort_order', { ascending: true });

      // Fallback to 'default' if no rows found for specific parent_group
      if (!error && (!data || data.length === 0) && parentGroup !== 'default') {
        const fallback = await supabase
          .from('category_status_flows')
          .select('status_key, sort_order, actor, is_terminal, display_label, color, icon, buyer_hint')
          .eq('parent_group', 'default')
          .eq('transaction_type', transactionType)
          .order('sort_order', { ascending: true });
        
        if (!fallback.error && fallback.data) {
          data = fallback.data;
        }
      }

      if (!error && data) {
        setFlow(data as StatusFlowStep[]);
      }
      setIsLoading(false);
    })();
  }, [sellerPrimaryGroup, orderType, fulfillmentType]);

  return { flow, isLoading };
}

function resolveTransactionType(
  parentGroup: string,
  orderType: string | null | undefined,
  fulfillmentType?: string | null
): string {
  if (orderType === 'enquiry') {
    if (['classes', 'events'].includes(parentGroup)) return 'book_slot';
    return 'request_service';
  }
  if (orderType === 'booking') {
    return 'service_booking';
  }
  // Self-pickup or seller-delivery → self_fulfillment (no delivery partner steps)
  if (fulfillmentType && ['self_pickup', 'seller_delivery'].includes(fulfillmentType)) {
    return 'self_fulfillment';
  }
  return 'cart_purchase';
}

/**
 * Given a flow + current status + actor, returns the next status the actor can move to.
 */
export function getNextStatusForActor(
  flow: StatusFlowStep[],
  currentStatus: string,
  actor: string
): string | null {
  const currentIndex = flow.findIndex(s => s.status_key === currentStatus);
  if (currentIndex === -1) return null;

  const next = flow[currentIndex + 1];
  if (!next) return null;

  // Seller can only advance to seller-actionable steps
  if (actor === 'seller' && next.actor !== 'seller') return null;

  return next.status_key;
}

/**
 * Returns the display steps for the timeline (non-terminal, non-cancelled).
 */
export function getTimelineSteps(flow: StatusFlowStep[]): StatusFlowStep[] {
  return flow.filter(s => !s.is_terminal && s.status_key !== 'cancelled');
}

/**
 * Hook to fetch allowed transitions for a workflow.
 */
export function useStatusTransitions(
  parentGroup: string | null | undefined,
  transactionType: string | null | undefined
) {
  const [transitions, setTransitions] = useState<StatusTransition[]>([]);

  useEffect(() => {
    if (!parentGroup || !transactionType) return;

    (async () => {
      const { data } = await supabase
        .from('category_status_transitions')
        .select('from_status, to_status, allowed_actor')
        .eq('parent_group', parentGroup)
        .eq('transaction_type', transactionType);

      if (data) setTransitions(data as StatusTransition[]);
    })();
  }, [parentGroup, transactionType]);

  return transitions;
}
