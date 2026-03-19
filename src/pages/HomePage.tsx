import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { OnboardingWalkthrough, useOnboarding } from '@/components/onboarding/OnboardingWalkthrough';

import { MarketplaceSection } from '@/components/home/MarketplaceSection';
import { SocietyQuickLinks } from '@/components/home/SocietyQuickLinks';

import { CommunityTeaser } from '@/components/home/CommunityTeaser';
import { HomeNotificationBanner } from '@/components/notifications/HomeNotificationBanner';
import { ActiveOrderStrip } from '@/components/home/ActiveOrderStrip';
import { ForYouSection } from '@/components/home/ForYouSection';
import { SocietyLeaderboard } from '@/components/home/SocietyLeaderboard';
import { RecentlyViewedRow } from '@/components/home/RecentlyViewedRow';
import { ReorderLastOrder } from '@/components/home/ReorderLastOrder';
import { useAuth } from '@/contexts/AuthContext';

import { motion } from 'framer-motion';

export default function HomePage() {
  const { user, profile, isSeller, sellerProfiles, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { showOnboarding, hasChecked, completeOnboarding } = useOnboarding(user?.id);

  const scrollKey = 'home-scroll-y';
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (profile) {
      const isIncomplete = !profile.name || profile.name === 'User';
      if (isIncomplete) {
        navigate('/profile/edit', { replace: true });
      }
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (!hasRestoredRef.current && profile) {
      const saved = sessionStorage.getItem(scrollKey);
      if (saved) {
        requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
      }
      hasRestoredRef.current = true;
    }
    return () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
  }, [profile]);

  if (hasChecked && showOnboarding && profile) {
    return <OnboardingWalkthrough onComplete={completeOnboarding} />;
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="px-4 py-6 space-y-4">
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
          <div className="h-28 rounded-xl bg-muted animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="pb-4">
        {/* Active order tracking */}
        <ActiveOrderStrip />

        {/* Notification banner */}
        <HomeNotificationBanner />

        {/* Quick reorder */}
        <ReorderLastOrder />

        {/* ═══ MARKETPLACE — primary shopping surface ═══ */}
        <MarketplaceSection />

        {/* Profile completion — below marketplace */}
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
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mt-4 rounded-xl bg-secondary border border-border p-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-semibold text-foreground">Profile {pct}% complete</p>
                <Link to="/profile/edit" className="text-[11px] font-bold text-primary shrink-0 hover:underline">Update</Link>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full bg-primary" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
            </motion.div>
          );
        })()}

        {/* Personalized */}
        <ForYouSection />

        {/* Recently viewed */}
        <RecentlyViewedRow />

        {/* Society links */}
        <SocietyQuickLinks />

        {/* Leaderboard */}
        <div className="mt-4">
          <SocietyLeaderboard />
        </div>

        {/* Community */}
        <CommunityTeaser />
      </div>
    </AppLayout>
  );
}