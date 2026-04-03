import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { resolveProducts, ResolvedProduct } from '@/lib/bannerProductResolver';
import { optimizedImageUrl, handleImageError } from '@/utils/imageHelpers';
import { cn } from '@/lib/utils';

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

export function FestivalBannerModule({ banner, sections }: FestivalBannerProps) {
  const navigate = useNavigate();
  const { user, effectiveSocietyId } = useAuth();
  const impressionTracked = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const animClass = animConfig.type && animConfig.type !== 'none'
    ? `banner-anim-${animConfig.type} banner-intensity-${animConfig.intensity || 'subtle'}`
    : '';

  // Intersection observer for entrance animation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
    queryKey: ['banner-peek', firstSection?.id],
    queryFn: () => resolveProducts({
      sourceType: firstSection.product_source_type as any,
      sourceValue: firstSection.product_source_value,
      sectionId: firstSection.id,
      fallbackMode: banner.fallback_mode as any,
      limit: 5,
    }),
    enabled: !!firstSection,
    staleTime: 5 * 60_000,
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
    <div
      ref={containerRef}
      className={cn(
        'mx-4 my-3 rounded-3xl overflow-hidden festival-banner-card',
        isVisible ? 'festival-banner-enter' : 'opacity-0'
      )}
    >
      {/* ── Themed Header with floating particles ── */}
      <div
        className={cn('relative px-5 pt-5 pb-7 overflow-hidden', animClass)}
        style={gradientStyle}
      >
        {/* Floating light orbs */}
        <div className="festival-orb festival-orb-1" />
        <div className="festival-orb festival-orb-2" />
        <div className="festival-orb festival-orb-3" />

        {/* Badge */}
        {banner.badge_text && (
          <span className={cn(
            'absolute top-3 right-3 text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/25 backdrop-blur-md z-10',
            isVisible ? 'festival-badge-pop' : 'opacity-0'
          )}
            style={{ backgroundColor: `${accentColor}40` }}
          >
            {banner.badge_text}
          </span>
        )}

        {/* Title with text reveal */}
        <h2 className={cn(
          'text-white font-extrabold text-xl leading-tight drop-shadow-md relative z-10',
          isVisible ? 'festival-text-reveal' : 'opacity-0'
        )}>
          {banner.title || 'Festival Special'}
        </h2>
        {banner.subtitle && (
          <p className={cn(
            'text-white/85 text-sm mt-1.5 max-w-[75%] relative z-10',
            isVisible ? 'festival-text-reveal festival-delay-1' : 'opacity-0'
          )}>
            {banner.subtitle}
          </p>
        )}

        {/* Product peek — floating circular avatars with stagger */}
        {peekProducts.length > 0 && (
          <div className="flex items-center gap-2.5 mt-4 relative z-10">
            {peekProducts.slice(0, 4).map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  'w-11 h-11 rounded-full overflow-hidden border-2 border-white/50 shadow-lg',
                  isVisible ? 'festival-peek-pop' : 'opacity-0 scale-0'
                )}
                style={{ animationDelay: `${400 + i * 120}ms` }}
              >
                <img
                  src={optimizedImageUrl(p.image_url || '', { width: 88, quality: 65 })}
                  alt="" className="w-full h-full object-cover"
                  onError={handleImageError}
                />
              </div>
            ))}
            <span className={cn(
              'text-white/70 text-xs font-semibold ml-0.5 tracking-wide',
              isVisible ? 'festival-text-reveal festival-delay-3' : 'opacity-0'
            )}>
              & more →
            </span>
          </div>
        )}
      </div>

      {/* ── Section Chips with gradient bleed ── */}
      <div className="px-4 py-4 rounded-b-3xl" style={chipsContainerStyle}>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {sections.map((section, index) => (
            <SectionChip
              key={section.id}
              section={section}
              bannerId={banner.id}
              fallbackMode={banner.fallback_mode}
              accentColor={accentColor}
              index={index}
              isVisible={isVisible}
              onClick={() => handleSectionClick(section)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionChip({
  section, bannerId, fallbackMode, accentColor, index, isVisible, onClick,
}: {
  section: BannerSection; bannerId: string; fallbackMode: string;
  accentColor: string; index: number; isVisible: boolean; onClick: () => void;
}) {
  const { data: previews = [] } = useQuery({
    queryKey: ['banner-section-preview', section.id],
    queryFn: () => resolveProducts({
      sourceType: section.product_source_type as any,
      sourceValue: section.product_source_value,
      sectionId: section.id,
      fallbackMode: fallbackMode as any,
      limit: 20,
    }),
    staleTime: 5 * 60_000,
  });

  if (previews.length === 0) return null;

  const displayPreviews = previews.slice(0, 3);

  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 w-[9.5rem] rounded-2xl border border-white/[0.06] p-3.5 flex flex-col items-center gap-2',
        'festival-chip hover:shadow-xl transition-all duration-300 active:scale-[0.96]',
        isVisible ? 'festival-chip-enter' : 'opacity-0 translate-y-4'
      )}
      style={{
        animationDelay: `${600 + index * 120}ms`,
        background: `linear-gradient(160deg, ${accentColor}0d, ${accentColor}05)`,
      }}
    >
      {/* Emoji with gentle bounce */}
      <span className="text-3xl festival-emoji-float" style={{ animationDelay: `${index * 200}ms` }}>
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
        {previews.length} item{previews.length !== 1 ? 's' : ''} →
      </span>
    </button>
  );
}
