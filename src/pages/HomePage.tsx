import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { OnboardingWalkthrough, useOnboarding } from '@/components/onboarding/OnboardingWalkthrough';

import { MarketplaceSection } from '@/components/home/MarketplaceSection';
import { ReorderLastOrder } from '@/components/home/ReorderLastOrder';
import { BuyAgainRow } from '@/components/home/BuyAgainRow';
import { SocietyQuickLinks } from '@/components/home/SocietyQuickLinks';

import { HomeSearchSuggestions } from '@/components/home/HomeSearchSuggestions';
import { CommunityTeaser } from '@/components/home/CommunityTeaser';
import { UpcomingAppointmentBanner } from '@/components/home/UpcomingAppointmentBanner';
import { HomeNotificationBanner } from '@/components/notifications/HomeNotificationBanner';
import { useAuth } from '@/contexts/AuthContext';

import { motion } from 'framer-motion';

export default function HomePage() {
  const { user, profile, isSeller, sellerProfiles, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { showOnboarding, hasChecked, completeOnboarding } = useOnboarding(user?.id);

  // Auto-redirect to profile edit if profile is incomplete
  useEffect(() => {
    if (profile) {
      const isIncomplete = !profile.name || profile.name === 'User';
      if (isIncomplete) {
        navigate('/profile/edit', { replace: true });
      }
    }
  }, [profile, navigate]);

  if (hasChecked && showOnboarding && profile) {
    return <OnboardingWalkthrough onComplete={completeOnboarding} />;
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
        {/* ═══ PROFILE COMPLETION BANNER ═══ */}
        {profile && (() => {
          const missing: string[] = [];
          if (!profile.name) missing.push('name');
          if (!profile.flat_number) missing.push('flat number');
          if (!profile.block) missing.push('block/tower');
          if (missing.length === 0) return null;
          const pct = Math.round(((3 - missing.length) / 3) * 100);
          const hint = `Add your ${missing[0]} to continue`;
          return (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mt-3 rounded-2xl bg-primary/5 border border-primary/15 p-3.5"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground">Profile {pct}% complete</p>
                <Link to="/profile/edit" className="text-xs font-bold text-primary shrink-0 hover:underline">Update</Link>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full bg-primary" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>
            </motion.div>
          );
        })()}

        {/* ═══ RICH NOTIFICATION BANNER ═══ */}
        <HomeNotificationBanner />

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
