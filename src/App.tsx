import React, { useEffect, lazy, Suspense, ComponentType } from "react";

// Retry wrapper for lazy imports — handles stale chunks after idle periods
function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err) => {
      if (retries > 0 && String(err).includes('Failed to fetch dynamically imported module')) {
        // Cache-bust by appending timestamp to force fresh fetch
        return new Promise<{ default: T }>((resolve) => {
          setTimeout(() => resolve(lazyWithRetry(factory, retries - 1) as any), 500);
        });
      }
      throw err;
    }),
  );
}
import { supabase } from "@/integrations/supabase/client";
import { IdentityContext as IdentityCtx, SellerContext as SellerCtx } from "@/contexts/auth/contexts";

import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CartProvider } from "@/hooks/useCart";
import { BrowsingLocationProvider } from "@/contexts/BrowsingLocationContext";
import { OfflineBanner } from "@/components/network/OfflineBanner";
import { PushNotificationProvider } from "@/components/notifications/PushNotificationProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { GlobalHapticListener } from "@/components/haptics/GlobalHapticListener";
import { initializeMedianBridge } from "@/lib/median";
import { useDeepLinks } from "@/hooks/useDeepLinks";
import { useSecurityOfficer } from "@/hooks/useSecurityOfficer";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";
import { useBuyerOrderAlerts } from "@/hooks/useBuyerOrderAlerts";
import { useLiveActivityOrchestrator } from "@/hooks/useLiveActivityOrchestrator";
import { useReorderInterceptor } from "@/hooks/useReorderInterceptor";
import { useNewOrderAlert } from "@/hooks/useNewOrderAlert";
import { NewOrderAlertOverlay } from "@/components/seller/NewOrderAlertOverlay";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-loaded pages for code splitting
const AuthPage = lazyWithRetry(() => import("./pages/AuthPage"));
const ResetPasswordPage = lazyWithRetry(() => import("./pages/ResetPasswordPage"));
const HomePage = lazyWithRetry(() => import("./pages/HomePage"));
const LandingPage = lazyWithRetry(() => import("./pages/LandingPage"));
const WelcomeCarousel = lazyWithRetry(() => import("./pages/WelcomeCarousel"));
const RefundPolicyPage = lazyWithRetry(() => import("./pages/RefundPolicyPage"));
const SearchPage = lazyWithRetry(() => import("./pages/SearchPage"));

