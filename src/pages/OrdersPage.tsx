import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReorderButton } from '@/components/order/ReorderButton';
import { SellerSwitcher } from '@/components/seller/SellerSwitcher';
import { RecurringBookingsList } from '@/components/booking/RecurringBookingsList';
import { BuyerBookingsCalendar } from '@/components/booking/BuyerBookingsCalendar';
import { useAuth } from '@/contexts/AuthContext';
import { Order } from '@/types/database';
import { useStatusLabels } from '@/hooks/useStatusLabels';
import { useTerminalStatuses } from '@/hooks/useCategoryStatusFlow';
import { Package, ChevronRight, Loader2, ArrowLeft, CheckCircle, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { useCurrency } from '@/hooks/useCurrency';

const PAGE_SIZE = 20;

function OrderCard({ order, type, successTerminals }: { order: Order; type: 'buyer' | 'seller'; successTerminals: Set<string> }) {
  const { getOrderStatus } = useStatusLabels();
  const { formatPrice } = useCurrency();
  const statusInfo = getOrderStatus(order.status);
  const seller = (order as any).seller;
  const buyer = (order as any).buyer;
  const items = (order as any).items || [];
  const canReorder = type === 'buyer' && successTerminals.has(order.status);
  const isCompleted = successTerminals.has(order.status);

  return (
    <Link to={`/orders/${order.id}`} className="block">
      <div className="bg-card border border-border rounded-xl p-3 mb-2.5 active:scale-[0.99] transition-transform">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-muted">
            {seller?.cover_image_url ? (
              <img src={seller.cover_image_url} alt={seller?.business_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package size={20} className="text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold truncate">
                {type === 'buyer' ? seller?.business_name : buyer?.name}
              </h3>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            </div>

            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {isCompleted && <CheckCircle size={12} className="text-accent shrink-0" />}
              {['delivery', 'seller_delivery'].includes((order as any).fulfillment_type) && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent/15 text-accent flex items-center gap-0.5">
                  <Truck size={10} /> Delivery
                </span>
              )}
              <span className={`text-[11px] px-1.5 py-0.5 rounded ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              {(order as any).payment_type && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                  {(order as any).payment_type === 'cod' ? 'COD' : (order as any).payment_type === 'card' ? 'Online ✓' : 'UPI ✓'}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {format(new Date(order.created_at), 'MMM d')}
              </span>
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {items.length} item{items.length > 1 ? 's' : ''} · {formatPrice(order.total_amount)}
            </p>

            {type === 'seller' && buyer && (
              <p className="text-[11px] text-muted-foreground">
                Block {buyer.block}, {buyer.flat_number}
              </p>
            )}
          </div>
        </div>

        {canReorder && (
          <div className="mt-2.5 pt-2.5 border-t border-border flex justify-end" onClick={(e) => e.stopPropagation()}>
            <ReorderButton orderItems={items} sellerId={order.seller_id} variant="outline" size="sm" />
          </div>
        )}
      </div>
    </Link>
  );
}

function EmptyState({ message, type }: { message: string; type?: 'buyer' | 'seller' }) {
  return (
    <div className="text-center py-16 animate-fade-in">
      <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
        <Package size={28} className="text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">{message}</h3>
      {type === 'buyer' && (
        <p className="text-sm text-muted-foreground mb-4 max-w-[240px] mx-auto">
          Discover products and services from your community
        </p>
      )}
      {type === 'seller' && (
        <p className="text-xs text-muted-foreground mb-4 max-w-[220px] mx-auto">
          Share your store link with neighbors to get your first order
        </p>
      )}
      <Link to="/">
        <Button size="sm">
          {type === 'buyer' ? '🛒 Place your first order' : 'Browse Sellers'}
        </Button>
      </Link>
    </div>
  );
}

function OrderList({ type, userId, sellerId }: { type: 'buyer' | 'seller'; userId: string; sellerId?: string }) {
  const { successSet, terminalSet } = useTerminalStatuses();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [buyerFilter, setBuyerFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');

  const fetchOrders = useCallback(async (cursor?: string) => {
    const isInitial = !cursor;
    if (isInitial) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      let query;
      if (type === 'buyer') {
        query = supabase
          .from('orders')
          .select(`*, seller:seller_profiles(business_name, cover_image_url), items:order_items(*)`)
          .eq('buyer_id', userId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        // payment_method is included via * select
      } else {
        query = supabase
          .from('orders')
          .select(`*, buyer:profiles!orders_buyer_id_fkey(name, block, flat_number, phone), items:order_items(*)`)
          .eq('seller_id', sellerId!)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
      }

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data } = await query;
      const results = (data as any) || [];

      if (isInitial) setOrders(results);
      else setOrders(prev => [...prev, ...results]);
      setHasMore(results.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [type, userId, sellerId]);

  const location = useLocation();
  const prevKeyRef = useRef(location.key);

  useEffect(() => {
    fetchOrders();
    prevKeyRef.current = location.key;
  }, [type, userId, sellerId, location.key]);

  // Refresh order list when tab becomes visible or after status-change alerts
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchOrders();
    };
    const handleRefetchEvent = () => fetchOrders();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('order-detail-refetch', handleRefetchEvent);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('order-detail-refetch', handleRefetchEvent);
    };
  }, [fetchOrders]);

  const loadMore = () => {
    if (orders.length > 0 && hasMore) {
      const lastOrder = orders[orders.length - 1];
      fetchOrders(lastOrder.created_at);
    }
  };

  const filteredOrders = type === 'buyer' ? orders.filter(order => {
    if (buyerFilter === 'all') return true;
    if (buyerFilter === 'cancelled') return terminalSet.has(order.status) && !successSet.has(order.status);
    if (buyerFilter === 'completed') return successSet.has(order.status);
    if (buyerFilter === 'active') return !terminalSet.has(order.status);
    return true;
  }) : orders;

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  if (orders.length === 0) {
    return <EmptyState message={type === 'buyer' ? "You haven't placed any orders yet" : "No orders received yet"} type={type} />;
  }

  return (
    <div>
      {/* Buyer filter chips */}
      {type === 'buyer' && orders.length > 3 && (
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          {(['all', 'active', 'completed', 'cancelled'] as const).map(f => (
            <button
              key={f}
              onClick={() => setBuyerFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                buyerFilter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'completed' ? 'Completed' : 'Cancelled'}
            </button>
          ))}
        </div>
      )}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No {buyerFilter} orders</div>
      ) : (
        filteredOrders.map(order => <OrderCard key={order.id} order={order} type={type} successTerminals={successSet} />)
      )}
      {hasMore && (
        <div className="flex justify-center py-4">
          <Button variant="secondary" size="default" className="w-full" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading...</> : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const { user, isSeller, currentSellerId } = useAuth();

  if (!user) return null;

  return (
    <AppLayout headerTitle="Orders">
      <div className="pb-4">
        <div className="px-4 pt-3">
          {isSeller ? (
            <Tabs defaultValue="buying" className="w-full">
              <TabsList className="w-full mb-3 h-9">
                <TabsTrigger value="buying" className="flex-1 text-xs">My Orders</TabsTrigger>
                <TabsTrigger value="selling" className="flex-1 text-xs">Received</TabsTrigger>
              </TabsList>
              <TabsContent value="buying">
                <BuyerBookingsCalendar />
                <RecurringBookingsList />
                <OrderList type="buyer" userId={user.id} />
              </TabsContent>
              <TabsContent value="selling">
                <div className="mb-3">
                  <SellerSwitcher />
                </div>
                <OrderList type="seller" userId={user.id} sellerId={currentSellerId || undefined} />
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <BuyerBookingsCalendar />
              <RecurringBookingsList />
              <OrderList type="buyer" userId={user.id} />
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
