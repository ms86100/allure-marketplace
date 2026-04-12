// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { resolveProducts, ResolvedProduct } from '@/lib/bannerProductResolver';
import { optimizedImageUrl, handleImageError } from '@/utils/imageHelpers';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import {
  staggerContainer, staggerContainerSlow, cardEntrance, glassFadeIn,
  fadeSlideUp, scalePress, badgePop, scaleIn, easings, durations,
} from '@/lib/motion-variants';

interface BannerSection {
  id: string;
  title: string;
  subtitle: string | null;
  icon_emoji: string | null;
  display_order: number;
  product_source_type: string;
  product_source_value: string | null;
}

interface FestivalBannerProps {
  banner: any;
  sections: BannerSection[];
}

// Framer Motion variants for festival-specific animations
const bannerEntrance = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 24, staggerChildren: 0.1 },
  },
};

const textReveal = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const peekPop = {
  hidden: { opacity: 0, scale: 0, rotate: -15 },
  show: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 300, damping: 12 } },
};

const chipEntrance = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

export function FestivalBannerModule({ banner, sections }: FestivalBannerProps) {
  const navigate = useNavigate();
  const { user, effectiveSocietyId } = useAuth();
  const impressionTracked = useRef(false);

  const themeConfig = banner.theme_config || {};
  const animConfig = banner.animation_config || {};
  const gradient = themeConfig.gradient || [];
  const bgColor = themeConfig.bg || 'hsl(var(--primary))';
  const accentColor = gradient.length >= 1 ? gradient[gradient.length - 1] : bgColor;

  const gradientStyle = gradient.length >= 2
    ? { background: `linear-gradient(135deg, ${gradient.join(', ')})` }
    : { backgroundColor: bgColor };

  const chipsContainerStyle = gradient.length >= 1
    ? { background: `linear-gradient(to bottom, ${accentColor}12, transparent 80%)` }
    : {};

  // Keep CSS overlay animations (sparkle, glow, shimmer, confetti, pulse) — GPU efficient
  const animClass = animConfig.type && animConfig.type !== 'none'
    ? `banner-anim-${animConfig.type} banner-intensity-${animConfig.intensity || 'subtle'}`
    : '';

  // Track impression once
  useEffect(() => {
    if (impressionTracked.current || !user) return;
    impressionTracked.current = true;
    supabase.from('banner_analytics').insert({
      banner_id: banner.id, event_type: 'impression', user_id: user.id,
    }).then(() => {});
  }, [banner.id, user]);

  // Fetch products from first section for header peek
  const firstSection = sections[0];
  const { data: peekProducts = [] } = useQuery({
    queryKey: ['banner-peek', firstSection?.id, effectiveSocietyId],
    queryFn: () => resolveProducts({
      sourceType: firstSection.product_source_type as any,
      sourceValue: firstSection.product_source_value,
      sectionId: firstSection.id,
      fallbackMode: banner.fallback_mode as any,
      limit: 5,
      societyId: effectiveSocietyId || undefined,
      bannerId: banner.id,
    }),
    enabled: !!firstSection,
    staleTime: 60_000,
  });

  const handleSectionClick = (section: BannerSection) => {
    if (user) {
      supabase.from('banner_analytics').insert({
        banner_id: banner.id, section_id: section.id,
        event_type: 'section_click', user_id: user.id,
      }).then(() => {});
    }
    navigate(`/festival-collection/${banner.id}/${section.id}`);
  };

  return (
    <motion.div
      variants={bannerEntrance}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      className="mx-4 my-3 rounded-3xl overflow-hidden festival-banner-card"
    >
      {/* ── Themed Header with floating particles ── */}
      <div
        className={cn('relative px-5 pt-5 pb-7 overflow-hidden', animClass)}
        style={gradientStyle}
      >
        {/* Floating light orbs — kept as CSS for GPU efficiency */}
        <div className="festival-orb festival-orb-1" />
        <div className="festival-orb festival-orb-2" />
        <div className="festival-orb festival-orb-3" />

        {/* Badge */}
        {banner.badge_text && (
          <motion.span
            variants={badgePop}
            className="absolute top-3 right-3 text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/25 backdrop-blur-md z-10"
            style={{ backgroundColor: `${accentColor}40` }}
          >
            {banner.badge_text}
          </motion.span>
        )}

        {/* Title with text reveal */}
        <motion.h2
          variants={textReveal}
          className="text-white font-extrabold text-xl leading-tight drop-shadow-md relative z-10"
        >
          {banner.title || 'Festival Special'}
        </motion.h2>
        {banner.subtitle && (
          <motion.p
            variants={textReveal}
            className="text-white/85 text-sm mt-1.5 max-w-[75%] relative z-10"
          >
            {banner.subtitle}
          </motion.p>
        )}

        {/* Product peek — floating circular avatars with stagger */}
        {peekProducts.length > 0 && (
          <motion.div
            variants={staggerContainer}
            className="flex items-center gap-2.5 mt-4 relative z-10"
          >
            {peekProducts.slice(0, 4).map((p) => (
              <motion.div
                key={p.id}
                variants={peekPop}
                className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/50 shadow-lg"
              >
                <img
                  src={optimizedImageUrl(p.image_url || '', { width: 88, quality: 65 })}
                  alt="" className="w-full h-full object-cover"
                  onError={handleImageError}
                />
              </motion.div>
            ))}
            <motion.span
              variants={textReveal}
              className="text-white/70 text-xs font-semibold ml-0.5 tracking-wide"
            >
              & more →
            </motion.span>
          </motion.div>
        )}
      </div>

      {/* ── Section Chips with gradient bleed ── */}
      <div className="px-4 py-4 rounded-b-3xl" style={chipsContainerStyle}>
        <motion.div
          variants={staggerContainerSlow}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="flex gap-3 overflow-x-auto scrollbar-hide pb-1"
        >
          {sections.map((section) => (
            <SectionChip
              key={section.id}
              section={section}
              bannerId={banner.id}
              fallbackMode={banner.fallback_mode}
              accentColor={accentColor}
              onClick={() => handleSectionClick(section)}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}

function SectionChip({
  section, bannerId, fallbackMode, accentColor, onClick,
}: {
  section: BannerSection; bannerId: string; fallbackMode: string;
  accentColor: string; onClick: () => void;
}) {
  const { effectiveSocietyId } = useAuth();
  const { data: previews = [] } = useQuery({
    queryKey: ['banner-section-preview', section.id, effectiveSocietyId],
    queryFn: () => resolveProducts({
      sourceType: section.product_source_type as any,
      sourceValue: section.product_source_value,
      sectionId: section.id,
      fallbackMode: fallbackMode as any,
      limit: 20,
      societyId: effectiveSocietyId || undefined,
      bannerId: bannerId,
    }),
    staleTime: 60_000,
  });

  const displayPreviews = previews.slice(0, 3);

  return (
    <motion.button
      variants={chipEntrance}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn(
        'shrink-0 w-[9.5rem] rounded-2xl border border-white/[0.06] p-3.5 flex flex-col items-center gap-2',
        'festival-chip transition-shadow duration-300',
      )}
      style={{
        background: `linear-gradient(160deg, ${accentColor}0d, ${accentColor}05)`,
      }}
    >
      {/* Emoji */}
      <span className="text-3xl festival-emoji-float">
        {section.icon_emoji || '📦'}
      </span>

      {/* Title */}
      <p className="text-xs font-bold text-foreground text-center leading-tight line-clamp-2">
        {section.title}
      </p>

      {/* Overlapping circular thumbnails */}
      {displayPreviews.length > 0 && (
        <div className="flex items-center -space-x-2 mt-0.5">
          {displayPreviews.map((p, i) => (
            <img
              key={p.id}
              src={optimizedImageUrl(p.image_url || '', { width: 80, quality: 60 })}
              alt=""
              className="w-8 h-8 rounded-full object-cover border-2 border-background shadow-sm"
              style={{ zIndex: 3 - i }}
              onError={handleImageError}
            />
          ))}
        </div>
      )}

      {/* Item count pill */}
      <span
        className="text-[10px] font-bold px-3 py-[3px] rounded-full tracking-wide"
        style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
      >
        {previews.length === 0 ? 'Coming soon' : `${previews.length} item${previews.length !== 1 ? 's' : ''} →`}
      </span>
    </motion.button>
  );
}
