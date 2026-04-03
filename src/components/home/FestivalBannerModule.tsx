import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveProducts, ResolvedProduct } from '@/lib/bannerProductResolver';
import { optimizedImageUrl, handleImageError } from '@/utils/imageHelpers';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

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
  const impressionTracked = useRef(false);

  const themeConfig = banner.theme_config || {};
  const animConfig = banner.animation_config || {};
  const gradient = themeConfig.gradient || [];
  const bgColor = themeConfig.bg || 'hsl(var(--primary))';

  const gradientStyle = gradient.length >= 2
    ? { background: `linear-gradient(135deg, ${gradient.join(', ')})` }
    : { backgroundColor: bgColor };

  const animClass = animConfig.type && animConfig.type !== 'none'
    ? `banner-anim-${animConfig.type} banner-intensity-${animConfig.intensity || 'subtle'}`
    : '';

  // Track impression once
  useEffect(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;
    supabase.from('banner_analytics').insert({
      banner_id: banner.id,
      event_type: 'impression',
      user_id: null,
    }).then(() => {});
  }, [banner.id]);

  const handleSectionClick = (section: BannerSection) => {
    // Fire analytics (fire-and-forget)
    supabase.from('banner_analytics').insert({
      banner_id: banner.id,
      section_id: section.id,
      event_type: 'section_click',
      user_id: null,
    }).then(() => {});

    navigate(`/festival-collection/${banner.id}/${section.id}`);
  };

  return (
    <div className="mx-4 my-3 rounded-3xl overflow-hidden shadow-lg">
      {/* Themed Header */}
      <div
        className={cn('relative px-4 py-5', animClass)}
        style={gradientStyle}
      >
        {banner.badge_text && (
          <span className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
            {banner.badge_text}
          </span>
        )}
        <h2 className="text-white font-extrabold text-lg leading-tight">
          {banner.title || 'Festival Special'}
        </h2>
        {banner.subtitle && (
          <p className="text-white/80 text-xs mt-1 max-w-[80%]">
            {banner.subtitle}
          </p>
        )}
      </div>

      {/* Section Chips */}
      <div className="bg-card px-3 py-3">
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
          {sections.map((section) => (
            <SectionChip
              key={section.id}
              section={section}
              bannerId={banner.id}
              fallbackMode={banner.fallback_mode}
              onClick={() => handleSectionClick(section)}
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
  onClick,
}: {
  section: BannerSection;
  bannerId: string;
  fallbackMode: string;
  onClick: () => void;
}) {
  // Fetch products for thumbnail preview + count
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

  // Hide section if no products and fallback is 'hide'
  if (previews.length === 0 && fallbackMode === 'hide') return null;

  const displayPreviews = previews.slice(0, 3);
  const moreCount = previews.length > 3 ? previews.length - 3 : 0;

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-28 rounded-2xl border border-border/50 bg-card p-2.5 flex flex-col items-center gap-1.5 hover:shadow-md transition-all active:scale-[0.97]"
    >
      {/* Emoji */}
      <span className="text-2xl">{section.icon_emoji || '📦'}</span>

      {/* Title */}
      <p className="text-[11px] font-bold text-foreground text-center leading-tight line-clamp-2">
        {section.title}
      </p>

      {/* Product thumbnails */}
      {displayPreviews.length > 0 && (
        <div className="flex items-center gap-0.5 mt-0.5">
          {displayPreviews.map((p) => (
            <img
              key={p.id}
              src={optimizedImageUrl(p.image_url || '', { width: 80, quality: 60 })}
              alt=""
              className="w-6 h-6 rounded-md object-cover border border-border/30"
              onError={handleImageError}
            />
          ))}
          {moreCount > 0 && (
            <span className="text-[9px] text-muted-foreground font-semibold ml-0.5">
              +{moreCount}
            </span>
          )}
        </div>
      )}

      {/* Arrow hint */}
      <ChevronRight size={12} className="text-muted-foreground" />
    </button>
  );
}
