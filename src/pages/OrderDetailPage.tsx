import { useParams, Link, useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SafeHeader } from '@/components/layout/SafeHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewForm } from '@/components/review/ReviewForm';
import { OrderChat } from '@/components/chat/OrderChat';
import { OrderCancellation } from '@/components/order/OrderCancellation';
import { BuyerCancelBooking } from '@/components/booking/BuyerCancelBooking';
import { ReorderButton } from '@/components/order/ReorderButton';
import { UrgentOrderTimer } from '@/components/order/UrgentOrderTimer';
import { OrderRejectionDialog } from '@/components/order/OrderRejectionDialog';
import { DeliveryStatusCard } from '@/components/delivery/DeliveryStatusCard';
import { LiveDeliveryTracker } from '@/components/delivery/LiveDeliveryTracker';
import { DeliveryArrivalOverlay } from '@/components/order/DeliveryArrivalOverlay';
import { BuyerDeliveryConfirmation } from '@/components/order/BuyerDeliveryConfirmation';
import { DeliveryETABanner } from '@/components/order/DeliveryETABanner';
import { SellerGPSTracker } from '@/components/delivery/SellerGPSTracker';
import { UpdateBuyerLocationButton } from '@/components/delivery/UpdateBuyerLocationButton';
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking';
import { useSystemSettingsRaw } from '@/hooks/useSystemSettingsRaw';
import { useTrackingConfig } from '@/hooks/useTrackingConfig';
import { DeliveryCompletionOtpDialog } from '@/components/delivery/DeliveryCompletionOtpDialog';
import { DeliveryFeedbackForm } from '@/components/delivery/DeliveryFeedbackForm';
import { GenericOtpDialog } from '@/components/order/GenericOtpDialog';
import { GenericOtpCard } from '@/components/order/GenericOtpCard';

import { OrderItemCard } from '@/components/order/OrderItemCard';
import { AppointmentDetailsCard } from '@/components/order/AppointmentDetailsCard';
import { useServiceBookingForOrder } from '@/hooks/useServiceBookings';
import { FeedbackSheet } from '@/components/feedback/FeedbackSheet';
import { SellerPaymentConfirmation } from '@/components/payment/SellerPaymentConfirmation';
import { SellerCodConfirmation } from '@/components/payment/SellerCodConfirmation';
import { PaymentProofReadonly } from '@/components/payment/PaymentProofReadonly';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { OrderItem, OrderStatus, PaymentStatus, ItemStatus } from '@/types/database';
import { isTerminalStatus, isSuccessfulTerminal, isFirstFlowStep, stepRequiresOtp, getStepOtpType } from '@/hooks/useCategoryStatusFlow';
import { ArrowLeft, Phone, MapPin, Check, Star, MessageCircle, CreditCard, XCircle, Package, ChevronRight, Copy, Truck, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getString, setString } from '@/lib/persistent-kv';

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { Capacitor } from '@capacitor/core';

// Gap 10: Lazy-load map to avoid bundling Leaflet for non-delivery orders
const DeliveryMapView = lazy(() => import('@/components/delivery/DeliveryMapView').then(m => ({ default: m.DeliveryMapView })));

function PaymentConfirmingBanner() {
  const [showTimeout, setShowTimeout] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowTimeout(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg bg-warning/10 border border-warning/20">
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-warning shrink-0" />
        <p className="text-xs text-foreground">
          <span className="font-semibold">Payment received!</span>{' '}
          {showTimeout
            ? 'Your payment is safe. We\'re still confirming with the bank.'
            : 'Confirming your order — this usually takes a few seconds.'}
        </p>
      </div>
      {showTimeout && (
        <Button
          variant="outline"
          size="sm"
          className="self-start h-7 text-xs border-warning/30 text-warning hover:bg-warning/10"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={12} className="mr-1" />
          Refresh status
        </Button>
      )}
    </div>
  );
}

