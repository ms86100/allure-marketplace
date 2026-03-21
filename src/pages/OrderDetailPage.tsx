import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewForm } from '@/components/review/ReviewForm';
import { OrderChat } from '@/components/chat/OrderChat';
import { OrderCancellation } from '@/components/order/OrderCancellation';
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

import { OrderItemCard } from '@/components/order/OrderItemCard';
import { AppointmentDetailsCard } from '@/components/order/AppointmentDetailsCard';
import { useServiceBookingForOrder } from '@/hooks/useServiceBookings';
import { FeedbackSheet } from '@/components/feedback/FeedbackSheet';
import { SellerPaymentConfirmation } from '@/components/payment/SellerPaymentConfirmation';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { OrderItem, OrderStatus, PaymentStatus, ItemStatus } from '@/types/database';
import { isTerminalStatus, isSuccessfulTerminal, isFirstFlowStep, stepRequiresOtp } from '@/hooks/useCategoryStatusFlow';
import { ArrowLeft, Phone, MapPin, Check, Star, MessageCircle, CreditCard, XCircle, Package, ChevronRight, Copy, Truck, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getString, setString } from '@/lib/persistent-kv';

import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { Capacitor } from '@capacitor/core';

// Gap 10: Lazy-load map to avoid bundling Leaflet for non-delivery orders
const DeliveryMapView = lazy(() => import('@/components/delivery/DeliveryMapView').then(m => ({ default: m.DeliveryMapView })));

