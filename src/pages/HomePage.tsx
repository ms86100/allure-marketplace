import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { WelcomeBackStrip } from '@/components/home/WelcomeBackStrip';
import { WhatsNewSection } from '@/components/home/WhatsNewSection';

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

  // IntersectionObserver for scroll-reveal sections
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    const sections = document.querySelectorAll('.reveal-on-scroll');
    sections.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [profile]);

  if (hasChecked && showOnboarding && profile) {
    return <OnboardingWalkthrough onComplete={completeOnboarding} />;
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="px-4 py-6 space-y-4">
          <div className="h-12 rounded-2xl bg-secondary animate-pulse" />
          <div className="h-32 rounded-2xl bg-secondary animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="aspect-square rounded-2xl bg-secondary animate-pulse" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="pb-6 space-y-0">
        {/* Active order tracking */}
        <ActiveOrderStrip />

        {/* Plan #15: Welcome back context when no active orders */}
        <WelcomeBackStrip />

        {/* Notification banner */}
        <HomeNotificationBanner />


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
          const hint = `Complete your profile so sellers can deliver to the right door`;
          return (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mt-5 rounded-2xl bg-card border border-border p-4 shadow-card"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-foreground">Profile {pct}% complete</p>
                <Link to="/profile/edit" className="text-xs font-bold text-primary shrink-0 hover:underline">Update</Link>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full bg-primary" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>
            </motion.div>
          );
        })()}

        {/* Personalized */}
        <div className="reveal-on-scroll">
          <ForYouSection />
        </div>

        {/* Recently viewed */}
        <div className="reveal-on-scroll">
          <RecentlyViewedRow />
        </div>

        {/* Plan #18: Dormant user re-engagement */}
        <div className="reveal-on-scroll">
          <WhatsNewSection />
        </div>

        {/* Society links */}
        <div className="reveal-on-scroll">
          <SocietyQuickLinks />
        </div>

        {/* Leaderboard */}
        <div className="mt-6 reveal-on-scroll">
          <SocietyLeaderboard />
        </div>

        {/* Community */}
        <div className="reveal-on-scroll">
          <CommunityTeaser />
        </div>
      </div>
    </AppLayout>
  );
}
