import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { OnboardingWalkthrough, useOnboarding } from '@/components/onboarding/OnboardingWalkthrough';
import { VerificationPendingScreen } from '@/components/onboarding/VerificationPendingScreen';
import { MarketplaceSection } from '@/components/home/MarketplaceSection';
import { ReorderLastOrder } from '@/components/home/ReorderLastOrder';
import { BuyAgainRow } from '@/components/home/BuyAgainRow';
import { SocietyQuickLinks } from '@/components/home/SocietyQuickLinks';

import { HomeSearchSuggestions } from '@/components/home/HomeSearchSuggestions';
import { CommunityTeaser } from '@/components/home/CommunityTeaser';
import { UpcomingAppointmentBanner } from '@/components/home/UpcomingAppointmentBanner';
import { useAuth } from '@/contexts/AuthContext';
import { AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HomePage() {
  const { user, profile, isApproved, isSeller, sellerProfiles, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { showOnboarding, hasChecked, completeOnboarding } = useOnboarding(user?.id);

  if (hasChecked && showOnboarding && isApproved) {
    return <OnboardingWalkthrough onComplete={completeOnboarding} />;
  }

  if (!isApproved && profile) {
    return <VerificationPendingScreen />;
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="px-4 py-6 space-y-5">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-24 h-9 rounded-full bg-muted animate-pulse shrink-0" />
            ))}
          </div>
          <div className="h-36 rounded-2xl bg-muted animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="aspect-[3/2] rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="pb-6">
        {/* ═══ INCOMPLETE PROFILE BANNER ═══ */}
        {profile && !profile.flat_number && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-destructive/5 border border-destructive/15 p-3.5"
          >
            <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertCircle size={16} className="text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Complete your profile to enable delivery orders.</p>
            </div>
            <Link to="/profile" className="text-xs font-bold text-primary shrink-0 hover:underline">Update</Link>
          </motion.div>
        )}

        {/* ═══ DISCOVER ═══ */}
        <HomeSearchSuggestions />
        <div className="px-4 mt-3">
          <UpcomingAppointmentBanner />
        </div>

        {/* ═══ YOUR ORDERS ═══ */}
        <ReorderLastOrder />
        <BuyAgainRow />

        {/* ═══ COMMUNITY ═══ */}
        <SocietyQuickLinks />

        {/* ═══ MARKETPLACE & COMMUNITY ═══ */}
        <MarketplaceSection />
        <CommunityTeaser />
      </div>
    </AppLayout>
  );
}
