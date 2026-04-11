// @ts-nocheck
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
import { ArrowLeft, Phone, MapPin, Check, Star, MessageCircle, CreditCard, XCircle, Package, ChevronRight, Copy, Truck, Loader2, AlertTriangle, Clock, CircleCheckBig } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getString, setString } from '@/lib/persistent-kv';
import { cn } from '@/lib/utils';

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { Capacitor } from '@capacitor/core';
import { useNewOrderAlertContext } from '@/contexts/NewOrderAlertContext';

// ─── Zomato-level experience imports ─────────────────────────────────────────
import { deriveDisplayStatus } from '@/lib/deriveDisplayStatus';
import { ExperienceHeader } from '@/components/order/ExperienceHeader';
import { LiveActivityCard } from '@/components/order/LiveActivityCard';
import { OrderTimeline } from '@/components/order/OrderTimeline';
import { PaymentStatusCard } from '@/components/order/PaymentStatusCard';
import { OrderFailureRecovery } from '@/components/order/OrderFailureRecovery';
import { RefundRequestCard } from '@/components/refund/RefundRequestCard';
import { motion } from 'framer-motion';
import { staggerContainer, cardEntrance } from '@/lib/motion-variants';

const DeliveryMapView = lazy(() => import('@/components/delivery/DeliveryMapView').then(m => ({ default: m.DeliveryMapView })));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PaymentConfirmingBanner() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const i = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-center animate-in fade-in duration-300">
      <span className="text-2xl">💳</span>
      <p className="text-sm font-semibold text-warning mt-1">Processing Payment{dots}</p>
      <p className="text-xs text-muted-foreground mt-0.5">Your payment is being verified</p>
      <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => window.location.reload()}>
        <RefreshCw size={12} className="mr-1" />
        Refresh status
      </Button>
    </div>
  );
}