function CelebrationBanner({ order, isBuyerView, flow }: { order: any; isBuyerView: boolean; flow: any }) {
  const show = isBuyerView && isSuccessfulTerminal(flow, order.status) && !getString(`celebration_${order.id}`);
  useEffect(() => {
    if (show) setString(`celebration_${order.id}`, 'true');
  }, [show, order.id]);
  if (!show) return null;
  const durationMs = new Date(order.updated_at || order.created_at).getTime() - new Date(order.created_at).getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));
  return (
    <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 text-center animate-in fade-in slide-in-from-top-2 duration-500">
      <span className="text-3xl">🎊</span>
      <p className="text-sm font-bold text-accent mt-1.5">Delivered in {durationMin} min!</p>
      <p className="text-xs text-muted-foreground mt-0.5">Thank you for supporting your community</p>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const o = useOrderDetail(id);
  const [deliveryAssignmentId, setDeliveryAssignmentId] = useState<string | null>(null);
  const [isOtpDialogOpen, setIsOtpDialogOpen] = useState(false);
  const [hasDeliveryFeedback, setHasDeliveryFeedback] = useState(false);
  const [buyerOtp, setBuyerOtp] = useState<string | null>(null);
  const [roadEtaMinutes, setRoadEtaMinutes] = useState<number | null>(null);
  const { data: serviceBooking } = useServiceBookingForOrder(o.order?.id);
  const { getSetting } = useSystemSettingsRaw(['proximity_thresholds', 'ui_setting_up_tracking']);

  const order = o.order;
  const orderId = order?.id;
  const fulfillmentType = o.orderFulfillmentType;
  const isDeliveryOrder = ['delivery', 'seller_delivery'].includes(fulfillmentType);

  const deliveryTracking = useDeliveryTracking(deliveryAssignmentId);
  const trackingConfig = useTrackingConfig();

  // Defensive guard: end any lingering Live Activity if order is terminal
  useEffect(() => {
    if (!orderId || !order?.status) return;
    if (!Capacitor.isNativePlatform()) return;
    if (isTerminalStatus(o.flow, order.status)) {
      LiveActivityManager.end(orderId).catch(() => {});
    }
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

  if (o.isLoading) return <AppLayout showHeader={false}><div className="p-4 space-y-3"><Skeleton className="h-8 w-32" /><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div></AppLayout>;
  if (!order) return <AppLayout showHeader={false}><div className="p-4 text-center py-16"><p className="text-sm text-muted-foreground">Order not found</p><Link to="/orders"><Button size="sm" className="mt-4">View Orders</Button></Link></div></AppLayout>;

  const seller = o.seller;
  const sellerProfile = seller?.profile;
  const buyer = (order as any).buyer;
  const items: OrderItem[] = (order as any).items || [];
  const hasItemsField = 'items' in (order as any);
  const statusInfo = o.getOrderStatus(order.status);
  const paymentStatusInfo = o.getPaymentStatus((order.payment_status as PaymentStatus) || 'pending');
  const displayStatuses = o.displayStatuses;
  const isInTransit = o.isInTransit;

  // Gap G: Only show arrival overlay for BUYER when rider is close AND order is not terminal
  const showArrivalOverlay = o.isBuyerView && !isTerminalStatus(o.flow, order.status) && deliveryAssignmentId && deliveryTracking.riderLocation && deliveryTracking.distance != null && deliveryTracking.distance < trackingConfig.arrival_overlay_distance_meters;


  return (
    <AppLayout showHeader={false} showNav={isTerminalStatus(o.flow, order.status)}>
      <div className="pb-28">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background border-b border-border px-4 py-3.5 safe-top flex items-center gap-3">
          <button onClick={() => navigate('/orders')} className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold">Order Summary</h1>
            <button onClick={o.copyOrderId} className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">#{order.id.slice(0, 8)} <Copy size={10} /></button>
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

        <div className="px-4 pt-3 space-y-3">
          {/* Delivery completion celebration — shown once for delivered/completed orders */}
          <CelebrationBanner order={order} isBuyerView={o.isBuyerView} flow={o.flow} />

          {/* Gap 11: Order placed celebration banner — shown for newly placed orders */}
          {o.isBuyerView && isFirstFlowStep(o.flow, order.status) && (Date.now() - new Date(order.created_at).getTime() < 60000) && (
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

          {/* #5: Seller response time expectation for buyers */}
          {o.isBuyerView && isFirstFlowStep(o.flow, order.status) && !o.isUrgentOrder && (
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
          )

          {o.isUrgentOrder && order.auto_cancel_at && <UrgentOrderTimer autoCancelAt={order.auto_cancel_at} onTimeout={o.handleTimeout} />}

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
                <p className="text-sm font-semibold text-destructive">Order Cancelled</p>
                <p className="text-xs text-muted-foreground mt-0.5">{order.rejection_reason}</p>
                {o.isSellerView && order.rejection_reason?.toLowerCase().includes('auto') && (
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
              <div className="flex items-center justify-between mt-4 gap-1">
                {displayStatuses.map((status, index) => {
                  const statusIndex = o.statusOrder.indexOf(status as OrderStatus);
                  const isCompleted = statusIndex <= o.currentStatusIndex;
                  const isCurrent = statusIndex === o.currentStatusIndex;
                  return (
                    <div key={status} className="flex flex-col items-center flex-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${isCompleted ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'} ${isCurrent ? 'ring-2 ring-accent ring-offset-1 ring-offset-background' : ''}`}>
                        {isCompleted ? <Check size={14} /> : index + 1}
                      </div>
                      <span className="text-[9px] text-center mt-1 text-muted-foreground leading-tight">{o.getFlowStepLabel(status as string).label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {order.status !== 'cancelled' && o.isBuyerView && (() => {
              const hint = o.getBuyerHint(order.status);
              return hint ? (
                <p className="text-xs text-muted-foreground mt-3 bg-muted/50 rounded-lg px-3 py-2">{hint}</p>
              ) : null;
            })()}
            {o.isBuyerView && !o.buyerNextStatus && (
              <OrderCancellation orderId={order.id} orderStatus={order.status} onCancelled={() => o.fetchOrder()} canCancel={o.canBuyerCancel} />
            )}
          </div>

          {/* Appointment Details for Service Bookings */}
          {serviceBooking && <AppointmentDetailsCard booking={serviceBooking} />}

          {/* Payment */}
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5"><CreditCard size={16} className="text-muted-foreground" /><p className="text-sm font-medium">{((order as any).payment_method || (order as any).payment_type) === 'cod' ? 'Cash on Delivery' : 'UPI Payment'}</p></div>
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
          {o.isSellerView && (order as any).payment_status === 'buyer_confirmed' && (order as any).payment_confirmed_by_seller === null && (
            <SellerPaymentConfirmation
              orderId={order.id}
              amount={order.total_amount}
              utrRef={(order as any).upi_transaction_ref}
              buyerName={buyer?.name}
              screenshotUrl={(order as any).payment_screenshot_url}
              onConfirmed={() => o.fetchOrder()}
            />
          )}

          {/* Gap 11: ETA banner for buyer — shown from acceptance until delivery */}
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

          {/* Gap 8: Buyer delivery confirmation — only for non-delivery orders (delivery orders use OTP as proof) */}
          {o.isBuyerView && isSuccessfulTerminal(o.flow, order.status) && !isDeliveryOrder && (
            <BuyerDeliveryConfirmation
              orderId={order.id}
              sellerName={seller?.business_name}
              onConfirmed={() => o.fetchOrder()}
            />
          )}

          {/* Live Delivery Tracking or Static Card */}
          {isDeliveryOrder && isInTransit && deliveryAssignmentId && (
            <>
              {/* Gap 10: Map view — fallback to buyer profile coords if delivery_lat/lng missing */}
              {deliveryTracking.riderLocation && (() => {
                const destLat = (order as any).delivery_lat || (buyer as any)?.latitude || null;
                const destLng = (order as any).delivery_lng || (buyer as any)?.longitude || null;
                return destLat && destLng ? (
                  <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
                    <DeliveryMapView
                      riderLat={deliveryTracking.riderLocation.latitude}
                      riderLng={deliveryTracking.riderLocation.longitude}
                      destinationLat={destLat}
                      destinationLng={destLng}
                      riderName={deliveryTracking.riderName}
                      heading={deliveryTracking.riderLocation.heading}
                      onRoadEtaChange={setRoadEtaMinutes}
                    />
                  </Suspense>
                ) : null;
              })()}
              <LiveDeliveryTracker assignmentId={deliveryAssignmentId} isBuyerView={o.isBuyerView} trackingState={deliveryTracking} roadEtaMinutes={roadEtaMinutes} statusHints={(() => {
                const hints: Record<string, { buyer_hint?: string | null; seller_hint?: string | null; display_label?: string | null }> = {};
                for (const step of o.flow) {
                  hints[step.status_key] = { buyer_hint: step.buyer_hint, seller_hint: (step as any).seller_hint, display_label: step.display_label };
                }
                return hints;
              })()} />
              {o.isBuyerView && (
                <div className="flex justify-end">
                  <UpdateBuyerLocationButton orderId={order.id} />
                </div>
              )}
            </>
          )}
          {/* Gap 3: Fallback when delivery is in transit but assignment hasn't been created yet */}
          {isDeliveryOrder && isInTransit && !deliveryAssignmentId && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3 justify-center text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                <p className="text-sm">{getSetting('ui_setting_up_tracking') || 'Setting up live tracking...'}</p>
              </div>
            </div>
          )}
          {/* Seller self-delivery GPS broadcasting */}
          {/* Gap 1: Pass deliveryStatus so GPS auto-stops on terminal states */}
          {isDeliveryOrder && o.isSellerView && (order as any).delivery_handled_by !== 'platform' && o.isInTransit && deliveryAssignmentId && (
            <SellerGPSTracker assignmentId={deliveryAssignmentId} autoStart deliveryStatus={order.status} />
          )}
          {/* Persistent OTP card — visible to buyer for ALL non-terminal delivery statuses */}
          {o.isBuyerView && isDeliveryOrder && buyerOtp && !isTerminalStatus(o.flow, order.status) && (
            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Your Delivery Code</p>
              <p className="text-3xl font-bold tracking-[0.3em] text-primary">{buyerOtp}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">Share this code with the delivery person to confirm delivery</p>
            </div>
          )}
          {isDeliveryOrder && !isInTransit && <DeliveryStatusCard orderId={order.id} isBuyerView={o.isBuyerView} />}

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
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 py-3 flex items-center justify-center gap-2 h-12 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span>Loading actions…</span>
          </div>
        </div>
      )}

      {/* Seller Action Bar */}
      {/* Gap 2: Seller Action Bar — intercept "delivered" to require OTP for delivery orders */}
      {o.isSellerView && !o.isFlowLoading && o.flow.length > 0 && !isTerminalStatus(o.flow, order.status) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 py-3 flex gap-3">
            {o.canSellerReject && <Button variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground h-12" onClick={() => o.setIsRejectionDialogOpen(true)} disabled={o.isUpdating}><XCircle size={16} className="mr-1.5" />Reject</Button>}
            {o.orderFulfillmentType === 'delivery' && o.flow.find(s => s.status_key === order.status)?.actor === 'system' && (order as any).delivery_handled_by === 'platform' ? (
              <div className="flex-1 flex items-center justify-center gap-2 h-12 text-sm text-muted-foreground"><Truck size={16} className="text-primary" /><span>Awaiting delivery pickup</span></div>
            ) : o.nextStatus ? (
              /* CRITICAL: For delivery orders transitioning to 'delivered', ALWAYS require OTP.
                 Never fall back to direct updateOrderStatus for delivered status on delivery orders. */
              (stepRequiresOtp(o.flow, o.nextStatus) || (o.nextStatus === 'delivered' && isDeliveryOrder)) ? (
                deliveryAssignmentId ? (
                  <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => setIsOtpDialogOpen(true)} disabled={o.isUpdating}>
                    {o.isUpdating ? 'Updating...' : 'Verify & Deliver'}
                    <ChevronRight size={14} className="ml-1" />
                  </Button>
                ) : (
                  /* Assignment not yet loaded — block action, show loading instead of unsafe fallback */
                  <Button className="flex-1 h-12" disabled>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Preparing delivery verification…
                  </Button>
                )
              ) : (
                <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => o.updateOrderStatus(o.nextStatus!)} disabled={o.isUpdating}>{o.isUpdating ? 'Updating...' : `Mark ${o.getOrderStatus(o.nextStatus).label}`}<ChevronRight size={14} className="ml-1" /></Button>
              )
            ) : null}
          </div>
        </div>
      )}

      {/* Buyer Action Bar — DB-driven: renders when buyer has a forward action OR can cancel */}
      {o.isBuyerView && !isTerminalStatus(o.flow, order.status) && (o.buyerNextStatus || o.canBuyerCancel) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 py-3 flex gap-3">
            {o.canBuyerCancel && (
              <OrderCancellation orderId={order.id} orderStatus={order.status} onCancelled={() => o.fetchOrder()} canCancel={o.canBuyerCancel} />
            )}
            {o.buyerNextStatus && (
              <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => o.buyerAdvanceOrder(o.buyerNextStatus!)} disabled={o.isUpdating}>
                {o.isUpdating ? 'Updating...' : o.getFlowStepLabel(o.buyerNextStatus).label}
                <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
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
