import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function FeaturedBanners() {
  const { effectiveSocietyId } = useAuth();
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ['featured-banners', effectiveSocietyId],
    queryFn: async () => {
      let query = supabase
        .from('featured_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (effectiveSocietyId) {
        query = query.or(`society_id.eq.${effectiveSocietyId},society_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Auto-scroll
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Sync scroll position with activeIndex (programmatic scroll)
  useEffect(() => {
    const container = document.getElementById('banner-carousel');
    if (container && container.children[activeIndex]) {
      const child = container.children[activeIndex] as HTMLElement;
      child.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeIndex]);

  // Detect manual swipe: sync activeIndex from scroll position
  useEffect(() => {
    const container = document.getElementById('banner-carousel');
    if (!container || banners.length <= 1) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const centerX = containerRect.left + containerRect.width / 2;
        let closestIdx = 0;
        let closestDist = Infinity;
        Array.from(container.children).forEach((child, idx) => {
          const childRect = (child as HTMLElement).getBoundingClientRect();
          const childCenter = childRect.left + childRect.width / 2;
          const dist = Math.abs(childCenter - centerX);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = idx;
          }
        });
        setActiveIndex(closestIdx);
      }, 80);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [banners.length]);

  const scrollToIndex = useCallback((idx: number) => {
    setActiveIndex(idx);
  }, []);

  if (isLoading) {
    return (
      <div className="px-4 my-4">
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  }

  if (banners.length === 0) return null;

  return (
    <div className="my-4">
      <div
        id="banner-carousel"
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-1 snap-x snap-mandatory"
      >
        {banners.map((banner: any) => (
          <div
            key={banner.id}
            onClick={() => banner.link_url && navigate(banner.link_url)}
            className={cn(
              'shrink-0 w-[85vw] sm:w-[400px] rounded-3xl overflow-hidden cursor-pointer snap-center',
              'border border-border',
              'transition-all duration-200 hover:shadow-md active:scale-[0.99]'
            )}
          >
            {banner.image_url ? (
              <img
                src={banner.image_url}
                alt={banner.title || 'Featured'}
                className="w-full h-36 object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="w-full h-36 flex items-center justify-center p-6 bg-primary"
              >
                <h3 className="text-lg font-bold text-primary-foreground text-center">
                  {banner.title || 'Featured'}
                </h3>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
          {banners.map((_: any, idx: number) => (
            <button
              key={idx}
              onClick={() => scrollToIndex(idx)}
              aria-label={`Go to banner ${idx + 1}`}
              className={cn(
                'rounded-full transition-all duration-300 min-h-[24px] min-w-[24px] flex items-center justify-center',
              )}
            >
              <span className={cn(
                'rounded-full transition-all duration-300',
                idx === activeIndex
                  ? 'w-5 h-1.5 bg-primary'
                  : 'w-1.5 h-1.5 bg-border'
              )} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
