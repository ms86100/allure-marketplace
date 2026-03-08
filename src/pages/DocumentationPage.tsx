import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocsSidebar, DocsSidebarMobile, type DocModule } from '@/components/docs/DocsSidebar';
import { AuthOnboardingDocs } from '@/components/docs/AuthOnboardingDocs';
import { HomeDiscoveryDocs } from '@/components/docs/HomeDiscoveryDocs';
import { MarketplaceShoppingDocs } from '@/components/docs/MarketplaceShoppingDocs';
import { ServiceBookingDocs } from '@/components/docs/ServiceBookingDocs';
import { SellerToolsDocs } from '@/components/docs/SellerToolsDocs';
import { DeliveryLogisticsDocs } from '@/components/docs/DeliveryLogisticsDocs';
import { AdminCommunityDocs } from '@/components/docs/AdminCommunityDocs';
import { useIsMobile } from '@/hooks/use-mobile';

const moduleComponents: Record<DocModule, React.FC> = {
  'auth-onboarding': AuthOnboardingDocs,
  'home-discovery': HomeDiscoveryDocs,
  'marketplace-shopping': MarketplaceShoppingDocs,
  'service-booking': ServiceBookingDocs,
  'seller-tools': SellerToolsDocs,
  'delivery-logistics': DeliveryLogisticsDocs,
  'admin-community': AdminCommunityDocs,
};

export default function DocumentationPage() {
  const [activeModule, setActiveModule] = useState<DocModule>('auth-onboarding');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const ActiveContent = moduleComponents[activeModule];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-primary" />
          <h1 className="text-lg font-bold">Platform Documentation</h1>
        </div>
      </header>

      {isMobile ? (
        /* Mobile: dropdown nav + content */
        <div className="px-4 py-4">
          <DocsSidebarMobile activeModule={activeModule} onModuleChange={setActiveModule} />
          <div className="bg-card border border-border rounded-xl p-4">
            <ActiveContent />
          </div>
        </div>
      ) : (
        /* Desktop: sidebar + content */
        <div className="flex max-w-7xl mx-auto">
          <aside className="w-64 shrink-0 border-r border-border p-4 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto">
            <DocsSidebar activeModule={activeModule} onModuleChange={setActiveModule} />
          </aside>
          <main className="flex-1 p-6 max-w-4xl overflow-y-auto">
            <ActiveContent />
          </main>
        </div>
      )}
    </div>
  );
}
