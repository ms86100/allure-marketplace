import { useEffect, useMemo, useRef } from 'react';
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
  const { user } = useAuth();
  const impressionTracked = useRef(false);

  const themeConfig = banner.theme_config || {};
  const animConfig = banner.animation_config || {};
  const gradient = themeConfig.gradient || [];
  const bgColor = themeConfig.bg || 'hsl(var(--primary))';
  const accentColor = gradient.length >= 1 ? gradient[gradient.length - 1] : bgColor;

  const gradientStyle = gradient.length >= 2
    ? { background: `linear-gradient(135deg, ${gradient.join(', ')})` }
    : { backgroundColor: bgColor };

  // Chips container gets a faded bleed from the banner gradient
  const chipsContainerStyle = gradient.length >= 1
    ? { background: `linear-gradient(to bottom, ${accentColor}15, transparent 60%)` }
    : {};

  const animClass = animConfig.type && animConfig.type !== 'none'
    ? `banner-anim-${animConfig.type} banner-intensity-${animConfig.intensity || 'subtle'}`
    : '';

  // Track impression once
  useEffect(() => {
    if (impressionTracked.current || !user) return;
    impressionTracked.current = true;
    supabase.from('banner_analytics').insert({
      banner_id: banner.id,
      event_type: 'impression',
      user_id: user.id,
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
      limit: 4,
    }),
    enabled: !!firstSection,
    staleTime: 5 * 60_000,
  });

  const handleSectionClick = (section: BannerSection) => {
    if (user) {
      supabase.from('banner_analytics').insert({
        banner_id: banner.id,
        section_id: section.id,
        event_type: 'section_click',
        user_id: user.id,
      }).then(() => {});
    }
    navigate(`/festival-collection/${banner.id}/${section.id}`);
  };

  return (
    <FestivalBannerInner
      banner={banner}
      sections={sections}
      gradientStyle={gradientStyle}
      chipsContainerStyle={chipsContainerStyle}
      accentColor={accentColor}
      animClass={animClass}
      peekProducts={peekProducts}
      onSectionClick={handleSectionClick}
    />
  );
}

/** Inner component that waits for all section data before deciding to render */
function FestivalBannerInner({
  banner,
  sections,
  gradientStyle,
  chipsContainerStyle,
  accentColor,
  animClass,
  peekProducts,
  onSectionClick,
}: {
  banner: any;
  sections: BannerSection[];
  gradientStyle: React.CSSProperties;
  chipsContainerStyle: React.CSSProperties;
  accentColor: string;
  animClass: string;
  peekProducts: ResolvedProduct[];
  onSectionClick: (s: BannerSection) => void;
}) {
  return (
    <div className="mx-4 my-3 rounded-3xl overflow-hidden shadow-lg animate-scale-in">
      {/* Themed Header */}
      <div
        className={cn('relative px-5 py-5 pb-6', animClass)}
        style={gradientStyle}
      >
        {banner.badge_text && (
          <span className="absolute top-3 right-3 bg-black/20 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/20">
            {banner.badge_text}
          </span>
        )}
        <h2 className="text-white font-extrabold text-xl leading-tight drop-shadow-sm">
          {banner.title || 'Festival Special'}
        </h2>
        {banner.subtitle && (
          <p className="text-white/80 text-sm mt-1 max-w-[75%]">
            {banner.subtitle}
          </p>
        )}

        {/* Product peek row */}
        {peekProducts.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            {peekProducts.slice(0, 4).map((p, i) => (
              <div
                key={p.id}
                className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/40 shadow-md"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <img
                  src={optimizedImageUrl(p.image_url || '', { width: 80, quality: 60 })}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={handleImageError}
                />
              </div>
            ))}
            <span className="text-white/70 text-xs font-medium ml-1">
              & more inside
            </span>
          </div>
        )}
      </div>

      {/* Section Chips — gradient bleed background */}
      <div
        className="px-4 py-4 rounded-b-3xl"
        style={chipsContainerStyle}
      >
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {sections.map((section, index) => (
            <SectionChip
              key={section.id}
              section={section}
              bannerId={banner.id}
              fallbackMode={banner.fallback_mode}
              accentColor={accentColor}
              index={index}
              onClick={() => onSectionClick(section)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionChip({
  section,
  bannerId,
  fallbackMode,
  accentColor,
  index,
  onClick,
}: {
  section: BannerSection;
  bannerId: string;
  fallbackMode: string;
  accentColor: string;
  index: number;
  onClick: () => void;
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

  // Always hide empty chips — no buyer should see an empty section
  if (previews.length === 0) return null;

  const displayPreviews = previews.slice(0, 3);

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-36 rounded-2xl border border-border/30 p-3 flex flex-col items-center gap-2 hover:shadow-lg transition-all active:scale-[0.97] animate-fade-in"
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: 'both',
        background: `linear-gradient(135deg, ${accentColor}08, ${accentColor}03)`,
      }}
    >
      {/* Emoji */}
      <span className="text-3xl">{section.icon_emoji || '📦'}</span>

      {/* Title */}
      <p className="text-xs font-bold text-foreground text-center leading-tight line-clamp-2">
        {section.title}
      </p>

      {/* Circular product thumbnails */}
      {displayPreviews.length > 0 && (
        <div className="flex items-center -space-x-1.5 mt-0.5">
          {displayPreviews.map((p) => (
            <img
              key={p.id}
              src={optimizedImageUrl(p.image_url || '', { width: 80, quality: 60 })}
              alt=""
              className="w-7 h-7 rounded-full object-cover border-2 border-background"
              onError={handleImageError}
            />
          ))}
        </div>
      )}

      {/* Item count pill */}
      <span
        className="text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-0.5"
        style={{
          backgroundColor: `${accentColor}18`,
          color: accentColor,
        }}
      >
        {previews.length} item{previews.length !== 1 ? 's' : ''} →
      </span>
    </button>
  );
}
