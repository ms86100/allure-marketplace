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
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking';

import { OrderItemCard } from '@/components/order/OrderItemCard';
import { AppointmentDetailsCard } from '@/components/order/AppointmentDetailsCard';
import { useServiceBookingForOrder } from '@/hooks/useServiceBookings';
import { FeedbackSheet } from '@/components/feedback/FeedbackSheet';
import { SellerPaymentConfirmation } from '@/components/payment/SellerPaymentConfirmation';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { OrderItem, OrderStatus, PaymentStatus, ItemStatus } from '@/types/database';
import { isTerminalStatus } from '@/hooks/useCategoryStatusFlow';
import { ArrowLeft, Phone, MapPin, Check, Star, MessageCircle, CreditCard, XCircle, Package, ChevronRight, Copy, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getString, setString } from '@/lib/persistent-kv';
import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Gap 10: Lazy-load map to avoid bundling Leaflet for non-delivery orders
const DeliveryMapView = lazy(() => import('@/components/delivery/DeliveryMapView').then(m => ({ default: m.DeliveryMapView })));

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const o = useOrderDetail(id);
  const [deliveryAssignmentId, setDeliveryAssignmentId] = useState<string | null>(null);
  const { data: serviceBooking } = useServiceBookingForOrder(o.order?.id);

  const order = o.order;
  const orderId = order?.id;
  const fulfillmentType = o.orderFulfillmentType;
  const isDeliveryOrder = ['delivery', 'seller_delivery'].includes(fulfillmentType);

  const deliveryTracking = useDeliveryTracking(deliveryAssignmentId);

  // Live Activity is now handled globally by useLiveActivityOrchestrator

  useEffect(() => {
    if (isDeliveryOrder && orderId) {
      const fetchAssignment = () => {
        supabase
          .from('delivery_assignments')
          .select('id')
          .eq('order_id', orderId)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setDeliveryAssignmentId(data.id);
          });
      };
      fetchAssignment();

      // Re-check when order status changes (assignment may be created on picked_up)
      const channel = supabase
        .channel(`assignment-watch-${orderId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_assignments',
          filter: `order_id=eq.${orderId}`,
        }, (payload) => {
          if (payload.new?.id) setDeliveryAssignmentId(payload.new.id as string);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [orderId, isDeliveryOrder]);

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

  // Gap 9: Only show arrival overlay when we have actual GPS data and rider is close
  const showArrivalOverlay = deliveryAssignmentId && deliveryTracking.riderLocation && deliveryTracking.distance != null && deliveryTracking.distance < 200;

  return (
    <AppLayout showHeader={false} showNav={(!o.isSellerView || isTerminalStatus(o.flow, order.status)) && !o.isChatOpen}>
      <div className="pb-28">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background border-b border-border px-4 py-3.5 safe-top flex items-center gap-3">
          <button onClick={() => window.history.length > 1 ? window.history.back() : navigate('/orders')} className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold">Order Summary</h1>
            <button onClick={o.copyOrderId} className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">#{order.id.slice(0, 8)} <Copy size={10} /></button>
          </div>
          {o.canChat && o.chatRecipientId && (
            <button onClick={() => o.setIsChatOpen(true)} className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted">
              <MessageCircle size={16} />
              {o.unreadMessages > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{o.unreadMessages}</span>}
            </button>
          )}
        </div>

        <div className="px-4 pt-3 space-y-3">
          {o.isUrgentOrder && order.auto_cancel_at && <UrgentOrderTimer autoCancelAt={order.auto_cancel_at} onTimeout={o.handleTimeout} />}

          {order.status === 'cancelled' && order.rejection_reason && o.isBuyerView && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-start gap-2.5">
              <XCircle className="text-destructive shrink-0 mt-0.5" size={16} />
              <div><p className="text-sm font-semibold text-destructive">Order Cancelled</p><p className="text-xs text-muted-foreground mt-0.5">{order.rejection_reason}</p></div>
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
            {o.isBuyerView && (
              <OrderCancellation orderId={order.id} orderStatus={order.status} onCancelled={() => window.location.reload()} canCancel={o.canBuyerCancel} />
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
              onConfirmed={() => window.location.reload()}
            />
          )}

          {/* Gap 11: ETA banner for buyer — shown from acceptance until delivery */}
          {o.isBuyerView && isDeliveryOrder && (order as any).estimated_delivery_at && !['delivered', 'completed', 'cancelled'].includes(order.status) && !(deliveryAssignmentId && deliveryTracking.eta) && (
            <DeliveryETABanner estimatedDeliveryAt={(order as any).estimated_delivery_at} />
          )}

          {/* Gap 8: Buyer delivery confirmation — shown when seller marks delivered */}
          {o.isBuyerView && order.status === 'delivered' && isDeliveryOrder && (
            <BuyerDeliveryConfirmation
              orderId={order.id}
              sellerName={seller?.business_name}
              onConfirmed={() => window.location.reload()}
            />
          )}

          {/* Live Delivery Tracking or Static Card */}
          {isDeliveryOrder && isInTransit && deliveryAssignmentId && (
            <>
              {/* Buyer map view — show when rider has GPS data (lazy-loaded) */}
              {o.isBuyerView && deliveryTracking.riderLocation && (order as any).delivery_lat && (order as any).delivery_lng && (
                <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
                  <DeliveryMapView
                    riderLat={deliveryTracking.riderLocation.latitude}
                    riderLng={deliveryTracking.riderLocation.longitude}
                    destinationLat={(order as any).delivery_lat}
                    destinationLng={(order as any).delivery_lng}
                    riderName={deliveryTracking.riderName}
                  />
                </Suspense>
              )}
              <LiveDeliveryTracker assignmentId={deliveryAssignmentId} isBuyerView={o.isBuyerView} />
            </>
          )}
          {/* Seller self-delivery GPS broadcasting */}
          {isDeliveryOrder && o.isSellerView && (order as any).delivery_handled_by !== 'platform' && ['picked_up', 'on_the_way'].includes(order.status) && deliveryAssignmentId && (
            <SellerGPSTracker assignmentId={deliveryAssignmentId} autoStart />
          )}
          {isDeliveryOrder && !isInTransit && <DeliveryStatusCard orderId={order.id} isBuyerView={o.isBuyerView} />}

          {o.canReorder && (
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><Package className="text-accent" size={18} /><div><p className="text-sm font-semibold">Order again?</p><p className="text-[11px] text-muted-foreground">Same items, one tap</p></div></div>
              <ReorderButton orderItems={items} sellerId={order.seller_id} size="sm" />
            </div>
          )}

          {o.isBuyerView && (order.status === 'completed' || order.status === 'delivered') && !getString(`feedback_prompted_${order.id}`) && (
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

      {/* Seller Action Bar */}
      {o.isSellerView && !isTerminalStatus(o.flow, order.status) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 py-3 flex gap-3">
            {o.canSellerReject && <Button variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground h-12" onClick={() => o.setIsRejectionDialogOpen(true)} disabled={o.isUpdating}><XCircle size={16} className="mr-1.5" />Reject</Button>}
            {o.orderFulfillmentType === 'delivery' && order.status === 'ready' && (order as any).delivery_handled_by === 'platform' ? (
              <div className="flex-1 flex items-center justify-center gap-2 h-12 text-sm text-muted-foreground"><Truck size={16} className="text-primary" /><span>Awaiting delivery pickup</span></div>
            ) : o.nextStatus ? (
              <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-12" onClick={() => o.updateOrderStatus(o.nextStatus!)} disabled={o.isUpdating}>{o.isUpdating ? 'Updating...' : `Mark ${o.getOrderStatus(o.nextStatus).label}`}<ChevronRight size={14} className="ml-1" /></Button>
            ) : null}
          </div>
        </div>
      )}

      <OrderRejectionDialog open={o.isRejectionDialogOpen} onOpenChange={o.setIsRejectionDialogOpen} onReject={o.handleReject} orderNumber={order.id} />
      {o.chatRecipientId && <OrderChat orderId={order.id} otherUserId={o.chatRecipientId} otherUserName={o.chatRecipientName || 'User'} isOpen={o.isChatOpen} onClose={() => { o.setIsChatOpen(false); o.fetchUnreadCount(); }} disabled={!o.canChat} />}

      {/* DeliveryArrivalOverlay — only when rider GPS exists and is close (Gap 9) */}
      {showArrivalOverlay && (
        <DeliveryArrivalOverlay
          distance={deliveryTracking.distance}
          eta={deliveryTracking.eta}
          riderName={deliveryTracking.riderName}
          riderPhone={deliveryTracking.riderPhone}
          status={deliveryTracking.status}
          onDismiss={() => {}}
        />
      )}
    </AppLayout>
  );
}
