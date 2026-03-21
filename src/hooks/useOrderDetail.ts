import { useState, useEffect, useMemo } from 'react';
import { getTrackingConfigSync } from '@/services/trackingConfig';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useStatusLabels } from '@/hooks/useStatusLabels';
import { useUrgentOrderSound } from '@/hooks/useUrgentOrderSound';
import { useCurrency } from '@/hooks/useCurrency';
import { useCategoryStatusFlow, getNextStatusForActor, getTimelineSteps, isTerminalStatus, isSuccessfulTerminal, isFirstFlowStep, canActorCancel, useStatusTransitions } from '@/hooks/useCategoryStatusFlow';
import { logAudit } from '@/lib/audit';
import { resolveTransactionType } from '@/lib/resolveTransactionType';
import { Order, OrderStatus } from '@/types/database';
import { toast } from 'sonner';

export function useOrderDetail(id: string | undefined) {
  const { user, isSeller, sellerProfiles, currentSellerId } = useAuth();
  const { getOrderStatus, getPaymentStatus, getItemStatus } = useStatusLabels();
  const { formatPrice } = useCurrency();
  const [order, setOrder] = useState<Order | null>(null);
  const [hasReview, setHasReview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isRejectionDialogOpen, setIsRejectionDialogOpen] = useState(false);

  const seller = (order as any)?.seller;

  // Robust seller ownership: match order.seller_id against currentSellerId or any of the user's seller profiles
  // This avoids depending on the nested seller relation being fully hydrated
  const isSellerView = useMemo(() => {
    if (!order || !user) return false;
    const orderSellerId = order.seller_id;
    if (!orderSellerId) return false;
    // Primary: match against current seller context
    if (currentSellerId && orderSellerId === currentSellerId) return true;
    // Fallback: match against any seller profile the current user owns
    if (sellerProfiles.some(sp => sp.id === orderSellerId)) return true;
    // Legacy fallback: nested relation check (kept for edge cases)
    if (seller?.user_id === user.id) return true;
    return false;
  }, [order?.seller_id, user?.id, currentSellerId, sellerProfiles, seller?.user_id]);

  const hasAutoCancelAt = !!order?.auto_cancel_at;

  const sellerPrimaryGroup = seller?.primary_group;
  const orderType = (order as any)?.order_type;
  const [derivedParentGroup, setDerivedParentGroup] = useState<string | null>(null);

  useEffect(() => {
    if (sellerPrimaryGroup || !order?.id) return;
    (async () => {
      const { data } = await supabase.from('order_items').select('product_id').eq('order_id', order.id).limit(1).maybeSingle();
      if (!data?.product_id) return;
      const { data: product } = await supabase.from('products').select('category').eq('id', data.product_id).single();
      if (!product?.category) return;
      const { data: catConfig } = await supabase.from('category_config').select('parent_group').eq('category', product.category as any).single();
      if (catConfig?.parent_group) setDerivedParentGroup(catConfig.parent_group);
    })();
  }, [sellerPrimaryGroup, order?.id]);

  const effectiveParentGroup = sellerPrimaryGroup || derivedParentGroup;
  const isEnquiryOrder = (order as any)?.order_type === 'enquiry';
  const orderFulfillmentType = (order as any)?.fulfillment_type || 'self_pickup';
  const deliveryHandledBy = (order as any)?.delivery_handled_by || null;
  const { flow, isLoading: isFlowLoading } = useCategoryStatusFlow(effectiveParentGroup, orderType, orderFulfillmentType, deliveryHandledBy);

  const isUrgentOrder = hasAutoCancelAt && !!order?.status && isFirstFlowStep(flow, order.status);
  const isUrgentSellerView = isUrgentOrder && isSellerView;
  const isUrgentBuyerView = isUrgentOrder && !isSellerView;

  useUrgentOrderSound(!!isUrgentSellerView);

  // Load transitions for accurate next-status and cancellation checks
  const resolvedTxnType = useMemo(
    () => resolveTransactionType(effectiveParentGroup || 'default', orderType, orderFulfillmentType, deliveryHandledBy),
    [effectiveParentGroup, orderType, orderFulfillmentType, deliveryHandledBy]
  );
  const transitions = useStatusTransitions(effectiveParentGroup || 'default', resolvedTxnType);

  const timelineSteps = useMemo(() => getTimelineSteps(flow, order?.status), [flow, order?.status]);

  // Status order derived entirely from DB flow — no hardcoded fallbacks
  const statusOrder = useMemo(() => {
    if (flow.length > 0) return flow.map(s => s.status_key as OrderStatus);
    return [] as OrderStatus[];
  }, [flow]);

  const currentStatusIndex = order ? statusOrder.indexOf(order.status) : -1;

  const getNextStatus = (): OrderStatus | null => {
    if (!order) return null;
    if (isTerminalStatus(flow, order.status)) return null;
    if (flow.length > 0) {
      const next = getNextStatusForActor(flow, order.status, 'seller', transitions);
      return next as OrderStatus | null;
    }
    return null;
  };

  // Buyer's next allowed action — DB-driven via transitions
  const buyerNextStatus = useMemo((): OrderStatus | null => {
    if (!order || isTerminalStatus(flow, order.status)) return null;
    if (flow.length === 0 || transitions.length === 0) return null;
    const next = getNextStatusForActor(flow, order.status, 'buyer', transitions);
    return next as OrderStatus | null;
  }, [order?.status, flow, transitions]);

  // Check if seller can reject (transition to cancelled exists for seller)
  const canSellerReject = useMemo(() => {
    if (!order || !isSellerView) return false;
    return canActorCancel(transitions, order.status, 'seller');
  }, [order?.status, isSellerView, transitions]);

  // Check if buyer can cancel (transition to cancelled exists for buyer)
  const canBuyerCancel = useMemo(() => {
    if (!order) return false;
    return canActorCancel(transitions, order.status, 'buyer');
  }, [order?.status, transitions]);

  // Re-fetch when app resumes (Deep link from Dynamic Island) or visibility changes
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    const onResume = () => setRefetchTick(t => t + 1);
    const onVisibility = () => { if (document.visibilityState === 'visible') setRefetchTick(t => t + 1); };
    const onTerminalPush = () => setRefetchTick(t => t + 1);
    window.addEventListener('order-detail-refetch', onResume);
    window.addEventListener('order-terminal-push', onTerminalPush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('order-detail-refetch', onResume);
      window.removeEventListener('order-terminal-push', onTerminalPush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { let cancelled = false; if (id) { fetchOrder(cancelled); fetchUnreadCount(); } return () => { cancelled = true; }; }, [id, refetchTick]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`order-${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => { fetchOrder(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Reliability fallback: heartbeat polling while order is active so timeout-driven
  // state changes always reconcile even if realtime delivery is delayed.
  useEffect(() => {
    if (!id || !order || isTerminalStatus(flow, order.status)) return;
    const interval = window.setInterval(() => {
      fetchOrder();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [id, order?.status, flow]);

  const fetchOrder = async (cancelled = false) => {
    try {
      const { data, error } = await supabase.from('orders').select(`*, seller:seller_profiles(id, business_name, user_id, primary_group, profile:profiles!seller_profiles_user_id_fkey(name, phone, block, flat_number)), buyer:profiles!orders_buyer_id_fkey(name, phone, block, flat_number), items:order_items(*)`).eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) { setOrder(null); return; }
      if (cancelled) return;
      setOrder(data as any);
      // Always check for review if flow says terminal-success, OR if flow isn't loaded yet (fallback: check anyway to avoid stale hasReview)
      if (data?.status && (flow.length === 0 || isSuccessfulTerminal(flow, data.status))) {
        const { data: reviewData } = await supabase.from('reviews').select('id').eq('order_id', id).maybeSingle();
        if (!cancelled) setHasReview(!!reviewData);
      } else {
        // Bug 4 fix: Never reset hasReview to false once it's been confirmed true — prevents flash
        if (!cancelled && !hasReview) setHasReview(false);
      }
    } catch (error) { console.error('Error fetching order:', error); }
    finally { if (!cancelled) setIsLoading(false); }
  };

  /** Buyer-safe status advance via SECURITY DEFINER RPC — bypasses RLS correctly */
  const buyerAdvanceOrder = async (newStatus: OrderStatus) => {
    if (!order || !user) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase.rpc('buyer_advance_order', {
        _order_id: order.id,
        _new_status: newStatus,
      });
      if (error) throw error;
      setOrder({ ...order, status: newStatus });
      supabase.functions.invoke('process-notification-queue').catch(() => {});
      if (order.society_id) logAudit(`order_${newStatus}`, 'order', order.id, order.society_id, { old_status: order.status, new_status: newStatus });
    } catch (error: any) {
      console.error('Buyer advance order failed:', error);
      const errMsg = error?.message || error?.details || '';
      toast.error(errMsg.includes('Invalid buyer transition') ? 'This action is no longer available' : `Failed to update order: ${errMsg || 'Unknown error'}`, { id: `order-${order.id}-error` });
      fetchOrder(); // Re-fetch to get real state
    } finally { setIsUpdating(false); }
  };

  const fetchUnreadCount = async () => {
    if (!user || !id) return;
    const { count } = await supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('order_id', id).eq('receiver_id', user.id).eq('read_status', false);
    setUnreadMessages(count || 0);
  };

  const updateOrderStatus = async (newStatus: OrderStatus, rejectionReason?: string) => {
    if (!order || !user) return;
    setIsUpdating(true);
    try {
      const updateData: any = { status: newStatus, auto_cancel_at: null };
      if (rejectionReason) updateData.rejection_reason = rejectionReason;
      let query = supabase.from('orders').update(updateData).eq('id', order.id).eq('status', order.status as any).select();
      if (isSellerView) query = query.eq('seller_id', order.seller_id);
      else query = query.eq('buyer_id', user.id);
      const { data: updatedRows, error } = await query;
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        // Concurrent update detected — refetch real state
        fetchOrder();
        toast.error('Order status has changed. Refreshing...', { id: `order-${order.id}-conflict` });
        return;
      }
      // Re-fetch full order to sync server-side computed fields (ready_at, status_updated_at, etc.)
      fetchOrder();
      supabase.functions.invoke('process-notification-queue').catch(() => {});
      if (order.society_id) logAudit(`order_${newStatus}`, 'order', order.id, order.society_id, { old_status: order.status, new_status: newStatus, rejection_reason: rejectionReason });
    } catch (error: any) {
      console.error('Error updating order:', error, JSON.stringify(error));
      const errMsg = error?.message || error?.details || '';
      toast.error(errMsg.includes('Invalid status transition') ? 'Invalid status transition — you cannot skip steps' : `Failed to update order: ${errMsg || 'Unknown error'}`, { id: `order-${order.id}-error` });
    } finally { setIsUpdating(false); }
  };

  const handleReject = async (reason: string) => { await updateOrderStatus('cancelled', reason); };
  const handleTimeout = () => { fetchOrder(); };

  const isBuyerView = order ? order.buyer_id === user?.id : false;
  const nextStatus = getNextStatus();
  const canReview = isBuyerView && order ? isSuccessfulTerminal(flow, order.status) && !hasReview : false;
  const canChat = order ? !isTerminalStatus(flow, order.status) : false;
  const canReorder = isBuyerView && order ? isSuccessfulTerminal(flow, order.status) : false;
  let chatRecipientId = isSellerView ? order?.buyer_id : seller?.user_id;
  let chatRecipientName = isSellerView ? (order as any)?.buyer?.name : seller?.business_name;
  // Guard: if recipient resolved to self (dual-role user edge case), flip to the other party
  if (chatRecipientId && user?.id && chatRecipientId === user.id) {
    chatRecipientId = isSellerView ? seller?.user_id : order?.buyer_id;
    chatRecipientName = isSellerView ? seller?.business_name : (order as any)?.buyer?.name;
  }

  const copyOrderId = () => { if (!order) return; navigator.clipboard.writeText(order.id.slice(0, 8)); toast.success('Order ID copied', { id: 'order-id-copied' }); };

  // Display statuses derived entirely from DB flow
  const displayStatuses = useMemo(() => {
    if (timelineSteps.length === 0) return [];
    const steps = timelineSteps.map(s => s.status_key);
    // Only hide 'completed' when 'delivered' is itself a terminal step (i.e. they are redundant)
    if (steps.includes('delivered') && steps.includes('completed')) {
      const deliveredStep = timelineSteps.find(s => s.status_key === 'delivered');
      if (deliveredStep?.is_terminal) {
        return steps.filter(s => s !== 'completed');
      }
    }
    return steps;
  }, [timelineSteps]);

  // Helper: get label from flow step if available, else fall back to useStatusLabels
  const getFlowStepLabel = (statusKey: string): { label: string; color: string } => {
    const step = flow.find(s => s.status_key === statusKey);
    if (step?.display_label) {
      return { label: step.display_label, color: step.color || 'bg-gray-100 text-gray-600' };
    }
    return getOrderStatus(statusKey);
  };

  // Helper: get buyer hint from flow step
  const getBuyerHint = (statusKey: string): string | null => {
    const step = flow.find(s => s.status_key === statusKey);
    return step?.buyer_hint || null;
  };

  // Helper: get seller hint from flow step
  const getSellerHint = (statusKey: string): string | null => {
    const step = flow.find(s => s.status_key === statusKey);
    return (step as any)?.seller_hint || null;
  };

  // Derive isInTransit from DB-backed flow: statuses between 'picked_up' and terminal are transit.
  // For robustness, check if status actor is 'delivery' or if it matches known transit keys from flow.
  const isInTransit = useMemo(() => {
    if (!order) return false;
    // Primary: check DB-backed transit_statuses from system_settings
    const transitStatuses = getTrackingConfigSync().transit_statuses;
    if (transitStatuses.includes(order.status)) return true;
    // Secondary: check if flow step actor is 'delivery'
    const transitStep = flow.find(s => s.status_key === order.status);
    if (transitStep?.actor === 'delivery') return true;
    return false;
  }, [order?.status, flow]);

  return {
    order, setOrder, isLoading, isUpdating, hasReview, setHasReview,
    isChatOpen, setIsChatOpen, unreadMessages, fetchUnreadCount,
    isRejectionDialogOpen, setIsRejectionDialogOpen,
    seller, isSellerView, isUrgentOrder, isUrgentSellerView, isUrgentBuyerView, isBuyerView, isEnquiryOrder,
    nextStatus, buyerNextStatus, canReview, canChat, canReorder,
    canSellerReject, canBuyerCancel, isInTransit, isFlowLoading,
    chatRecipientId, chatRecipientName,
    orderFulfillmentType, currentStatusIndex, statusOrder,
    displayStatuses, timelineSteps, flow,
    getOrderStatus, getPaymentStatus, getItemStatus,
    getFlowStepLabel, getBuyerHint, getSellerHint,
    formatPrice, user,
    updateOrderStatus, buyerAdvanceOrder, handleReject, handleTimeout, copyOrderId, fetchOrder,
  };
}