const SellerDetailPage = lazyWithRetry(() => import("./pages/SellerDetailPage"));
const CartPage = lazyWithRetry(() => import("./pages/CartPage"));
const OrdersPage = lazyWithRetry(() => import("./pages/OrdersPage"));
const OrderDetailPage = lazyWithRetry(() => import("./pages/OrderDetailPage"));
const ProfilePage = lazyWithRetry(() => import("./pages/ProfilePage"));
const ProfileEditPage = lazyWithRetry(() => import("./pages/ProfileEditPage"));
const FavoritesPage = lazyWithRetry(() => import("./pages/FavoritesPage"));
const BecomeSellerPage = lazyWithRetry(() => import("./pages/BecomeSellerPage"));
const SellerDashboardPage = lazyWithRetry(() => import("./pages/SellerDashboardPage"));
const SellerProductsPage = lazyWithRetry(() => import("./pages/SellerProductsPage"));
const SellerSettingsPage = lazyWithRetry(() => import("./pages/SellerSettingsPage"));
const SellerEarningsPage = lazyWithRetry(() => import("./pages/SellerEarningsPage"));
const AdminPage = lazyWithRetry(() => import("./pages/AdminPage"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const PrivacyPolicyPage = lazyWithRetry(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazyWithRetry(() => import("./pages/TermsPage"));
const CategoryGroupPage = lazyWithRetry(() => import("./pages/CategoryGroupPage"));
const CategoriesPage = lazyWithRetry(() => import("./pages/CategoriesPage"));
const PricingPage = lazyWithRetry(() => import("./pages/PricingPage"));
const HelpPage = lazyWithRetry(() => import("./pages/HelpPage"));
const NotificationsPage = lazyWithRetry(() => import("./pages/NotificationsPage"));
const CommunityRulesPage = lazyWithRetry(() => import("./pages/CommunityRulesPage"));
const PushDebugPage = lazyWithRetry(() => import("./pages/PushDebugPage"));
const LiveActivityDebugPage = lazyWithRetry(() => import("./pages/LiveActivityDebugPage"));
const BulletinPage = lazyWithRetry(() => import("./pages/BulletinPage"));
const MySubscriptionsPage = lazyWithRetry(() => import("./pages/MySubscriptionsPage"));
const TrustDirectoryPage = lazyWithRetry(() => import("./pages/TrustDirectoryPage"));
const DisputesPage = lazyWithRetry(() => import("./pages/DisputesPage"));
const SocietyFinancesPage = lazyWithRetry(() => import("./pages/SocietyFinancesPage"));
const SocietyProgressPage = lazyWithRetry(() => import("./pages/SocietyProgressPage"));
const SnagListPage = lazyWithRetry(() => import("./pages/SnagListPage"));
const SocietyDashboardPage = lazyWithRetry(() => import("./pages/SocietyDashboardPage"));
const NotificationInboxPage = lazyWithRetry(() => import("./pages/NotificationInboxPage"));
const MaintenancePage = lazyWithRetry(() => import("./pages/MaintenancePage"));
const SocietyReportPage = lazyWithRetry(() => import("./pages/SocietyReportPage"));
const SocietyAdminPage = lazyWithRetry(() => import("./pages/SocietyAdminPage"));
const BuilderDashboardPage = lazyWithRetry(() => import("./pages/BuilderDashboardPage"));
const BuilderAnalyticsPage = lazyWithRetry(() => import("./pages/BuilderAnalyticsPage"));
const VehicleParkingPage = lazyWithRetry(() => import("./pages/VehicleParkingPage"));
const VisitorManagementPage = lazyWithRetry(() => import("./pages/VisitorManagementPage"));
const PaymentMilestonesPage = lazyWithRetry(() => import("./pages/PaymentMilestonesPage"));
const InspectionChecklistPage = lazyWithRetry(() => import("./pages/InspectionChecklistPage"));

const WorkforceManagementPage = lazyWithRetry(() => import("./pages/WorkforceManagementPage"));
const ParcelManagementPage = lazyWithRetry(() => import("./pages/ParcelManagementPage"));
const GuardKioskPage = lazyWithRetry(() => import("./pages/GuardKioskPage"));
const GateEntryPage = lazyWithRetry(() => import("./pages/GateEntryPage"));

const SecurityAuditPage = lazyWithRetry(() => import("./pages/SecurityAuditPage"));
const WorkerJobsPage = lazyWithRetry(() => import("./pages/WorkerJobsPage"));
const WorkerMyJobsPage = lazyWithRetry(() => import("./pages/WorkerMyJobsPage"));
const WorkerHirePage = lazyWithRetry(() => import("./pages/WorkerHirePage"));
const CreateJobRequestPage = lazyWithRetry(() => import("./pages/CreateJobRequestPage"));
const SocietyNoticesPage = lazyWithRetry(() => import("./pages/SocietyNoticesPage"));
const SocietyDeliveriesPage = lazyWithRetry(() => import("./pages/SocietyDeliveriesPage"));
const DeliveryPartnerManagementPage = lazyWithRetry(() => import("./pages/DeliveryPartnerManagementPage"));
const DeliveryPartnerDashboardPage = lazyWithRetry(() => import("./pages/DeliveryPartnerDashboardPage"));
const WorkerAttendancePage = lazyWithRetry(() => import("./pages/WorkerAttendancePage"));
const MyWorkersPage = lazyWithRetry(() => import("./pages/MyWorkersPage"));
const WorkerLeavePage = lazyWithRetry(() => import("./pages/WorkerLeavePage"));
const WorkerSalaryPage = lazyWithRetry(() => import("./pages/WorkerSalaryPage"));
const AuthorizedPersonsPage = lazyWithRetry(() => import("./pages/AuthorizedPersonsPage"));
const BuilderInspectionsPage = lazyWithRetry(() => import("./pages/BuilderInspectionsPage"));
const TestResultsPage = lazyWithRetry(() => import("./pages/TestResultsPage"));
const CollectiveBuyPage = lazyWithRetry(() => import("./pages/CollectiveBuyPage"));
const ApiDocsPage = lazyWithRetry(() => import("./pages/ApiDocsPage"));
const DocumentationPage = lazyWithRetry(() => import("./pages/DocumentationPage"));

/**
 * Detect if an error is caused by an expired/invalid auth session.
 * Covers Supabase JWT errors, PostgREST 401s, and common auth error messages.
 */
function isAuthSessionError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const authPatterns = [
    'JWT expired', 'jwt expired', 'invalid claim', 'token is expired',
    'not authenticated', 'Invalid Refresh Token', 'Refresh Token Not Found',
    'Auth session missing', 'session_not_found',
  ];
  if (authPatterns.some(p => msg.toLowerCase().includes(p.toLowerCase()))) return true;
  if ((error as any)?.code === 'PGRST301') return true;
  if ((error as any)?.status === 401 || (error as any)?.status === 403) return true;
  return false;
}

let authRedirectScheduled = false;
function handleAuthError() {
  if (authRedirectScheduled) return;
  authRedirectScheduled = true;
  toast.error('Your session has expired. Please log in again.');
  supabase.auth.signOut().finally(() => {
    window.location.hash = '#/auth';
    setTimeout(() => { authRedirectScheduled = false; }, 3000);
  });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      console.error('[Query Error]', error);
      if (isAuthSessionError(error)) {
        handleAuthError();
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      console.error('[Mutation Error]', error);
      if (isAuthSessionError(error)) {
        handleAuthError();
        return;
      }
      const message = error instanceof Error ? error.message : 'Something went wrong';
      toast.error(message);
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (isAuthSessionError(error)) return false;
        return failureCount < 1;
      },
      staleTime: 10 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

function PageLoadingFallback() {
  return (
    <div className="min-h-[100dvh] bg-background p-4 space-y-4">
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Skeleton className="h-6 w-32 rounded-lg" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Skeleton className="h-6 w-32 rounded-lg" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SecurityRoute({ children }: { children: React.ReactNode }) {
  const { isSocietyAdmin, isAdmin, isLoading: authLoading } = useAuth();
  const { isSecurityOfficer, isLoading: officerLoading } = useSecurityOfficer();
  if (authLoading || officerLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Skeleton className="h-6 w-32 rounded-lg" />
      </div>
    );
  }
  if (!isSocietyAdmin && !isAdmin && !isSecurityOfficer) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function SocietyAdminRoute({ children }: { children: React.ReactNode }) {
  const { isSocietyAdmin, isAdmin, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Skeleton className="h-6 w-32 rounded-lg" /></div>;
  if (!isSocietyAdmin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function BuilderRoute({ children }: { children: React.ReactNode }) {
  const { isBuilderMember, isAdmin, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Skeleton className="h-6 w-32 rounded-lg" /></div>;
  if (!isBuilderMember && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ManagementRoute({ children }: { children: React.ReactNode }) {
  const { isSocietyAdmin, isBuilderMember, isAdmin, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Skeleton className="h-6 w-32 rounded-lg" /></div>;
  if (!isSocietyAdmin && !isBuilderMember && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SellerRoute({ children }: { children: React.ReactNode }) {
  const { hasSellerProfile, isAdmin, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Skeleton className="h-6 w-32 rounded-lg" /></div>;
  if (!hasSellerProfile && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function WorkerRoute({ children }: { children: React.ReactNode }) {
  const { roles, isAdmin, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Skeleton className="h-6 w-32 rounded-lg" /></div>;
  if (!roles.includes('worker') && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NavigationHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const cleanup = initializeMedianBridge(navigate);
    return cleanup;
  }, [navigate]);
  useDeepLinks();
  useAppLifecycle();
  return null;
}

function GlobalSellerAlert() {
  const identity = React.useContext(IdentityCtx);
  const seller = React.useContext(SellerCtx);
  const isSeller = seller?.isSeller ?? false;
  const currentSellerId = seller?.currentSellerId ?? null;
  const { pendingAlerts, dismiss, snooze } = useNewOrderAlert(isSeller ? currentSellerId : null);
  if (!identity) return null;
  return <NewOrderAlertOverlay orders={pendingAlerts} onDismiss={dismiss} onSnooze={snooze} />;
}

class SafeSellerAlert extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) { console.error('[SafeSellerAlert] Contained crash:', e); }
  render() { return this.state.failed ? null : this.props.children; }
}

function AppRoutes() {
  const { user, profile } = useAuth();
  useBuyerOrderAlerts();
  useLiveActivityOrchestrator();
  useReorderInterceptor();
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        <Route path="/welcome" element={user && profile ? <Navigate to="/" replace /> : <WelcomeCarousel />} />
        <Route path="/landing" element={user && profile ? <Navigate to="/" replace /> : <LandingPage />} />
        <Route path="/auth" element={user && profile ? <Navigate to="/" replace /> : <RouteErrorBoundary sectionName="Authentication"><AuthPage /></RouteErrorBoundary>} />
        <Route path="/reset-password" element={<RouteErrorBoundary sectionName="Reset Password"><ResetPasswordPage /></RouteErrorBoundary>} />
        <Route path="/" element={user ? <ProtectedRoute><HomePage /></ProtectedRoute> : <Navigate to="/landing" replace />} />
        <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="/community" element={<ProtectedRoute><BulletinPage /></ProtectedRoute>} />
        <Route path="/categories" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
        <Route path="/category/:category" element={<ProtectedRoute><CategoryGroupPage /></ProtectedRoute>} />
        <Route path="/seller/:id" element={<ProtectedRoute><SellerDetailPage /></ProtectedRoute>} />
        <Route path="/cart" element={<ProtectedRoute><RouteErrorBoundary sectionName="Cart"><CartPage /></RouteErrorBoundary></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
        <Route path="/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/profile/edit" element={<ProtectedRoute><ProfileEditPage /></ProtectedRoute>} />
        <Route path="/favorites" element={<ProtectedRoute><FavoritesPage /></ProtectedRoute>} />
        <Route path="/subscriptions" element={<ProtectedRoute><MySubscriptionsPage /></ProtectedRoute>} />
        <Route path="/directory" element={<ProtectedRoute><TrustDirectoryPage /></ProtectedRoute>} />
        <Route path="/disputes" element={<ProtectedRoute><DisputesPage /></ProtectedRoute>} />
        <Route path="/group-buys" element={<ProtectedRoute><CollectiveBuyPage /></ProtectedRoute>} />
        <Route path="/society/finances" element={<ProtectedRoute><RouteErrorBoundary sectionName="Society Finances"><SocietyFinancesPage /></RouteErrorBoundary></ProtectedRoute>} />
        <Route path="/society/progress" element={<ProtectedRoute><RouteErrorBoundary sectionName="Construction Progress"><SocietyProgressPage /></RouteErrorBoundary></ProtectedRoute>} />
        <Route path="/society/snags" element={<ProtectedRoute><RouteErrorBoundary sectionName="Snag List"><SnagListPage /></RouteErrorBoundary></ProtectedRoute>} />
        <Route path="/society" element={<ProtectedRoute><RouteErrorBoundary sectionName="Society Dashboard"><SocietyDashboardPage /></RouteErrorBoundary></ProtectedRoute>} />
        <Route path="/notifications/inbox" element={<ProtectedRoute><NotificationInboxPage /></ProtectedRoute>} />
        <Route path="/maintenance" element={<ProtectedRoute><RouteErrorBoundary sectionName="Maintenance"><MaintenancePage /></RouteErrorBoundary></ProtectedRoute>} />
        <Route path="/society/reports" element={<ProtectedRoute><RouteErrorBoundary sectionName="Society Reports"><SocietyReportPage /></RouteErrorBoundary></ProtectedRoute>} />
        <Route path="/society/admin" element={<ProtectedRoute><SocietyAdminRoute><RouteErrorBoundary sectionName="Society Admin"><SocietyAdminPage /></RouteErrorBoundary></SocietyAdminRoute></ProtectedRoute>} />
        <Route path="/builder" element={<ProtectedRoute><BuilderRoute><RouteErrorBoundary sectionName="Builder Dashboard"><BuilderDashboardPage /></RouteErrorBoundary></BuilderRoute></ProtectedRoute>} />
        <Route path="/builder/analytics" element={<ProtectedRoute><BuilderRoute><RouteErrorBoundary sectionName="Builder Analytics"><BuilderAnalyticsPage /></RouteErrorBoundary></BuilderRoute></ProtectedRoute>} />
        <Route path="/parking" element={<ProtectedRoute><VehicleParkingPage /></ProtectedRoute>} />
        <Route path="/visitors" element={<ProtectedRoute><VisitorManagementPage /></ProtectedRoute>} />
        <Route path="/payment-milestones" element={<ProtectedRoute><PaymentMilestonesPage /></ProtectedRoute>} />
        <Route path="/inspection" element={<ProtectedRoute><InspectionChecklistPage /></ProtectedRoute>} />
        <Route path="/domestic-help" element={<Navigate to="/workforce" replace />} />
        <Route path="/workforce" element={<ProtectedRoute><WorkforceManagementPage /></ProtectedRoute>} />
        <Route path="/parcels" element={<ProtectedRoute><ParcelManagementPage /></ProtectedRoute>} />
        <Route path="/guard-kiosk" element={<ProtectedRoute><SecurityRoute><GuardKioskPage /></SecurityRoute></ProtectedRoute>} />
        <Route path="/gate-entry" element={<ProtectedRoute><GateEntryPage /></ProtectedRoute>} />
        <Route path="/security/verify" element={<Navigate to="/guard-kiosk" replace />} />
        <Route path="/security/audit" element={<ProtectedRoute><SecurityRoute><SecurityAuditPage /></SecurityRoute></ProtectedRoute>} />
        <Route path="/worker/jobs" element={<ProtectedRoute><WorkerRoute><WorkerJobsPage /></WorkerRoute></ProtectedRoute>} />
        <Route path="/worker/my-jobs" element={<ProtectedRoute><WorkerRoute><WorkerMyJobsPage /></WorkerRoute></ProtectedRoute>} />
        <Route path="/worker-hire" element={<ProtectedRoute><WorkerHirePage /></ProtectedRoute>} />
        <Route path="/worker-hire/create" element={<ProtectedRoute><CreateJobRequestPage /></ProtectedRoute>} />
        <Route path="/society/notices" element={<ProtectedRoute><SocietyNoticesPage /></ProtectedRoute>} />
        <Route path="/society/deliveries" element={<ProtectedRoute><SocietyDeliveriesPage /></ProtectedRoute>} />
        <Route path="/delivery-partners" element={<ProtectedRoute><ManagementRoute><DeliveryPartnerManagementPage /></ManagementRoute></ProtectedRoute>} />
        <Route path="/my-deliveries" element={<ProtectedRoute><ManagementRoute><DeliveryPartnerDashboardPage /></ManagementRoute></ProtectedRoute>} />
        <Route path="/worker-attendance" element={<ProtectedRoute><ManagementRoute><WorkerAttendancePage /></ManagementRoute></ProtectedRoute>} />
        <Route path="/my-workers" element={<ProtectedRoute><MyWorkersPage /></ProtectedRoute>} />
        <Route path="/worker-leave" element={<ProtectedRoute><ManagementRoute><WorkerLeavePage /></ManagementRoute></ProtectedRoute>} />
        <Route path="/worker-salary" element={<ProtectedRoute><ManagementRoute><WorkerSalaryPage /></ManagementRoute></ProtectedRoute>} />
        <Route path="/authorized-persons" element={<ProtectedRoute><AuthorizedPersonsPage /></ProtectedRoute>} />
        <Route path="/builder-inspections" element={<ProtectedRoute><BuilderRoute><BuilderInspectionsPage /></BuilderRoute></ProtectedRoute>} />
        <Route path="/become-seller" element={<ProtectedRoute><RouteErrorBoundary sectionName="Seller Onboarding"><BecomeSellerPage /></RouteErrorBoundary></ProtectedRoute>} />
        <Route path="/seller" element={<ProtectedRoute><SellerRoute><RouteErrorBoundary sectionName="Seller Dashboard"><SellerDashboardPage /></RouteErrorBoundary></SellerRoute></ProtectedRoute>} />
        <Route path="/seller/products" element={<ProtectedRoute><SellerRoute><RouteErrorBoundary sectionName="Products"><SellerProductsPage /></RouteErrorBoundary></SellerRoute></ProtectedRoute>} />
        <Route path="/seller/settings" element={<ProtectedRoute><SellerRoute><RouteErrorBoundary sectionName="Seller Settings"><SellerSettingsPage /></RouteErrorBoundary></SellerRoute></ProtectedRoute>} />
        <Route path="/seller/earnings" element={<ProtectedRoute><SellerRoute><RouteErrorBoundary sectionName="Earnings"><SellerEarningsPage /></RouteErrorBoundary></SellerRoute></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/test-results" element={<ProtectedRoute><AdminRoute><TestResultsPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/api-docs" element={<ProtectedRoute><AdminRoute><ApiDocsPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/docs" element={<ProtectedRoute><DocumentationPage /></ProtectedRoute>} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
         <Route path="/community-rules" element={<CommunityRulesPage />} />
        <Route path="/push-debug" element={<ProtectedRoute><PushDebugPage /></ProtectedRoute>} />
        <Route path="/la-debug" element={<ProtectedRoute><LiveActivityDebugPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  useEffect(() => {
    const handler = () => queryClient.clear();
    window.addEventListener('app:clear-cache', handler);
    return () => window.removeEventListener('app:clear-cache', handler);
  }, []);

  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason?.message || String(reason || '');
      const benign = [
        'Failed to fetch', 'NetworkError', 'Load failed',
        'JWT expired', 'Auth session missing', 'session_not_found',
        'Invalid Refresh Token', 'AbortError', 'REALTIME',
        'not authenticated', 'AuthRetryableFetchError',
        'AuthSessionMissingError', 'AuthApiError',
      ];
      const isBenign = benign.some(p => msg.includes(p));
      console.error('[Unhandled Rejection]', reason);
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      console.error('[Unhandled Error]', event.error || event.message);
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <OfflineBanner />
            <Toaster />
            <Sonner />
            <HashRouter>
              <GlobalHapticListener />
              <AuthProvider>
                <NavigationHandler />
                <BrowsingLocationProvider>
                  <CartProvider>
                    <PushNotificationProvider>
                      <SafeSellerAlert><GlobalSellerAlert /></SafeSellerAlert>
                      <AppRoutes />
                    </PushNotificationProvider>
                  </CartProvider>
                </BrowsingLocationProvider>
              </AuthProvider>
            </HashRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
