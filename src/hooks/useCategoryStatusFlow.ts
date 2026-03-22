import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveTransactionType } from '@/lib/resolveTransactionType';
import { jitteredStaleTime } from '@/lib/query-utils';

export interface StatusFlowStep {
  status_key: string;
  sort_order: number;
  is_deprecated?: boolean;
  actor: string;
  is_terminal: boolean;
  is_success: boolean;
  requires_otp: boolean;
  display_label: string | null;
  color: string | null;
  icon: string | null;
  buyer_hint: string | null;
}

export interface StatusTransition {
  from_status: string;
  to_status: string;
  allowed_actor: string;
  is_side_action: boolean;
}

/** Shared fetch function — also used for prefetching from useCartPage */
export async function fetchStatusFlow(parentGroup: string, transactionType: string): Promise<StatusFlowStep[]> {
  let { data, error } = await supabase
    .from('category_status_flows')
    .select('status_key, sort_order, actor, is_terminal, is_success, requires_otp, display_label, color, icon, buyer_hint, is_deprecated')
    .eq('parent_group', parentGroup)
    .eq('transaction_type', transactionType)
    .order('sort_order', { ascending: true });

  if (!error && (!data || data.length === 0) && parentGroup !== 'default') {
    const fallback = await supabase
      .from('category_status_flows')
      .select('status_key, sort_order, actor, is_terminal, is_success, requires_otp, display_label, color, icon, buyer_hint, is_deprecated')
      .eq('parent_group', 'default')
      .eq('transaction_type', transactionType)
      .order('sort_order', { ascending: true });
    if (!fallback.error && fallback.data) data = fallback.data;
  }

  return (data as StatusFlowStep[]) || [];
}

/** Shared fetch function for transitions — also used for prefetching */
export async function fetchStatusTransitions(parentGroup: string, transactionType: string): Promise<StatusTransition[]> {
  let { data } = await supabase
    .from('category_status_transitions')
    .select('from_status, to_status, allowed_actor, is_side_action')
    .eq('parent_group', parentGroup)
    .eq('transaction_type', transactionType);

  if ((!data || data.length === 0) && parentGroup !== 'default') {
    const fallback = await supabase
      .from('category_status_transitions')
      .select('from_status, to_status, allowed_actor, is_side_action')
      .eq('parent_group', 'default')
      .eq('transaction_type', transactionType);
    if (fallback.data) data = fallback.data;
  }

  return (data as StatusTransition[]) || [];
}

/** Query key builders for external prefetching */
export const statusFlowQueryKey = (parentGroup: string, transactionType: string) =>
  ['status-flow', parentGroup, transactionType] as const;

export const statusTransitionsQueryKey = (parentGroup: string, transactionType: string) =>
  ['status-transitions', parentGroup, transactionType] as const;

/**
 * Fetches category-driven status flow using React Query for caching.
 * Flow data rarely changes so a 5-minute staleTime eliminates re-fetches
 * when navigating back to order detail pages.
 */
export function useCategoryStatusFlow(
  sellerPrimaryGroup: string | null | undefined,
  orderType: string | null | undefined,
  fulfillmentType?: string | null,
  deliveryHandledBy?: string | null
) {
  const parentGroup = sellerPrimaryGroup || 'default';
  const transactionType = useMemo(
    () => resolveTransactionType(parentGroup, orderType, fulfillmentType, deliveryHandledBy),
    [parentGroup, orderType, fulfillmentType, deliveryHandledBy]
  );

  const { data, isLoading } = useQuery({
    queryKey: statusFlowQueryKey(parentGroup, transactionType),
    queryFn: () => fetchStatusFlow(parentGroup, transactionType),
    staleTime: jitteredStaleTime(5 * 60 * 1000),
    enabled: !!transactionType,
  });

  return { flow: data || [], isLoading };
}



/**
 * Given a flow, transitions, current status, and actor, returns valid next statuses
 * the actor can transition to. Uses category_status_transitions for accurate results.
 */
export function getNextStatusesForActor(
  transitions: StatusTransition[],
  currentStatus: string,
  actor: string
): string[] {
  return transitions
    .filter(t => t.from_status === currentStatus && t.allowed_actor === actor)
    .map(t => t.to_status);
}

/**
 * Given a flow + current status + actor, returns the next status the actor can move to.
 * Now uses transitions table instead of array position.
 * Falls back to linear flow if no transitions loaded.
 */