function CelebrationBanner({ order, isBuyerView, flow }: { order: any; isBuyerView: boolean; flow: any }) {
  const show = isBuyerView && isSuccessfulTerminal(flow, order.status) && !getString(`celebration_${order.id}`);
  useEffect(() => {
    if (show) setString(`celebration_${order.id}`, 'true');
  }, [show, order.id]);
  if (!show) return null;
  // Bug 3 fix: Use status_updated_at if available and cap at 120 min for accuracy
  const terminalTs = order.status_updated_at || order.updated_at || order.created_at;
  const durationMs = new Date(terminalTs).getTime() - new Date(order.created_at).getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));
  const showDuration = durationMin <= 120;
  return (
    <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 text-center animate-in fade-in slide-in-from-top-2 duration-500">
      <span className="text-3xl">🎊</span>
      <p className="text-sm font-bold text-accent mt-1.5">{showDuration ? `Delivered in ${durationMin} min!` : 'Order Complete!'}</p>
      <p className="text-xs text-muted-foreground mt-0.5">Thank you for supporting your community</p>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const o = useOrderDetail(id);
  const [deliveryAssignmentId, setDeliveryAssignmentId] = useState<string | null>(null);
  const [isOtpDialogOpen, setIsOtpDialogOpen] = useState(false);
  const [isGenericOtpDialogOpen, setIsGenericOtpDialogOpen] = useState(false);
  const [genericOtpTargetStatus, setGenericOtpTargetStatus] = useState<string | null>(null);
  const [hasDeliveryFeedback, setHasDeliveryFeedback] = useState(false);
  const [buyerOtp, setBuyerOtp] = useState<string | null>(null);
  const [roadEtaMinutes, setRoadEtaMinutes] = useState<number | null>(null);
  const { data: serviceBooking } = useServiceBookingForOrder(o.order?.id);
  const { getSetting } = useSystemSettingsRaw(['proximity_thresholds', 'ui_setting_up_tracking']);

  const order = o.order;
  const orderId = order?.id;
  const fulfillmentType = o.orderFulfillmentType;
  // Bug 4 fix: Self-pickup guard — fulfillmentType is ground truth for physical delivery
  const hasDeliverySteps = o.flow.some((s: any) => s.is_transit === true);
  const isDeliveryOrder = fulfillmentType !== 'self_pickup' && 
    (hasDeliverySteps || ['delivery', 'seller_delivery'].includes(fulfillmentType));

  const deliveryTracking = useDeliveryTracking(deliveryAssignmentId, o.isInTransit);
  const trackingConfig = useTrackingConfig();

  // Defensive guard: end any lingering Live Activity if order is terminal
  useEffect(() => {
    if (!orderId || !order?.status) return;
    if (!Capacitor.isNativePlatform()) return;
    if (isTerminalStatus(o.flow, order.status)) {
      LiveActivityManager.end(orderId).catch(() => {});
    }
  }, [orderId, order?.status]);

  // RECONCILIATION: If buyer opens a payment_pending online order, trigger backend verification
  const reconcileAttemptedRef = useRef(false);
  useEffect(() => {
    if (!orderId || !order || reconcileAttemptedRef.current) return;
    if (order.status !== 'payment_pending') return;
    if (!o.isBuyerView) return;
    const razorpayOrderId = (order as any).razorpay_order_id;
    if (!razorpayOrderId) return;

    reconcileAttemptedRef.current = true;
    console.log(`[Payment][reconcile] Triggering reconciliation for order=${orderId} razorpay_order_id=${razorpayOrderId}`);
    
    supabase.functions.invoke('confirm-razorpay-payment', {
      body: {
        razorpay_payment_id: null,
        razorpay_order_id: razorpayOrderId,
        order_ids: [orderId],
        source: 'order_detail_reconcile',
      },
    }).then(({ error }) => {
      if (error) {
        console.warn('[Payment][reconcile] result=failed', error);
      } else {
        console.log('[Payment][reconcile] result=success, refetching order');
        o.fetchOrder?.();
      }
    }).catch(err => {
      console.warn('[Payment][reconcile] result=call_failed', err);
    });
  }, [orderId, order?.status]);

  // Gap A: Fetch delivery OTP for buyer display
  // Resilient assignment hydration: fetch + subscribe to INSERT & UPDATE + retry on missing
  const [assignmentRetryCount, setAssignmentRetryCount] = useState(0);

  useEffect(() => {
    if (!isDeliveryOrder || !orderId) return;

    const fetchAssignment = () => {
      supabase
        .from('delivery_assignments')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) { console.warn('Assignment fetch error:', error.message); return; }
          if (data) setDeliveryAssignmentId(data.id);
          else {
            // Retry up to 10 times with increasing delay when order is in delivery stages
            if (assignmentRetryCount < 10) {
              const delay = Math.min(1500 * (assignmentRetryCount + 1), 15000);
              setTimeout(() => setAssignmentRetryCount(c => c + 1), delay);
            }
          }
        });
    };
    fetchAssignment();

    // Subscribe to both INSERT and UPDATE on delivery_assignments for this order
    const channel = supabase
      .channel(`assignment-watch-${orderId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'delivery_assignments',
        filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        const newId = (payload.new as any)?.id;
        if (newId) setDeliveryAssignmentId(newId as string);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId, isDeliveryOrder, assignmentRetryCount]);

  // Gap A: Fetch delivery OTP for buyer + Gap 9: Subscribe to realtime updates
  useEffect(() => {
    if (!deliveryAssignmentId || !isDeliveryOrder) return;

    // Initial fetch
    supabase
      .from('delivery_assignments')
      .select('delivery_code')
      .eq('id', deliveryAssignmentId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.delivery_code) setBuyerOtp(data.delivery_code);
      });

    // Realtime subscription for delivery_code changes
    const otpChannel = supabase
      .channel(`otp-watch-${deliveryAssignmentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'delivery_assignments',
        filter: `id=eq.${deliveryAssignmentId}`,
      }, (payload) => {
        const code = (payload.new as any)?.delivery_code;
        if (code) setBuyerOtp(code);
      })
      .subscribe();

    return () => { supabase.removeChannel(otpChannel); };
  }, [isDeliveryOrder, deliveryAssignmentId]);

  // Listen for OTP-required events from updateOrderStatus (backend rejection auto-opens dialog)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.orderId === orderId) setIsOtpDialogOpen(true);
    };
    window.addEventListener('delivery-otp-required', handler);
    return () => window.removeEventListener('delivery-otp-required', handler);
  }, [orderId]);

  if (o.isLoading) return <AppLayout showHeader={false}><div className="p-4 space-y-3"><Skeleton className="h-8 w-32" /><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div></AppLayout>;
  if (!order) return <AppLayout showHeader={false}><div className="p-4 text-center py-16"><p className="text-sm text-muted-foreground">Order not found</p><Link to="/orders"><Button size="sm" className="mt-4">View Orders</Button></Link></div></AppLayout>;

  const seller = o.seller;
  const sellerProfile = seller?.profile;
  const buyer = (order as any).buyer;
  const items: OrderItem[] = (order as any).items || [];
  const hasItemsField = 'items' in (order as any);
  const statusInfo = o.getFlowStepLabel(order.status);
  const paymentStatusInfo = o.getPaymentStatus((order.payment_status as PaymentStatus) || 'pending');
  const displayStatuses = o.displayStatuses;
  const isInTransit = o.isInTransit;
  // Workflow-driven: derive current step actor(s) for actor-based tracking
  const currentActors = (o.currentStepActor || '').split(',').map(a => a.trim());

  // Gap G: Only show arrival overlay for BUYER when rider is close AND order is not terminal
  const showArrivalOverlay = o.isBuyerView && !isTerminalStatus(o.flow, order.status) && deliveryAssignmentId && deliveryTracking.riderLocation && deliveryTracking.distance != null && deliveryTracking.distance < trackingConfig.arrival_overlay_distance_meters;


  const hasSellerActionBar = o.isSellerView && !o.isFlowLoading && o.flow.length > 0 && !isTerminalStatus(o.flow, order.status);
  const hasBuyerActionBar = o.isBuyerView && !o.isFlowLoading && o.flow.length > 0 && !isTerminalStatus(o.flow, order.status) && (o.buyerNextStatus || o.canBuyerCancel);

  // Dynamic action label: workflow-driven with end-state awareness
  const getActionLabel = (status: string, otpRequired: boolean) => {
    const step = o.flow.find(s => s.status_key === status);
    const label = step?.display_label || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const isEnd = step?.is_terminal === true;
    if (otpRequired) return isEnd ? 'Verify & Complete' : `Verify & ${label}`;
    return isEnd ? 'Complete Order' : `Mark ${label}`;
  };

  return (
    <AppLayout showHeader={false} showNav={!hasSellerActionBar || !o.isSellerView}>
      <div className="pb-56">
        {/* Header */}
        <SafeHeader>
        <div className="px-4 pb-3.5 flex items-center gap-3">
          <button onClick={() => { if (location.state?.from === 'deeplink' || window.history.length <= 2) { navigate('/orders'); } else { navigate(-1); } }} className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold">Order Summary</h1>
            <button onClick={o.copyOrderId} className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">#{order.id.slice(0, 8)} <Copy size={10} /></button>
            {o.isSellerView && o.resolvedTxnType && (
              <p className="text-[9px] text-muted-foreground/60 font-mono truncate">workflow: {o.resolvedParentGroup} / {o.resolvedTxnType}</p>
            )}
          </div>
          {o.canChat && o.chatRecipientId ? (
            <button onClick={() => o.setIsChatOpen(true)} className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted">
              <MessageCircle size={16} />
              {o.unreadMessages > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{o.unreadMessages}</span>}
            </button>
          ) : isTerminalStatus(o.flow, order.status) ? (
            <Link to="/help" className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted opacity-50" title="Chat closed — order complete. Need help?">
              <MessageCircle size={16} className="text-muted-foreground" />
            </Link>
          ) : null}
        </div>
        </SafeHeader>

        <div className="px-4 pt-3 space-y-3">
          {/* Delivery completion celebration — shown once for delivered/completed orders */}
          <CelebrationBanner order={order} isBuyerView={o.isBuyerView} flow={o.flow} />

          {/* Gap 11: Order placed celebration banner — shown for newly placed orders, NOT payment_pending */}
          {o.isBuyerView && isFirstFlowStep(o.flow, order.status) && order.status !== 'payment_pending' && (Date.now() - new Date(order.created_at).getTime() < 60000) && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center animate-in fade-in slide-in-from-top-2 duration-500">
              <span className="text-3xl">🎉</span>
              <p className="text-sm font-bold text-primary mt-1.5">Order Placed Successfully!</p>
              <p className="text-xs text-muted-foreground mt-0.5">Your order is being reviewed by the seller</p>
              {(order as any).estimated_delivery_at && (
                <p className="text-xs font-medium text-primary mt-1">
                  Estimated delivery: {format(new Date((order as any).estimated_delivery_at), 'h:mm a')}
                </p>
              )}
            </div>
          )}

          {/* Scheduled delivery date — Pre-order */}
          {(order as any).scheduled_date && (
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-start gap-2.5">
              <Clock size={16} className="text-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">Scheduled Order</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  📅 {format(new Date((order as any).scheduled_date), 'EEEE, MMM d, yyyy')}
                  {(order as any).scheduled_time_start && ` at ${(order as any).scheduled_time_start.slice(0, 5)}`}
                </p>
              </div>
            </div>
          )}

          {/* Buyer-side urgent countdown timer — only for placed/active orders, NOT payment_pending */}
          {o.isBuyerView && order.auto_cancel_at && order.status !== 'payment_pending' && !isTerminalStatus(o.flow, order.status) && (
            <UrgentOrderTimer autoCancelAt={order.auto_cancel_at} onTimeout={o.handleTimeout} variant="buyer" />
          )}

          {/* #5: Seller response time expectation for buyers — only when NOT urgent and NOT payment_pending */}
          {o.isBuyerView && isFirstFlowStep(o.flow, order.status) && order.status !== 'payment_pending' && !o.isUrgentOrder && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
              <Loader2 size={14} className="animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">
                Waiting for {seller?.business_name || 'seller'} to confirm…
                {(seller as any)?.avg_response_minutes > 0
                  ? <span className="font-medium text-foreground"> Usually responds in ~{(seller as any).avg_response_minutes} min</span>
                  : <span className="font-medium text-foreground"> Sellers typically respond within a few minutes</span>
                }
              </p>
            </div>
          )}

          {/* Payment confirmation banner for buyer — shown during payment_pending */}
          {o.isBuyerView && order.status === 'payment_pending' && (
            <PaymentConfirmingBanner />
          )}

          {/* Seller-side urgent timer — BULLETPROOF: show whenever auto_cancel_at is set */}
          {o.isSellerView && order.auto_cancel_at && !isTerminalStatus(o.flow, order.status) && <UrgentOrderTimer autoCancelAt={order.auto_cancel_at} onTimeout={o.handleTimeout} variant="seller" />}

          {/* Gap 8: Needs attention banner for buyer — hide on terminal statuses */}
          {o.isBuyerView && (order as any).needs_attention && !isTerminalStatus(o.flow, order.status) && (
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle className="text-warning shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-sm font-semibold text-warning">Attention Needed</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(order as any).needs_attention_reason || 'There may be a delay with your order. Contact the seller if needed.'}
                </p>
                {sellerProfile?.phone && (
                  <a href={`tel:${sellerProfile.phone}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-1.5">
                    <Phone size={12} /> Contact Seller
                  </a>
                )}
              </div>
            </div>
          )}

          {order.rejection_reason && isTerminalStatus(o.flow, order.status) && !isSuccessfulTerminal(o.flow, order.status) && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-start gap-2.5">
              <XCircle className="text-destructive shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-sm font-semibold text-destructive">{order.rejection_reason?.startsWith('Cancelled by buyer:') ? 'Order Cancelled' : 'Auto-Cancelled'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{order.rejection_reason?.replace(/^Cancelled by buyer:\s*/i, '')}</p>
                {o.isSellerView && !order.rejection_reason?.startsWith('Cancelled by buyer:') && (
                  <p className="text-[11px] text-primary mt-1.5 font-medium">💡 Tip: Respond within 3 minutes to avoid auto-cancellation</p>
                )}
              </div>
            </div>
          )}

          {/* Status Timeline */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
              <span className="text-xs text-muted-foreground">{format(new Date(order.created_at), 'MMM d, h:mm a')}</span>
            </div>
            {order.status !== 'cancelled' && o.isFlowLoading && (
              <div className="flex items-center justify-between mt-4 gap-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex flex-col items-center flex-1">
                    <Skeleton className="w-7 h-7 rounded-full" />
                    <Skeleton className="h-2 w-10 mt-1" />
                  </div>
                ))}
              </div>
            )}
            {order.status !== 'cancelled' && !o.isFlowLoading && (
              <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
                <div className={`flex items-center mt-4 gap-1 ${displayStatuses.length <= 5 ? 'justify-between' : ''}`} style={{ minWidth: displayStatuses.length > 5 ? `${displayStatuses.length * 64}px` : undefined }}>
                  {displayStatuses.map((status, index) => {
                    const statusIndex = o.statusOrder.indexOf(status as OrderStatus);
                    const isCompleted = statusIndex <= o.currentStatusIndex;
                    const isCurrent = statusIndex === o.currentStatusIndex;
                    return (
                      <div key={status} className="flex flex-col items-center flex-1 min-w-[56px]">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${isCompleted ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'} ${isCurrent ? 'ring-2 ring-accent ring-offset-1 ring-offset-background' : ''}`}>
                          {isCompleted ? <Check size={14} /> : index + 1}
                        </div>
                        <span className="text-[9px] text-center mt-1 text-muted-foreground leading-tight whitespace-nowrap">{o.getFlowStepLabel(status as string).label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {order.status !== 'cancelled' && o.isBuyerView && (() => {
              const hint = o.getBuyerHint(order.status);
              return hint ? (
                <p className="text-xs text-muted-foreground mt-3 bg-muted/50 rounded-lg px-3 py-2">{hint}</p>
              ) : null;
            })()}
            {/* Cancellation handled in bottom action bar — removed inline duplicate */}

            {/* Admin/Seller debug chip: shows workflow resolution + OTP state */}
            {o.isSellerView && !o.isFlowLoading && o.nextStatus && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-mono text-muted-foreground/50">
                <span className="bg-muted px-1.5 py-0.5 rounded">flow: {o.resolvedParentGroup}/{o.resolvedTxnType}</span>
                <span className="bg-muted px-1.5 py-0.5 rounded">next: {o.nextStatus}</span>
                <span className="bg-muted px-1.5 py-0.5 rounded">otp: {getStepOtpType(o.flow, o.nextStatus) || 'none'}</span>
                {deliveryAssignmentId && <span className="bg-muted px-1.5 py-0.5 rounded">📦 assignment</span>}
              </div>
            )}
          </div>

          {/* Fulfillment Method Card */}
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {isDeliveryOrder ? (
                  <Truck size={16} className="text-primary" />
                ) : (
                  <Package size={16} className="text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {fulfillmentType === 'seller_delivery' || (fulfillmentType === 'delivery' && (order as any).delivery_handled_by !== 'platform')
                      ? 'Seller Delivery'
                      : fulfillmentType === 'delivery'
                        ? 'Delivery Partner'
                        : fulfillmentType === 'at_seller'
                          ? 'At Seller Location'
                          : fulfillmentType === 'at_buyer'
                            ? 'At Your Location'
                            : 'Self Pickup'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {isDeliveryOrder
                      ? 'Will be delivered to your address'
                      : fulfillmentType === 'at_seller' || fulfillmentType === 'at_buyer'
                        ? 'Service appointment'
                        : 'Pick up from seller location'}
                  </p>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                isDeliveryOrder ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {isDeliveryOrder ? '🚚 Delivery' : '📦 Pickup'}
              </span>
            </div>
          </div>

          {/* Appointment Details for Service Bookings */}
          {serviceBooking && <AppointmentDetailsCard booking={serviceBooking} />}

          {/* Payment */}
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5"><CreditCard size={16} className="text-muted-foreground" /><p className="text-sm font-medium">{(() => { const pt = (order as any).payment_type || (order as any).payment_method; if (pt === 'cod') return 'Cash on Delivery'; if (pt === 'upi' || pt === 'online' || pt === 'card') return 'Online Payment'; return 'Online Payment'; })()}</p></div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${paymentStatusInfo.color}`}>{paymentStatusInfo.label}</span>
            </div>
            {(order as any).upi_transaction_ref && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Transaction ID (UTR)</p>
                <p className="text-sm font-mono font-medium mt-0.5">{(order as any).upi_transaction_ref}</p>
              </div>
            )}
          </div>

          {/* Seller Payment Confirmation Banner */}
          {o.isSellerView && (order as any).status === 'payment_pending' && (order as any).payment_status === 'buyer_confirmed' && (order as any).payment_confirmed_by_seller === null && (
            <SellerPaymentConfirmation
              orderId={order.id}
              amount={order.total_amount}
              utrRef={(order as any).upi_transaction_ref}
              buyerName={buyer?.name}
              screenshotUrl={(order as any).payment_screenshot_url}
              onConfirmed={() => o.fetchOrder()}
            />
          )}

          {/* COD Payment Confirmation — seller confirms cash received */}
          {o.isSellerView && (order as any).payment_type === 'cod' && (order as any).payment_status !== 'paid' && isSuccessfulTerminal(o.flow, order.status) && (
            <SellerCodConfirmation
              orderId={order.id}
              amount={order.total_amount}
              buyerName={buyer?.name}
              onConfirmed={() => o.fetchOrder()}
            />
          )}

          {/* Read-only payment proof — visible to seller when screenshot exists and NOT in payment_pending (that case has action buttons above) */}
          {o.isSellerView && (order as any).payment_screenshot_url && (order as any).status !== 'payment_pending' && (
            <PaymentProofReadonly
              screenshotUrl={(order as any).payment_screenshot_url}
              utrRef={(order as any).upi_transaction_ref}
            />
          )}
          {o.isBuyerView && isDeliveryOrder && (order as any).estimated_delivery_at && !isTerminalStatus(o.flow, order.status) && !(deliveryAssignmentId && deliveryTracking.eta) && (
            <DeliveryETABanner estimatedDeliveryAt={(order as any).estimated_delivery_at} />
          )}

          {/* Delivery partner identity card — shown when assignment exists */}
          {o.isBuyerView && isDeliveryOrder && deliveryAssignmentId && deliveryTracking.riderName && !isTerminalStatus(o.flow, order.status) && (
            <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Truck size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Your delivery partner</p>
                <p className="text-sm font-semibold truncate">{deliveryTracking.riderName}</p>
              </div>
              {deliveryTracking.riderPhone && (
                <a href={`tel:${deliveryTracking.riderPhone}`} className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                  <Phone size={16} className="text-accent" />
                </a>
              )}
            </div>
          )}


          {/* Live Delivery Tracking — workflow-driven: render whenever isInTransit, regardless of deliveryAssignmentId */}
          {isDeliveryOrder && isInTransit && (
            <>
              {/* Map view: use rider location if available, else seller coords as static origin */}
              {(() => {
                const riderLoc = deliveryTracking.riderLocation;
                const sellerLat = (seller as any)?.latitude || null;
                const sellerLng = (seller as any)?.longitude || null;
                const originLat = riderLoc?.latitude ?? sellerLat;
                const originLng = riderLoc?.longitude ?? sellerLng;
                const destLat = (order as any).delivery_lat || (buyer as any)?.latitude || null;
                const destLng = (order as any).delivery_lng || (buyer as any)?.longitude || null;
                return originLat && originLng && destLat && destLng ? (
                  <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
                    <DeliveryMapView
                      riderLat={originLat}
                      riderLng={originLng}
                      destinationLat={destLat}
                      destinationLng={destLng}
                      riderName={deliveryTracking.riderName || (seller as any)?.business_name || ''}
                      heading={riderLoc?.heading}
                      onRoadEtaChange={setRoadEtaMinutes}
                    />
                  </Suspense>
                ) : null;
              })()}
              {deliveryAssignmentId ? (
                <LiveDeliveryTracker assignmentId={deliveryAssignmentId} isBuyerView={o.isBuyerView} trackingState={deliveryTracking} roadEtaMinutes={roadEtaMinutes} isInTransit={isInTransit} statusHints={(() => {
                  const hints: Record<string, { buyer_hint?: string | null; seller_hint?: string | null; display_label?: string | null }> = {};
                  for (const step of o.flow) {
                    hints[step.status_key] = { buyer_hint: step.buyer_hint, seller_hint: (step as any).seller_hint, display_label: step.display_label };
                  }
                  return hints;
                })()} />
              ) : o.flow.some((s: any) => s.creates_tracking_assignment) ? (
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-3 justify-center text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" />
                    <p className="text-sm">{getSetting('ui_setting_up_tracking') || 'Setting up live tracking...'}</p>
                  </div>
                </div>
              ) : null}
              {o.isBuyerView && (
                <div className="flex justify-end">
                  <UpdateBuyerLocationButton orderId={order.id} />
                </div>
              )}
            </>
          )}
          {/* Seller self-delivery GPS broadcasting — workflow-driven: actor-based, no deliveryAssignmentId gate */}
          {isDeliveryOrder && o.isSellerView && (order as any).delivery_handled_by !== 'platform' && o.isInTransit && currentActors.includes('seller') && (
            <SellerGPSTracker assignmentId={deliveryAssignmentId} orderId={order.id} autoStart deliveryStatus={order.status} />
          )}
          {/* Delivery OTP card — only shown when the next step requires delivery OTP */}
          {o.isBuyerView && isDeliveryOrder && buyerOtp && !isTerminalStatus(o.flow, order.status) && (() => {
            const nextStatus = o.buyerNextStatus || o.nextStatus;
            if (!nextStatus) return false;
            const nextOtp = getStepOtpType(o.flow, nextStatus);
            return nextOtp === 'delivery';
          })() && (
            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Your Delivery Code</p>
              <p className="text-3xl font-bold tracking-[0.3em] text-primary">{buyerOtp}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">Share this code with the delivery person to confirm delivery</p>
              <p className="text-[10px] text-warning mt-1.5">⚠️ Only share when you've received your items. This code confirms delivery is complete.</p>
            </div>
          )}
          {/* Generic OTP card — shown to the non-advancing party when next step has otp_type='generic' */}
          {(() => {
            const nextStatus = o.isSellerView ? o.nextStatus : o.buyerNextStatus;
            if (!nextStatus || isTerminalStatus(o.flow, order.status)) return null;
            const nextOtpType = getStepOtpType(o.flow, nextStatus);
            if (nextOtpType !== 'generic') return null;
            // Show code card to the party who does NOT advance (they share the code)
            const nextStepActors = (o.flow.find((s: any) => s.status_key === nextStatus)?.actor || '').split(',').map((a: string) => a.trim());
            const isAdvancer = (o.isSellerView && nextStepActors.includes('seller')) || (o.isBuyerView && nextStepActors.includes('buyer'));
            // The non-advancer sees the code; the advancer sees the "Verify" button in action bar
            if (isAdvancer) return null;
            return <GenericOtpCard orderId={order.id} targetStatus={nextStatus} targetStatusLabel={o.getFlowStepLabel(nextStatus).label} />;
          })()}
          {isDeliveryOrder && !isInTransit && <DeliveryStatusCard orderId={order.id} isBuyerView={o.isBuyerView} flow={o.flow} />}

          {o.canReorder && (
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><Package className="text-accent" size={18} /><div><p className="text-sm font-semibold">Order again?</p><p className="text-[11px] text-muted-foreground">Same items, one tap</p></div></div>
              <ReorderButton orderItems={items} sellerId={order.seller_id} size="sm" />
            </div>
          )}

          {o.isBuyerView && isSuccessfulTerminal(o.flow, order.status) && !getString(`feedback_prompted_${order.id}`) && (
            <div className="bg-secondary/50 border border-border rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><span className="text-lg">💬</span><div><p className="text-sm font-semibold">How was your experience?</p><p className="text-[11px] text-muted-foreground">Share feedback</p></div></div>
              <FeedbackSheet triggerLabel="Share" onSubmitted={() => setString(`feedback_prompted_${order.id}`, 'true')} />
            </div>
          )}

          {o.canReview && (
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><Star className="text-warning" size={18} /><div><p className="text-sm font-semibold">Rate this order</p><p className="text-[11px] text-muted-foreground">Help others with your review</p></div></div>
              <ReviewForm orderId={order.id} sellerId={order.seller_id} sellerName={seller?.business_name || 'Seller'} onSuccess={() => o.setHasReview(true)} />
            </div>
          )}

          {/* Gap 12: Delivery-specific rating — separate from product review */}
          {o.isBuyerView && isDeliveryOrder && isSuccessfulTerminal(o.flow, order.status) && !hasDeliveryFeedback && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🚚</span>
                <div>
                  <p className="text-sm font-semibold">Rate the delivery</p>
                  <p className="text-[11px] text-muted-foreground">Punctuality, handling & experience</p>
                </div>
              </div>
              <DeliveryFeedbackForm orderId={order.id} sellerId={order.seller_id} onSuccess={() => setHasDeliveryFeedback(true)} />
            </div>
          )}

          {/* Seller/Buyer Info */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{o.isSellerView ? 'Customer' : 'Seller'}</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{o.isSellerView ? buyer?.name : seller?.business_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin size={11} />Block {o.isSellerView ? buyer?.block : sellerProfile?.block}, {o.isSellerView ? buyer?.flat_number : sellerProfile?.flat_number}</p>
              </div>
              {(o.isSellerView ? buyer?.phone : sellerProfile?.phone) && (
                <a href={`tel:${o.isSellerView ? buyer?.phone : sellerProfile?.phone}`} className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center"><Phone size={16} className="text-accent" /></a>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items</p>
              {items.length > 1 && <span className="text-[11px] text-muted-foreground">{items.filter((i: OrderItem) => (i.status || 'pending') === 'delivered').length}/{items.length} done</span>}
            </div>
            {!hasItemsField && items.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Unable to load order items</p>
            )}
            {items.length > 1 && (
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {(['pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled'] as ItemStatus[]).map((status) => {
                  const count = items.filter((i: OrderItem) => (i.status || 'pending') === status).length;
                  if (count === 0) return null;
                  return <span key={status} className={`text-[10px] px-1.5 py-0.5 rounded ${o.getItemStatus(status).color}`}>{count} {o.getItemStatus(status).label}</span>;
                })}
              </div>
            )}
            <div className="space-y-2">
              {items.map((item: OrderItem) => (
                <OrderItemCard key={item.id} item={item} isSellerView={o.isSellerView} orderStatus={order.status} onStatusUpdate={(itemId, newStatus) => {
                  const updatedItems = items.map((i: OrderItem) => i.id === itemId ? { ...i, status: newStatus } : i);
                  o.setOrder({ ...order, items: updatedItems } as any);
                }} />
              ))}
            </div>
            <div className="border-t border-border pt-3 mt-3 space-y-1.5 text-sm">
              {(order as any).discount_amount > 0 && <div className="flex justify-between text-primary"><span>Discount</span><span>-{o.formatPrice((order as any).discount_amount)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span>{isDeliveryOrder ? <span className={`font-medium ${(order as any).delivery_fee > 0 ? '' : 'text-primary'}`}>{(order as any).delivery_fee > 0 ? o.formatPrice((order as any).delivery_fee) : 'FREE'}</span> : <span className="text-muted-foreground">Self Pickup</span>}</div>
              <div className="flex justify-between font-bold pt-1 border-t border-border"><span>Total</span><span>{o.formatPrice(order.total_amount)}</span></div>
            </div>
          </div>

          {order.notes && (<div className="bg-card border border-border rounded-xl p-4"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Instructions</p><p className="text-sm text-muted-foreground">{order.notes}</p></div>)}
        </div>
      </div>

      {/* Seller Action Bar — loading state */}
      {o.isSellerView && o.isFlowLoading && !isTerminalStatus(o.flow, order.status) && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 bg-background border-t border-border">
          <div className="px-4 py-3 flex items-center justify-center gap-2 h-12 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span>Loading actions…</span>
          </div>
        </div>
      )}

      {/* Seller Action Bar */}
      {/* Gap 2: Seller Action Bar — intercept "delivered" to require OTP for delivery orders */}
      {hasSellerActionBar && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] bg-background border-t border-border">
          <div className="px-4 py-3 flex gap-3">
            {o.canSellerReject && <Button variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground h-12" onClick={() => o.setIsRejectionDialogOpen(true)} disabled={o.isUpdating}><XCircle size={16} className="mr-1.5" />Reject</Button>}
            {/* DB-driven: if no seller transition exists, show awaiting message */}
            {!o.nextStatus ? (
              <div className="flex-1 flex items-center justify-center gap-2 h-12 text-sm text-muted-foreground"><Truck size={16} className="text-primary" /><span>Awaiting next step</span></div>
            ) : (() => {
              const nextOtpType = getStepOtpType(o.flow, o.nextStatus);
              const needsDeliveryOtp = nextOtpType === 'delivery' && !!deliveryAssignmentId;
              const needsGenericOtp = nextOtpType === 'generic';
              return needsDeliveryOtp ? (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => setIsOtpDialogOpen(true)} disabled={o.isUpdating}>
                  {o.isUpdating ? 'Updating...' : getActionLabel(o.nextStatus!, true)}
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              ) : needsGenericOtp ? (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => { setGenericOtpTargetStatus(o.nextStatus!); setIsGenericOtpDialogOpen(true); }} disabled={o.isUpdating}>
                  {o.isUpdating ? 'Updating...' : getActionLabel(o.nextStatus!, true)}
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              ) : (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => o.updateOrderStatus(o.nextStatus!)} disabled={o.isUpdating}>{o.isUpdating ? 'Updating...' : getActionLabel(o.nextStatus!, false)}<ChevronRight size={14} className="ml-1" /></Button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Buyer Action Bar — fully DB-driven via transitions */}
      {hasBuyerActionBar && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] bg-background border-t border-border">
          <div className="px-4 py-3 flex gap-3">
            {/* Cancel button: strictly from DB transitions */}
            {o.canBuyerCancel && (
              serviceBooking ? (
                <BuyerCancelBooking bookingId={serviceBooking.id} orderId={order.id} slotId={serviceBooking.slot_id} status={serviceBooking.status} />
              ) : (
                <OrderCancellation orderId={order.id} orderStatus={order.status} onCancelled={() => o.fetchOrder()} canCancel={true} />
              )
            )}
            {o.buyerNextStatus && (() => {
              const buyerNextOtpType = getStepOtpType(o.flow, o.buyerNextStatus);
              const buyerNeedsDeliveryOtp = buyerNextOtpType === 'delivery' && !!deliveryAssignmentId;
              const buyerNeedsGenericOtp = buyerNextOtpType === 'generic';
              return buyerNeedsDeliveryOtp ? (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => setIsOtpDialogOpen(true)} disabled={o.isUpdating}>
                  {o.isUpdating ? 'Updating...' : getActionLabel(o.buyerNextStatus!, true)}
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              ) : buyerNeedsGenericOtp ? (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => { setGenericOtpTargetStatus(o.buyerNextStatus!); setIsGenericOtpDialogOpen(true); }} disabled={o.isUpdating}>
                  {o.isUpdating ? 'Updating...' : getActionLabel(o.buyerNextStatus!, true)}
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              ) : (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => o.buyerAdvanceOrder(o.buyerNextStatus!)} disabled={o.isUpdating}>
                  {o.isUpdating ? 'Updating...' : getActionLabel(o.buyerNextStatus!, false)}
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              );
            })()}
          </div>
        </div>
      )}

      <OrderRejectionDialog open={o.isRejectionDialogOpen} onOpenChange={o.setIsRejectionDialogOpen} onReject={o.handleReject} orderNumber={order.id} />
      {o.chatRecipientId && <OrderChat orderId={order.id} otherUserId={o.chatRecipientId} otherUserName={o.chatRecipientName || 'User'} isOpen={o.isChatOpen} onClose={() => { o.setIsChatOpen(false); o.fetchUnreadCount(); }} disabled={!o.canChat} />}

      {/* Gap 2: OTP verification dialog for seller self-delivery */}
      <DeliveryCompletionOtpDialog
        orderId={order.id}
        open={isOtpDialogOpen}
        onOpenChange={setIsOtpDialogOpen}
        onVerified={() => {
          // Trust DB — realtime subscription handles state sync
        }}
      />

      {/* Generic OTP verification dialog */}
      {genericOtpTargetStatus && (
        <GenericOtpDialog
          orderId={order.id}
          targetStatus={genericOtpTargetStatus}
          open={isGenericOtpDialogOpen}
          onOpenChange={setIsGenericOtpDialogOpen}
          onVerified={() => o.fetchOrder()}
        />
      )}

      {/* DeliveryArrivalOverlay — only when rider GPS exists and is close (Gap 9) */}
      {showArrivalOverlay && (
        <DeliveryArrivalOverlay
          distance={deliveryTracking.distance}
          eta={deliveryTracking.distance != null && deliveryTracking.distance < 500 ? Math.max(1, Math.ceil(deliveryTracking.distance / 1000 * 4)) : (roadEtaMinutes ?? deliveryTracking.eta)}
          riderName={deliveryTracking.riderName}
          riderPhone={deliveryTracking.riderPhone}
          status={deliveryTracking.status}
          onDismiss={() => {}}
          deliveryCode={buyerOtp}
          transitStatuses={trackingConfig.transit_statuses}
          overlayDistanceMeters={trackingConfig.arrival_overlay_distance_meters}
          doorstepDistanceMeters={trackingConfig.arrival_doorstep_distance_meters}
          proximityMessages={(() => {
            try {
              const raw = getSetting('proximity_thresholds');
              if (raw) {
                const cfg = JSON.parse(raw);
                return {
                  at_doorstep_title: cfg.at_doorstep?.buyer_message,
                  arriving_title: cfg.arriving?.buyer_message,
                  subtitle: undefined,
                };
              }
            } catch { /* use defaults */ }
            return undefined;
          })()}
        />
      )}
    </AppLayout>
  );
}