function CelebrationBanner({ order, isBuyerView, flow }: { order: any; isBuyerView: boolean; flow: any }) {
  const show = isBuyerView && isSuccessfulTerminal(flow, order.status) && !getString(`celebration_${order.id}`);
  useEffect(() => {
    if (show) setString(`celebration_${order.id}`, 'true');
  }, [show, order.id]);
  if (!show) return null;
  const terminalTs = order.status_updated_at || order.updated_at || order.created_at;
  const durationMs = new Date(terminalTs).getTime() - new Date(order.created_at).getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));
  const showDuration = durationMin <= 120;

  // Particle positions for confetti effect
  const particles = [
    { x: -30, y: -20, delay: 0.3 },
    { x: 25, y: -25, delay: 0.4 },
    { x: -20, y: 15, delay: 0.5 },
    { x: 30, y: 10, delay: 0.35 },
    { x: -10, y: -30, delay: 0.45 },
    { x: 15, y: 20, delay: 0.55 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-transparent border border-emerald-500/20 rounded-xl p-5 text-center"
    >
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-xl" />

      {/* Animated particles */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-8 w-1.5 h-1.5 rounded-full bg-emerald-400/60"
          initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], x: p.x, y: p.y, scale: [0, 1.2, 0] }}
          transition={{ duration: 1.2, delay: p.delay, ease: 'easeOut' }}
        />
      ))}

      {/* SVG Checkmark with draw animation */}
      <div className="relative mx-auto w-12 h-12 mb-3">
        <motion.div
          className="absolute inset-0 rounded-full bg-emerald-500/20"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.2, 1] }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        <svg
          viewBox="0 0 48 48"
          className="relative w-12 h-12"
          fill="none"
        >
          <motion.circle
            cx="24" cy="24" r="20"
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          />
          <motion.path
            d="M15 24 L21 30 L33 18"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.5, ease: 'easeOut' }}
          />
        </svg>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.3 }}
        className="relative text-sm font-bold text-foreground"
      >
        {showDuration ? `Delivered in ${durationMin} min!` : 'Order Complete!'}
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.3 }}
        className="relative text-xs text-muted-foreground mt-1"
      >
        Thank you for supporting your community
      </motion.p>
    </motion.div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const o = useOrderDetail(id);
  const { dismissById } = useNewOrderAlertContext();
  const [deliveryAssignmentId, setDeliveryAssignmentId] = useState<string | null>(null);
  const [isOtpDialogOpen, setIsOtpDialogOpen] = useState(false);
  const [isGenericOtpDialogOpen, setIsGenericOtpDialogOpen] = useState(false);
  const [genericOtpTargetStatus, setGenericOtpTargetStatus] = useState<string | null>(null);
  const [hasDeliveryFeedback, setHasDeliveryFeedback] = useState(false);
  const [buyerOtp, setBuyerOtp] = useState<string | null>(null);
  const [roadEtaMinutes, setRoadEtaMinutes] = useState<number | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ totalDistance: number; remainingDistance: number } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: serviceBooking } = useServiceBookingForOrder(o.order?.id);
  const { getSetting } = useSystemSettingsRaw(['proximity_thresholds', 'ui_setting_up_tracking']);

  const order = o.order;
  const orderId = order?.id;
  const fulfillmentType = o.orderFulfillmentType;
  const hasDeliverySteps = o.flow.some((s: any) => s.is_transit === true);
  const isDeliveryOrder = fulfillmentType !== 'self_pickup' && 
    (hasDeliverySteps || ['delivery', 'seller_delivery'].includes(fulfillmentType));

  const deliveryTracking = useDeliveryTracking(deliveryAssignmentId, o.isInTransit);
  const trackingConfig = useTrackingConfig();

  // Dismiss bell sound when this order is opened
  useEffect(() => {
    if (id) dismissById(id);
  }, [id, dismissById]);

  useEffect(() => {
    if (id && order?.status && !['placed', 'enquired', 'quoted'].includes(order.status)) {
      dismissById(id);
    }
  }, [id, order?.status, dismissById]);

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

  // Resilient assignment hydration
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
            if (assignmentRetryCount < 10) {
              const delay = Math.min(1500 * (assignmentRetryCount + 1), 15000);
              setTimeout(() => setAssignmentRetryCount(c => c + 1), delay);
            }
          }
        });
    };
    fetchAssignment();

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

  // Fetch delivery OTP for buyer
  useEffect(() => {
    if (!deliveryAssignmentId || !isDeliveryOrder) return;

    supabase
      .from('delivery_assignments')
      .select('delivery_code')
      .eq('id', deliveryAssignmentId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.delivery_code) setBuyerOtp(data.delivery_code);
      });

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

  // Listen for OTP-required events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.orderId === orderId) setIsOtpDialogOpen(true);
    };
    window.addEventListener('delivery-otp-required', handler);
    return () => window.removeEventListener('delivery-otp-required', handler);
  }, [orderId]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await o.fetchOrder?.();
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [o.fetchOrder]);

  // Route info callback
  const handleRouteInfo = useCallback((info: { totalDistance: number; remainingDistance: number }) => {
    setRouteInfo(info);
  }, []);

  if (o.isLoading) return <AppLayout showHeader={false}><div className="p-4 space-y-3"><Skeleton className="h-8 w-32" /><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div></AppLayout>;
  if (!order) return <AppLayout showHeader={false}><div className="p-4 text-center py-16"><p className="text-sm text-muted-foreground">Order not found</p><Link to="/orders"><Button size="sm" className="mt-4">View Orders</Button></Link></div></AppLayout>;

  const seller = o.seller;
  const sellerProfile = seller?.profile;
  const buyer = (order as any).buyer;
  const items: OrderItem[] = (order as any).items || [];
  const hasItemsField = 'items' in (order as any);
  const viewRole: 'buyer' | 'seller' = o.isSellerView ? 'seller' : 'buyer';
  const paymentStatusInfo = o.getPaymentStatus((order.payment_status as PaymentStatus) || 'pending');
  const isInTransit = o.isInTransit;
  const currentActors = (o.currentStepActor || '').split(',').map(a => a.trim());

  // ─── Derive display status (Zomato engine) ───────────────────────────────
  const displayStatus = deriveDisplayStatus({
    orderStatus: order.status,
    flow: o.flow,
    isBuyerView: o.isBuyerView,
    roadEtaMinutes,
    estimatedDeliveryAt: (order as any).estimated_delivery_at,
    sellerName: seller?.business_name,
    totalRouteDistance: routeInfo?.totalDistance,
    remainingDistance: routeInfo?.remainingDistance,
    hasRiderLocation: !!deliveryTracking.riderLocation,
  });

  const showArrivalOverlay = o.isBuyerView && !isTerminalStatus(o.flow, order.status) && deliveryAssignmentId && deliveryTracking.riderLocation && deliveryTracking.distance != null && deliveryTracking.distance < trackingConfig.arrival_overlay_distance_meters;

  const hasSellerActionBar = o.isSellerView && !o.isFlowLoading && o.flow.length > 0 && !isTerminalStatus(o.flow, order.status);
  const hasBuyerActionBar = o.isBuyerView && !o.isFlowLoading && o.flow.length > 0 && !isTerminalStatus(o.flow, order.status) && (o.buyerNextStatus || o.canBuyerCancel);

  const getActionLabel = (status: string, otpRequired: boolean) => {
    const step = o.flow.find(s => s.status_key === status);
    const roleLabel = (viewRole === 'seller' && step?.seller_display_label)
      ? step.seller_display_label
      : (viewRole === 'buyer' && step?.buyer_display_label)
        ? step.buyer_display_label
        : step?.display_label;
    const label = roleLabel || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const isEnd = step?.is_terminal === true;
    if (otpRequired) return isEnd ? 'Verify & Complete' : `Verify & ${label}`;
    return isEnd ? 'Complete Order' : `Mark ${label}`;
  };

  // Seller context message (Condition #5: no ambiguity)
  const getSellerContextMessage = () => {
    if (!o.isSellerView) return null;
    const step = o.flow.find(s => s.status_key === order.status);
    if (step?.seller_hint) return step.seller_hint;
    
    switch (displayStatus.phase) {
      case 'placed': return 'New order — review and accept';
      case 'preparing': return 'Prepare the items and mark ready when done';
      case 'ready': return 'Waiting for delivery partner to pick up';
      case 'transit': return 'Order is on the way to the customer';
      case 'delivered': return 'Order completed successfully';
      default: return null;
    }
  };

  return (
    <AppLayout showHeader={false} showNav={!hasSellerActionBar || !o.isSellerView}>
      <div className={`${(hasSellerActionBar || hasBuyerActionBar) ? 'pb-40' : 'pb-56'}`}>
        {/* ═══ Experience Header (replaces old header) ═══ */}
        <ExperienceHeader
          sellerName={o.isSellerView ? (buyer?.name || 'Customer') : (seller?.business_name || 'Seller')}
          displayStatus={displayStatus}
          orderId={order.id}
          onBack={() => {
            if (location.state?.from === 'deeplink' || window.history.length <= 2) {
              navigate('/orders');
            } else {
              navigate(-1);
            }
          }}
          onCopyId={o.copyOrderId}
          onRefresh={handleRefresh}
          onChatOpen={o.canChat && o.chatRecipientId ? () => o.setIsChatOpen(true) : undefined}
          unreadMessages={o.unreadMessages}
          canChat={o.canChat && !!o.chatRecipientId}
          isTerminal={isTerminalStatus(o.flow, order.status)}
          isRefreshing={isRefreshing}
        />

        <motion.div
          className="px-4 pt-3 space-y-3"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {/* ═══ Seller: Swiggy-style horizontal rail stepper ═══ */}
          {o.isSellerView && !isTerminalStatus(o.flow, order.status) && order.status !== 'cancelled' && o.displayStatuses.length > 0 && (() => {
            const currentIdx = o.displayStatuses.indexOf(order.status);
            const firstTerminalIdx = o.displayStatuses.findIndex((sk: string) => {
              const step = o.flow.find((s: any) => s.status_key === sk);
              return step?.is_terminal;
            });
            const visibleStatuses = firstTerminalIdx >= 0
              ? o.displayStatuses.slice(0, firstTerminalIdx + 1)
              : o.displayStatuses;

            return (
              <motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-4 space-y-2 shadow-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Order Progress</p>

                {/* Horizontal rail */}
                <div className="flex items-center gap-0">
                  {visibleStatuses.map((statusKey: string, i: number) => {
                    const isComplete = i < currentIdx;
                    const isCurrent = i === currentIdx;
                    const isLast = i === visibleStatuses.length - 1;

                    return (
                      <div key={statusKey} className="flex items-center" style={{ flex: isLast ? '0 0 auto' : '1 1 0' }}>
                        <div className="relative flex flex-col items-center" style={{ zIndex: 2 }}>
                          <div className={cn(
                            'rounded-full flex items-center justify-center shrink-0',
                            isComplete ? 'w-5 h-5 bg-primary' :
                            isCurrent ? 'w-6 h-6 bg-primary/20 ring-[2.5px] ring-primary/50' :
                            'w-4 h-4 bg-muted'
                          )}>
                            {isComplete ? (
                              <Check size={10} className="text-primary-foreground" />
                            ) : isCurrent ? (
                              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                            )}
                          </div>
                        </div>
                        {!isLast && (
                          <div className="flex-1 h-[2px] mx-0.5 relative overflow-hidden rounded-full">
                            <div className="absolute inset-0 bg-muted" />
                            {isComplete && <div className="absolute inset-0 bg-primary rounded-full" />}
                            {isCurrent && <div className="absolute inset-y-0 left-0 w-[40%] bg-primary/40 rounded-full" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Labels */}
                <div className="flex items-start gap-0">
                  {visibleStatuses.map((statusKey: string, i: number) => {
                    const isComplete = i < currentIdx;
                    const isCurrent = i === currentIdx;
                    const isLast = i === visibleStatuses.length - 1;
                    const stepInfo = o.getFlowStepLabel(statusKey, 'seller');
                    const label = stepInfo.label;
                    const shortLabel = label.length > 12 ? label.split(' ').slice(0, 2).join(' ') : label;

                    return (
                      <div key={statusKey} className={cn('flex flex-col items-center text-center', isLast ? 'flex-none' : 'flex-1')} style={{ minWidth: 0 }}>
                        <p className={cn(
                          'text-[9px] leading-tight mt-1 px-0.5',
                          isCurrent ? 'font-bold text-foreground' :
                          isComplete ? 'font-medium text-primary' :
                          'text-muted-foreground/50'
                        )}>
                          {isCurrent ? label : shortLabel}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Current step hint */}
                {currentIdx >= 0 && (() => {
                  const stepData = o.flow.find((s: any) => s.status_key === visibleStatuses[currentIdx]);
                  const hint = stepData?.seller_hint;
                  return hint ? (
                    <p className="text-[10px] text-muted-foreground text-center">{hint}</p>
                  ) : null;
                })()}
              </motion.div>
            );
          })()}

          {/* ═══ Buyer: Live Activity Card (simplified) ═══ */}
          {o.isBuyerView && !isTerminalStatus(o.flow, order.status) && order.status !== 'cancelled' && (
            <motion.div variants={cardEntrance}><LiveActivityCard
              displayStatus={displayStatus}
              sellerName={seller?.business_name || 'Seller'}
              riderName={deliveryTracking.riderName}
              riderPhone={deliveryTracking.riderPhone}
              hasGps={!!deliveryTracking.riderLocation}
              isLocationStale={deliveryTracking.isLocationStale}
              lastUpdateAt={deliveryTracking.lastLocationAt}
              distanceMeters={deliveryTracking.distance}
              flow={o.flow.map((s: any) => ({
                status_key: s.status_key,
                display_label: s.display_label,
                buyer_display_label: s.buyer_display_label,
                buyer_hint: s.buyer_hint,
                icon: s.icon,
                is_terminal: s.is_terminal,
                is_transit: s.is_transit,
                sort_order: s.sort_order,
              }))}
              currentStatus={order.status}
            /></motion.div>
          )}

          {/* Seller context message (Condition #5: clear action state) */}
          {o.isSellerView && !isTerminalStatus(o.flow, order.status) && (() => {
            const msg = getSellerContextMessage();
            return msg ? (
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5">
                <p className="text-xs font-medium text-primary">{msg}</p>
              </div>
            ) : null;
          })()}

          {/* Celebration banner */}
          <CelebrationBanner order={order} isBuyerView={o.isBuyerView} flow={o.flow} />

          {/* Order placed celebration */}
          {o.isBuyerView && isFirstFlowStep(o.flow, order.status) && order.status !== 'payment_pending' && (Date.now() - new Date(order.created_at).getTime() < 60000) && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center"
            >
              <div className="mx-auto w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center mb-2">
                <CircleCheckBig size={20} className="text-primary" />
              </div>
              <p className="text-sm font-bold text-primary">Order Placed Successfully!</p>
              <p className="text-xs text-muted-foreground mt-0.5">Your order is being reviewed by the seller</p>
              {(order as any).estimated_delivery_at && (
                <p className="text-xs font-medium text-primary mt-1">
                  Estimated delivery: {format(new Date((order as any).estimated_delivery_at), 'h:mm a')}
                </p>
              )}
            </motion.div>
          )}

          {/* Scheduled delivery date */}
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

          {/* Urgent timers */}
          {o.isBuyerView && order.auto_cancel_at && order.status !== 'payment_pending' && !isTerminalStatus(o.flow, order.status) && (
            <UrgentOrderTimer autoCancelAt={order.auto_cancel_at} onTimeout={o.handleTimeout} variant="buyer" />
          )}

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

          {o.isBuyerView && order.status === 'payment_pending' && (
            <PaymentConfirmingBanner />
          )}

          {o.isSellerView && order.auto_cancel_at && !isTerminalStatus(o.flow, order.status) && <UrgentOrderTimer autoCancelAt={order.auto_cancel_at} onTimeout={o.handleTimeout} variant="seller" />}

          {/* Attention banners */}
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
                <p className="text-sm font-semibold text-destructive">{
                  order.rejection_reason?.startsWith('Cancelled by buyer:')
                    ? (o.isBuyerView ? 'You Cancelled This Order' : 'Cancelled by Buyer')
                    : /not completed in time|seller didn't respond|payment was not completed/i.test(order.rejection_reason || '')
                      ? 'Auto-Cancelled'
                      : (o.isSellerView ? 'You Cancelled This Order' : 'Cancelled by Seller')
                }</p>
                <p className="text-xs text-muted-foreground mt-0.5">{order.rejection_reason?.replace(/^Cancelled by buyer:\s*/i, '')}</p>
                {o.isSellerView && /not completed in time|seller didn't respond/i.test(order.rejection_reason || '') && (
                  <p className="text-[11px] text-primary mt-1.5 font-medium">💡 Tip: Respond within 3 minutes to avoid auto-cancellation</p>
                )}
              </div>
            </div>
          )}

          {/* ═══ MAP + LIVE TRACKING — Prominent during transit ═══ */}
          {isDeliveryOrder && isInTransit && (
            <>
              {(() => {
                const riderLoc = deliveryTracking.riderLocation;
                const sellerLatVal = (seller as any)?.latitude || null;
                const sellerLngVal = (seller as any)?.longitude || null;
                const originLat = riderLoc?.latitude ?? sellerLatVal;
                const originLng = riderLoc?.longitude ?? sellerLngVal;
                const destLat = (order as any).delivery_lat || (buyer as any)?.latitude || null;
                const destLng = (order as any).delivery_lng || (buyer as any)?.longitude || null;
                return destLat && destLng ? (
                  <Suspense fallback={<Skeleton className="h-[320px] w-full rounded-xl" />}>
                    <DeliveryMapView
                      riderLat={originLat || sellerLatVal || destLat}
                      riderLng={originLng || sellerLngVal || destLng}
                      destinationLat={destLat}
                      destinationLng={destLng}
                      riderName={deliveryTracking.riderName || (seller as any)?.business_name || ''}
                      heading={riderLoc?.heading}
                      onRoadEtaChange={setRoadEtaMinutes}
                      sellerLat={sellerLatVal}
                      sellerLng={sellerLngVal}
                      sellerName={seller?.business_name}
                      isPickedUp={['picked_up', 'on_the_way', 'at_gate'].includes(order.status)}
                      tall={true}
                      onRouteInfo={handleRouteInfo}
                    />
                  </Suspense>
                ) : null;
              })()}

              {/* Rider info card */}
              {deliveryAssignmentId ? (
                <LiveDeliveryTracker assignmentId={deliveryAssignmentId} isBuyerView={o.isBuyerView} trackingState={deliveryTracking} roadEtaMinutes={roadEtaMinutes} isInTransit={isInTransit} displayStatusText={displayStatus.text} statusHints={(() => {
                  const hints: Record<string, { buyer_hint?: string | null; seller_hint?: string | null; display_label?: string | null }> = {};
                  for (const step of o.flow) {
                    hints[step.status_key] = { buyer_hint: step.buyer_hint, seller_hint: (step as any).seller_hint, display_label: step.display_label };
                  }
                  return hints;
                })()} />
              ) : o.flow.some((s: any) => s.creates_tracking_assignment) ? (
                <div className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-4 shadow-sm">
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

          {/* Seller GPS tracker */}
          {isDeliveryOrder && o.isSellerView && (order as any).delivery_handled_by !== 'platform' && o.isInTransit && (
            <SellerGPSTracker assignmentId={deliveryAssignmentId} orderId={order.id} autoStart deliveryStatus={order.status} />
          )}

          {/* Delivery partner card — pre-transit */}
          {o.isBuyerView && isDeliveryOrder && deliveryAssignmentId && deliveryTracking.riderName && !isTerminalStatus(o.flow, order.status) && !isInTransit && (
            <motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-3 flex items-center gap-3 shadow-sm">
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
             </motion.div>
          )}

          {/* Delivery OTP card */}
          {o.isBuyerView && isDeliveryOrder && buyerOtp && !isTerminalStatus(o.flow, order.status) && (isInTransit || ['picked_up', 'on_the_way', 'at_gate'].includes(order.status) || (() => {
            const nextStatus = o.buyerNextStatus || o.nextStatus;
            if (!nextStatus) return false;
            const nextOtp = getStepOtpType(o.flow, nextStatus);
            return nextOtp === 'delivery';
          })()) && (
            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Your Delivery Code</p>
              <p className="text-3xl font-bold tracking-[0.3em] text-primary">{buyerOtp}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">Share this code with the delivery person to confirm delivery</p>
              <p className="text-[10px] text-warning mt-1.5">⚠️ Only share when you've received your items. This code confirms delivery is complete.</p>
            </div>
          )}

          {/* Buyer: Generic OTP fallback for seller-delivery (no platform assignment) */}
          {o.isBuyerView && isDeliveryOrder && !buyerOtp && !deliveryAssignmentId && !isTerminalStatus(o.flow, order.status) && (() => {
            const nextStatus = o.buyerNextStatus || o.nextStatus;
            if (!nextStatus) return false;
            const nextOtp = getStepOtpType(o.flow, nextStatus);
            // Show generic OTP card when delivery OTP is required but no delivery assignment exists
            return nextOtp === 'delivery' || nextOtp === 'delivery_otp';
          })() && (
            <GenericOtpCard orderId={order.id} targetStatus={(() => {
              const ns = o.buyerNextStatus || o.nextStatus;
              return ns || '';
            })()} targetStatusLabel={(() => {
              const ns = o.buyerNextStatus || o.nextStatus;
              return ns ? o.getFlowStepLabel(ns, 'buyer').label : 'Delivered';
            })()} />
          )}

          {/* Generic OTP card */}
          {(() => {
            const nextStatus = o.isSellerView ? o.nextStatus : o.buyerNextStatus;
            if (!nextStatus || isTerminalStatus(o.flow, order.status)) return null;
            const nextOtpType = getStepOtpType(o.flow, nextStatus);
            if (nextOtpType !== 'generic') return null;
            const nextStepActors = (o.flow.find((s: any) => s.status_key === nextStatus)?.actor || '').split(',').map((a: string) => a.trim());
            const isAdvancer = (o.isSellerView && nextStepActors.includes('seller')) || (o.isBuyerView && nextStepActors.includes('buyer'));
            if (isAdvancer) return null;
            return <GenericOtpCard orderId={order.id} targetStatus={nextStatus} targetStatusLabel={o.getFlowStepLabel(nextStatus, viewRole).label} />;
          })()}

          {isDeliveryOrder && !isInTransit && !o.isBuyerView && <DeliveryStatusCard orderId={order.id} isBuyerView={o.isBuyerView} flow={o.flow} />}

          {o.isBuyerView && isDeliveryOrder && (order as any).estimated_delivery_at && !isTerminalStatus(o.flow, order.status) && !(deliveryAssignmentId && deliveryTracking.eta) && (
            <DeliveryETABanner estimatedDeliveryAt={(order as any).estimated_delivery_at} />
          )}

          {/* Fulfillment Method Card */}
          <motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl px-4 py-3 shadow-sm">
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
          </motion.div>

          {/* Appointment Details */}
          {serviceBooking && <AppointmentDetailsCard booking={serviceBooking} />}

          {/* Payment */}
          <motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl px-4 py-3 shadow-sm">
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
          </motion.div>

          {/* Seller Payment Confirmation */}
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

          {/* COD Payment Confirmation */}
          {o.isSellerView && (order as any).payment_type === 'cod' && (order as any).payment_status !== 'paid' && isSuccessfulTerminal(o.flow, order.status) && (
            <SellerCodConfirmation
              orderId={order.id}
              amount={order.total_amount}
              buyerName={buyer?.name}
              onConfirmed={() => o.fetchOrder()}
            />
          )}

          {/* Payment proof readonly */}
          {o.isSellerView && (order as any).payment_screenshot_url && (order as any).status !== 'payment_pending' && (
            <PaymentProofReadonly
              screenshotUrl={(order as any).payment_screenshot_url}
              utrRef={(order as any).upi_transaction_ref}
            />
          )}

          {/* Reorder */}
          {o.canReorder && (
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><Package className="text-accent" size={18} /><div><p className="text-sm font-semibold">Order again?</p><p className="text-[11px] text-muted-foreground">Same items, one tap</p></div></div>
              <ReorderButton orderItems={items} sellerId={order.seller_id} size="sm" />
            </div>
          )}

          {/* Feedback */}
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

          {/* Delivery feedback */}
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
          <motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{o.isSellerView ? 'Customer' : 'Seller'}</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{o.isSellerView ? buyer?.name : seller?.business_name}</p>
                {(() => {
                   const block = o.isSellerView ? buyer?.block : sellerProfile?.block;
                   const flat = o.isSellerView ? buyer?.flat_number : sellerProfile?.flat_number;
                   return (block || flat) ? (
                     <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin size={11} />{block ? `Block ${block}` : ''}{block && flat ? ', ' : ''}{flat || ''}</p>
                   ) : null;
                })()}
                {(order as any).delivery_address && ['delivery', 'seller_delivery'].includes((order as any).fulfillment_type) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin size={11} />Delivering to: {(order as any).delivery_address}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {o.isBuyerView && sellerProfile?.phone && ['contact_seller', 'request_service'].includes((order as any).action_type || '') && (
                  <a
                    href={`https://wa.me/${sellerProfile.phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"
                    title="WhatsApp seller"
                  >
                    <Phone size={16} className="text-green-600" />
                  </a>
                )}
                {(o.isSellerView ? buyer?.phone : sellerProfile?.phone) && (
                  <a href={`tel:${o.isSellerView ? buyer?.phone : sellerProfile?.phone}`} className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0"><Phone size={16} className="text-accent" /></a>
                )}
              </div>
            </div>
          </motion.div>

          {/* Items */}
          <motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-4 shadow-sm">
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
              {(() => {
                const totalSavings = items.reduce((sum: number, item: OrderItem) => {
                  const mrp = (item as any).mrp;
                  if (mrp && mrp > item.unit_price) return sum + (mrp - item.unit_price) * item.quantity;
                  return sum;
                }, 0);
                return totalSavings > 0 ? (
                  <div className="flex items-center justify-center gap-1.5 pt-1.5 text-accent">
                    <span className="text-xs">🎉</span>
                    <span className="text-xs font-semibold">You saved {o.formatPrice(totalSavings)} on this order!</span>
                  </div>
                ) : null;
              })()}
            </div>
          </motion.div>

          {order.notes && (<motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-4 shadow-sm"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Instructions</p><p className="text-sm text-muted-foreground">{order.notes}</p></motion.div>)}

          {/* Payment Status */}
          <PaymentStatusCard orderId={order.id} paymentType={(order as any).payment_type} totalAmount={order.total_amount} orderStatus={order.status} />

          {/* Order Failure Recovery */}
          <OrderFailureRecovery orderId={order.id} orderStatus={order.status} />

          {/* Order Timeline */}
          <OrderTimeline orderId={order.id} />
        </motion.div>
      </div>

      {/* Seller Action Bar — loading state */}
      {o.isSellerView && o.isFlowLoading && !isTerminalStatus(o.flow, order.status) && (
        <div className="fixed bottom-[env(safe-area-inset-bottom)] left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-t border-border/50">
          <div className="px-4 py-3 flex items-center justify-center gap-2 h-12 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span>Loading actions…</span>
          </div>
        </div>
      )}

      {/* Seller Action Bar — Condition #5: clear CTA, no ambiguity */}
      {hasSellerActionBar && (
        <div className="fixed bottom-[env(safe-area-inset-bottom)] left-0 right-0 z-[60] bg-background/80 backdrop-blur-xl border-t border-border/50">
          <div className="px-4 py-3 flex gap-3">
            {o.canSellerReject && <Button variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground h-12" onClick={() => o.setIsRejectionDialogOpen(true)} disabled={o.isUpdating}><XCircle size={16} className="mr-1.5" />Reject</Button>}
            {!o.nextStatus ? (
              o.isUpdating ? (
                <div className="flex-1 flex items-center justify-center gap-2 h-12 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span>Updating…</span>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 h-12 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary" />
                  <span>{getSellerContextMessage() || 'Waiting for next step…'}</span>
                </div>
              )
            ) : (() => {
              const nextOtpType = getStepOtpType(o.flow, o.nextStatus);
              const needsDeliveryOtp = nextOtpType === 'delivery' && !!deliveryAssignmentId;
              const needsGenericOtp = nextOtpType === 'generic';
              // Force OTP for delivery completion: if next status is a terminal "delivered/completed" step on a delivery order
              const nextStep = o.flow.find((s: any) => s.status_key === o.nextStatus);
              const isDeliveryTerminal = isDeliveryOrder && nextStep?.is_terminal && nextStep?.is_success;
              // For seller-delivery without platform assignment, use generic OTP instead of delivery OTP
              const forceGenericOtp = isDeliveryTerminal && !needsDeliveryOtp && !needsGenericOtp && !deliveryAssignmentId;
              const forceDeliveryOtp = isDeliveryTerminal && !needsDeliveryOtp && !needsGenericOtp && !!deliveryAssignmentId;

              return (needsDeliveryOtp || forceDeliveryOtp) ? (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => setIsOtpDialogOpen(true)} disabled={o.isUpdating}>
                  {o.isUpdating ? 'Updating...' : getActionLabel(o.nextStatus!, true)}
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              ) : (needsGenericOtp || forceGenericOtp) ? (
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

      {/* Buyer Action Bar */}
      {hasBuyerActionBar && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] bg-background/80 backdrop-blur-xl border-t border-border/50">
          <div className="px-4 py-3 flex gap-3">
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
              // Fallback: delivery OTP configured but no delivery assignment — use generic OTP
              const buyerFallbackGenericOtp = (buyerNextOtpType === 'delivery' || buyerNextOtpType === 'delivery_otp') && !deliveryAssignmentId;
              return buyerNeedsDeliveryOtp ? (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => setIsOtpDialogOpen(true)} disabled={o.isUpdating}>
                  {o.isUpdating ? 'Updating...' : getActionLabel(o.buyerNextStatus!, true)}
                  <ChevronRight size={14} className="ml-1" />
                </Button>
              ) : (buyerNeedsGenericOtp || buyerFallbackGenericOtp) ? (
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

      <DeliveryCompletionOtpDialog
        orderId={order.id}
        open={isOtpDialogOpen}
        onOpenChange={setIsOtpDialogOpen}
        onVerified={() => o.fetchOrder()}
      />

      {genericOtpTargetStatus && (
        <GenericOtpDialog
          orderId={order.id}
          targetStatus={genericOtpTargetStatus}
          open={isGenericOtpDialogOpen}
          onOpenChange={setIsGenericOtpDialogOpen}
          onVerified={() => o.fetchOrder()}
        />
      )}

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
