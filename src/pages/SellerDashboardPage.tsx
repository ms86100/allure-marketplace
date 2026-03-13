import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { SellerProfile } from '@/types/database';
import { Package, Loader2, Eye, Star, Clock, CheckCircle, XCircle, ShieldCheck, CalendarDays, Wrench, BarChart3, ShoppingBag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/utils';
import { logAudit } from '@/lib/audit';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// Import refactored components
import { StoreStatusCard } from '@/components/seller/StoreStatusCard';
import { SellerVisibilityChecklist } from '@/components/seller/SellerVisibilityChecklist';
import { EarningsSummary } from '@/components/seller/EarningsSummary';
import { DashboardStats } from '@/components/seller/DashboardStats';
import { QuickActions } from '@/components/seller/QuickActions';
import { OrderFilters, OrderFilter } from '@/components/seller/OrderFilters';
import { SellerOrderCard } from '@/components/seller/SellerOrderCard';
import { CouponManager } from '@/components/seller/CouponManager';
import { SellerAnalytics } from '@/components/seller/SellerAnalytics';
import { DemandInsights } from '@/components/seller/DemandInsights';
import { NewOrderAlertOverlay } from '@/components/seller/NewOrderAlertOverlay';
import { ServiceBookingStats } from '@/components/seller/ServiceBookingStats';
import { SellerDayAgenda } from '@/components/seller/SellerDayAgenda';
import { AvailabilityPromptBanner } from '@/components/seller/AvailabilityPromptBanner';
import { MissingLocationBanner } from '@/components/seller/MissingLocationBanner';
import { useSellerOrderStats, useSellerOrdersInfinite, useSellerOrderFilterCounts } from '@/hooks/queries/useSellerOrders';
import { useNewOrderAlert } from '@/hooks/useNewOrderAlert';

export default function SellerDashboardPage() {
  const { user, sellerProfiles = [], currentSellerId } = useAuth();
  const settings = useSystemSettings();
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [renderError, setRenderError] = useState<string | null>(null);

  const activeSellerId = currentSellerId || (Array.isArray(sellerProfiles) && sellerProfiles.length > 0 ? sellerProfiles[0].id : null);
  const { pendingAlerts, dismiss: dismissAlert, snooze: snoozeAlert } = useNewOrderAlert(activeSellerId);

  useEffect(() => {
    console.log('[SellerDashboard] Auth state:', { userId: user?.id, sellerProfilesCount: sellerProfiles?.length, activeSellerId, currentSellerId });
  }, [user, sellerProfiles, activeSellerId, currentSellerId]);

  useEffect(() => {
    if (user && activeSellerId) {
      fetchSellerProfile(activeSellerId);
    } else {
      setIsLoadingProfile(false);
    }
  }, [user, activeSellerId]);

  const fetchSellerProfile = async (sellerId: string) => {
    setIsLoadingProfile(true);
    setRenderError(null);
    try {
      const { data: profile, error } = await supabase
        .from('seller_profiles')
        .select('*')
        .eq('id', sellerId)
        .single();

      if (error) {
        console.error('[SellerDashboard] Profile fetch error:', error);
        setRenderError(`Failed to load profile: ${error.message}`);
      }
      setSellerProfile(profile ? (profile as SellerProfile) : null);
    } catch (error) {
      console.error('[SellerDashboard] Unexpected error:', error);
      setRenderError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const { data: stats } = useSellerOrderStats(activeSellerId);
  const { data: filterCounts } = useSellerOrderFilterCounts(activeSellerId);
  const {
    data: ordersPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSellerOrdersInfinite(activeSellerId, orderFilter);

  const allOrders = ordersPages?.pages.flat() || [];

  const toggleAvailability = async () => {
    if (!sellerProfile) return;

    try {
      const { error } = await supabase
        .from('seller_profiles')
        .update({ is_available: !sellerProfile.is_available })
        .eq('id', sellerProfile.id);

      if (error) throw error;

      setSellerProfile({
        ...sellerProfile,
        is_available: !sellerProfile.is_available,
      });

      toast.success(
        sellerProfile.is_available ? 'Store is now closed' : 'Store is now open'
      );

      if (sellerProfile.society_id) {
        logAudit(
          sellerProfile.is_available ? 'store_closed' : 'store_opened',
          'seller_profile',
          sellerProfile.id,
          sellerProfile.society_id
        );
      }
    } catch (error) {
      console.error('Error toggling availability:', error);
      toast.error(friendlyError(error));
    }
  };

  if (isLoadingProfile) {
    return (
      <AppLayout headerTitle="Seller Dashboard" showLocation={false}>
        <div className="p-4 space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (renderError) {
    return (
      <AppLayout headerTitle="Seller Dashboard" showLocation={false}>
        <div className="p-4 text-center py-12">
          <p className="text-destructive mb-2">Something went wrong</p>
          <p className="text-xs text-muted-foreground mb-4">{renderError}</p>
          <Button onClick={() => activeSellerId && fetchSellerProfile(activeSellerId)}>Try Again</Button>
        </div>
      </AppLayout>
    );
  }

  if (!sellerProfile) {
    return (
      <AppLayout headerTitle="Seller Dashboard" showLocation={false}>
        <div className="p-4 text-center py-12">
          <p className="text-muted-foreground mb-2">
            You haven't set up your seller profile yet
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {settings.sellerEmptyStateCopy}
          </p>
          <Link to="/become-seller">
            <Button>Become a Seller</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout headerTitle="Seller Dashboard" showLocation={false}>
      <NewOrderAlertOverlay orders={pendingAlerts} onDismiss={dismissAlert} onSnooze={snoozeAlert} />
      <div className="p-4 space-y-4">
        {/* Rejection / Pending banner */}
        {sellerProfile.verification_status !== 'approved' && (
          <div className={cn(
            'rounded-xl border p-4 space-y-2',
            sellerProfile.verification_status === 'rejected'
              ? 'bg-destructive/10 border-destructive/20'
              : 'bg-warning/10 border-warning/20',
          )}>
            <div className="flex items-start gap-2">
              {sellerProfile.verification_status === 'rejected' ? (
                <XCircle size={18} className="text-destructive shrink-0 mt-0.5" />
              ) : (
                <Clock size={18} className="text-warning shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {sellerProfile.verification_status === 'rejected'
                    ? 'Your store application was rejected'
                    : 'Your store is pending review'}
                </p>
                {(sellerProfile as any).rejection_note && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Reason: {(sellerProfile as any).rejection_note}
                  </p>
                )}
                <Link to="/become-seller">
                  <Button size="sm" variant={sellerProfile.verification_status === 'rejected' ? 'destructive' : 'outline'} className="mt-2 h-8 text-xs">
                    {sellerProfile.verification_status === 'rejected' ? 'Update & Resubmit' : 'View Application'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
        {/* Always visible */}
        <StoreStatusCard
          sellerProfile={sellerProfile}
          sellerProfiles={sellerProfiles}
          onToggleAvailability={toggleAvailability}
        />
        <SellerVisibilityChecklist sellerId={sellerProfile.id} />
        <MissingLocationBanner
          sellerId={sellerProfile.id}
          hasCoordinates={!!(sellerProfile as any).latitude && !!(sellerProfile as any).longitude}
          hasSocietyId={!!sellerProfile.society_id}
        />

        {/* Tab navigation */}
        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="sticky top-0 z-10 w-full grid grid-cols-4 h-11 bg-muted/80 backdrop-blur-sm">
            <TabsTrigger value="orders" className="gap-1.5 text-xs px-1">
              <ShoppingBag size={14} />
              <span className="hidden min-[360px]:inline">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1.5 text-xs px-1">
              <CalendarDays size={14} />
              <span className="hidden min-[360px]:inline">Schedule</span>
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-1.5 text-xs px-1">
              <Wrench size={14} />
              <span className="hidden min-[360px]:inline">Tools</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5 text-xs px-1">
              <BarChart3 size={14} />
              <span className="hidden min-[360px]:inline">Stats</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Orders Tab ── */}
          <TabsContent value="orders" className="space-y-4 mt-4">
            <AvailabilityPromptBanner sellerId={sellerProfile.id} />

            <DashboardStats
              totalOrders={stats?.totalOrders || 0}
              pendingOrders={stats?.pendingOrders || 0}
              todayOrders={stats?.todayOrders || 0}
              completedOrders={stats?.completedOrders || 0}
            />

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Orders</h3>
              </div>
              <div className="mb-4">
                <OrderFilters
                  currentFilter={orderFilter}
                  onFilterChange={setOrderFilter}
                  counts={filterCounts || { all: 0, today: 0, enquiries: 0, pending: 0, preparing: 0, ready: 0, completed: 0 }}
                />
              </div>
              {allOrders.length > 0 ? (
                <div className="space-y-3">
                  {allOrders.map((order: any) => (
                    <SellerOrderCard key={order.id} order={order} />
                  ))}
                  {hasNextPage && (
                    <div className="flex justify-center py-2">
                      <Button variant="secondary" size="default" className="w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                        {isFetchingNextPage ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</> : 'Load More'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 bg-muted rounded-xl">
                  <Package className="mx-auto text-muted-foreground mb-2" size={32} />
                  <p className="text-sm text-muted-foreground">
                    No {orderFilter !== 'all' ? orderFilter : ''} orders
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {orderFilter === 'all'
                      ? 'Share your store link with neighbors to get your first order'
                      : 'Orders in this status will appear here as buyers place them'}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Schedule Tab ── */}
          <TabsContent value="schedule" className="space-y-4 mt-4">
            <ServiceBookingStats sellerId={sellerProfile.id} />
            <SellerDayAgenda sellerId={sellerProfile.id} />
          </TabsContent>

          {/* ── Tools Tab ── */}
          <TabsContent value="tools" className="space-y-4 mt-4">
            <QuickActions />
            <CouponManager />
          </TabsContent>

          {/* ── Stats Tab ── */}
          <TabsContent value="stats" className="space-y-4 mt-4">
            {/* Store Performance Card */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">How buyers see your store</h3>
                  <Link to={`/seller/${sellerProfile.id}`}>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                      <Eye size={14} />
                      Preview
                    </Button>
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <Star size={16} className="text-warning" />
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{Number(sellerProfile.rating || 0).toFixed(1)} ★</p>
                      <p className="text-[10px] text-muted-foreground">{sellerProfile.total_reviews || 0} reviews</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <Clock size={16} className="text-primary" />
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{sellerProfile.avg_response_minutes != null ? `~${sellerProfile.avg_response_minutes} min` : 'N/A'}</p>
                      <p className="text-[10px] text-muted-foreground">Avg response</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <CheckCircle size={16} className="text-success" />
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{sellerProfile.completed_order_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Orders fulfilled</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <XCircle size={16} className="text-destructive" />
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{sellerProfile.cancellation_rate != null ? `${sellerProfile.cancellation_rate}%` : '0%'}</p>
                      <p className="text-[10px] text-muted-foreground">Cancellation</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(sellerProfile.completed_order_count || 0) === 0 && (
                    <Badge variant="secondary" className="text-[10px] bg-secondary text-secondary-foreground">New Seller</Badge>
                  )}
                  {(sellerProfile.cancellation_rate === 0 || sellerProfile.cancellation_rate === null) && (sellerProfile.completed_order_count || 0) > 2 && (
                    <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">
                      <ShieldCheck size={10} className="mr-0.5" />0% Cancellation
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <EarningsSummary
              todayEarnings={stats?.todayEarnings || 0}
              weekEarnings={stats?.weekEarnings || 0}
              totalEarnings={stats?.totalEarnings || 0}
            />

            <SellerAnalytics sellerId={sellerProfile.id} />
            <DemandInsights societyId={sellerProfile.society_id} sellerId={sellerProfile.id} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