export function getNextStatusForActor(
  flow: StatusFlowStep[],
  currentStatus: string,
  actor: string,
  transitions?: StatusTransition[]
): string | null {
  // If transitions are available, use them (accurate non-linear lookup)
  if (transitions && transitions.length > 0) {
    // Only consider non-side-action transitions for primary CTA
    const primaryTransitions = transitions.filter(t => !t.is_side_action);
    const validNextStatuses = getNextStatusesForActor(primaryTransitions, currentStatus, actor);
    if (validNextStatuses.length === 0) return null;
    // Pick the one that's next in sort_order (forward progression)
    const flowOrder = flow.map(s => s.status_key);
    const sorted = validNextStatuses
      .filter(s => s !== 'cancelled')
      .sort((a, b) => flowOrder.indexOf(a) - flowOrder.indexOf(b));
    return sorted[0] || null;
  }

  // Fallback: linear flow (legacy behavior)
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
/**
 * Returns the display steps for the timeline.
 * Filters out deprecated steps unless the order is currently IN that state.
 */
export function getTimelineSteps(flow: StatusFlowStep[], currentStatus?: string): StatusFlowStep[] {
  return flow.filter(s => {
    if (s.is_terminal && !s.is_success) return false;
    if (s.is_deprecated && s.status_key !== currentStatus) return false;
    return true;
  });
}

/**
 * Check if a given status is terminal in the flow.
 */
export function isTerminalStatus(flow: StatusFlowStep[], status: string): boolean {
  const step = flow.find(s => s.status_key === status);
  return step?.is_terminal === true;
}

/**
 * Check if a status is a successful terminal state.
 * Fully DB-driven: uses is_terminal AND is_success flags from category_status_flows.
 */
export function isSuccessfulTerminal(flow: StatusFlowStep[], status: string): boolean {
  const step = flow.find(s => s.status_key === status);
  return step?.is_terminal === true && step?.is_success === true;
}

/**
 * Check if the first (lowest sort_order) non-terminal step in the flow matches the given status.
 * Used for "just placed" celebration banner without hardcoding 'placed'.
 */
export function isFirstFlowStep(flow: StatusFlowStep[], status: string): boolean {
  const nonTerminal = flow.filter(s => !s.is_terminal);
  if (nonTerminal.length === 0) return false;
  return nonTerminal[0].status_key === status;
}

/**
 * Check if a given next-status step requires OTP verification.
 * Fully DB-driven: uses requires_otp flag from category_status_flows.
 */
export function stepRequiresOtp(flow: StatusFlowStep[], statusKey: string): boolean {
  const step = flow.find(s => s.status_key === statusKey);
  return step?.requires_otp === true;
}

/**
 * Hook that fetches all terminal status keys from the DB once and caches them.
 * Useful for list views (OrdersPage) where per-order flow loading is too expensive.
 */
export function useTerminalStatuses() {
  const [terminalSet, setTerminalSet] = useState<Set<string>>(new Set());
  const [successSet, setSuccessSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('category_status_flows')
        .select('status_key, is_terminal, is_success')
        .eq('is_terminal', true);

      if (data) {
        const all = new Set(data.map(d => d.status_key));
        const success = new Set(
          data.filter(d => d.is_success === true).map(d => d.status_key)
        );
        setTerminalSet(all);
        setSuccessSet(success);
      }
    })();
  }, []);

  return { terminalSet, successSet };
}

/**
 * Check if a specific actor can transition from currentStatus to 'cancelled'.
 */
export function canActorCancel(
  transitions: StatusTransition[],
  currentStatus: string,
  actor: string
): boolean {
  return transitions.some(
    t => t.from_status === currentStatus && t.to_status === 'cancelled' && t.allowed_actor === actor
  );
}

/**
 * Returns side-action transitions available for an actor from a given status.
 * These are transitions like reschedule/no-show that should appear as secondary buttons, not the primary CTA.
 */
export function getSideActionsForActor(
  transitions: StatusTransition[],
  currentStatus: string,
  actor: string
): StatusTransition[] {
  return transitions.filter(
    t => t.from_status === currentStatus && t.allowed_actor === actor && t.is_side_action
  );
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
      let { data } = await supabase
        .from('category_status_transitions')
        .select('from_status, to_status, allowed_actor, is_side_action')
        .eq('parent_group', parentGroup)
        .eq('transaction_type', transactionType);

      // Fallback to 'default' if no rows found for specific parent_group
      if ((!data || data.length === 0) && parentGroup !== 'default') {
        const fallback = await supabase
          .from('category_status_transitions')
          .select('from_status, to_status, allowed_actor, is_side_action')
          .eq('parent_group', 'default')
          .eq('transaction_type', transactionType);

        if (fallback.data) data = fallback.data;
      }

      if (data) setTransitions(data as StatusTransition[]);
    })();
  }, [parentGroup, transactionType]);

  return transitions;
}
