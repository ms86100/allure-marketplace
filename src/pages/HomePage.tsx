import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { OnboardingWalkthrough, useOnboarding } from '@/components/onboarding/OnboardingWalkthrough';
import { VerificationPendingScreen } from '@/components/onboarding/VerificationPendingScreen';
import { MarketplaceSection } from '@/components/home/MarketplaceSection';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveFeatures } from '@/hooks/useEffectiveFeatures';
import { Shield, ChevronRight, Store } from 'lucide-react';

export default function HomePage() {
  const { user, profile, isApproved, isSeller } = useAuth();
  const { showOnboarding, hasChecked, completeOnboarding } = useOnboarding();
  const { isFeatureEnabled } = useEffectiveFeatures();

  if (hasChecked && showOnboarding && isApproved) {
    return <OnboardingWalkthrough onComplete={completeOnboarding} />;
  }

  if (!isApproved && profile) {
    return <VerificationPendingScreen />;
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-primary text-xl font-bold">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="pb-4">
        {/* Gate Entry Button */}
        {isFeatureEnabled('resident_identity_verification') && (
          <div className="px-4 pt-4">
            <Link to="/gate-entry">
              <div className="glass-card p-4 flex items-center gap-4 transition-all hover:shadow-lg active:scale-[0.98]">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
                  <Shield className="text-primary-foreground" size={22} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-foreground">Gate Entry</h4>
                  <p className="text-xs text-muted-foreground">Show QR code to security</p>
                </div>
                <ChevronRight className="text-muted-foreground" size={20} />
              </div>
            </Link>
          </div>
        )}

        {/* ═══ UNIFIED MARKETPLACE ═══ */}
        <MarketplaceSection />

        {/* Become a Seller CTA */}
        {!isSeller && (
          <div className="mx-4 mt-6">
            <Link to="/become-seller">
              <div className="glass-card p-4 flex items-center gap-4 transition-all hover:shadow-lg active:scale-[0.98]" style={{ background: 'var(--gradient-success)', border: 'none' }}>
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Store className="text-primary-foreground" size={22} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-primary-foreground">Start Selling</h4>
                  <p className="text-xs text-primary-foreground/80">
                    Share your homemade food with neighbors
                  </p>
                </div>
                <ChevronRight className="text-primary-foreground/70" size={20} />
              </div>
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
