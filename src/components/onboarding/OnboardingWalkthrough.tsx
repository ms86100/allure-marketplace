import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ChevronRight, ShoppingBag, Users, MapPin, Shield, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSystemSettings } from '@/hooks/useSystemSettings';

export interface OnboardingSlide {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
}

interface OnboardingWalkthroughProps {
  onComplete: () => void;
  /** Override default slides for white-label customization */
  slides?: OnboardingSlide[];
}

const DEFAULT_SLIDES: OnboardingSlide[] = [
  {
    icon: Users,
    title: 'Community Marketplace',
    description: 'Buy and sell local goods and services exclusively within your verified residential community.',
    color: 'bg-primary/10 text-primary',
  },
  {
    icon: ShoppingBag,
    title: 'Easy Ordering',
    description: 'Browse sellers, add items to cart, and place orders with just a few taps. Pay via UPI or Cash on Delivery.',
    color: 'bg-success/10 text-success',
  },
  {
    icon: MapPin,
    title: 'Pickup or Delivery',
    description: 'Pick up from the seller\'s home or get it delivered to your doorstep. Track your order in real-time.',
    color: 'bg-info/10 text-info',
  },
  {
    icon: Shield,
    title: 'Trusted & Verified',
    description: 'All sellers are verified society residents. Rate and review after each order to help the community.',
    color: 'bg-warning/10 text-warning',
  },
];

// Icon name to component map for DB-driven slides
const ICON_MAP: Record<string, LucideIcon> = {
  Users, ShoppingBag, MapPin, Shield,
};

export function OnboardingWalkthrough({ onComplete, slides: customSlides }: OnboardingWalkthroughProps) {
  const settings = useSystemSettings();

  // E3: Parse DB-driven slides from landingSlidesJson if available
  const dbSlides = useMemo<OnboardingSlide[] | null>(() => {
    if (!settings.landingSlidesJson) return null;
    try {
      const parsed = JSON.parse(settings.landingSlidesJson);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return parsed.map((s: any) => ({
        icon: ICON_MAP[s.icon] || Users,
        title: s.title || '',
        description: s.description || '',
        color: s.color || 'bg-primary/10 text-primary',
      }));
    } catch {
      return null;
    }
  }, [settings.landingSlidesJson]);

  const slides = customSlides || dbSlides || DEFAULT_SLIDES;
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX < 0) handleNext();
      else handlePrev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [currentSlide, slides.length]);

  const slide = slides[currentSlide];
  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Skip button */}
      <div className="flex justify-end p-4 safe-top">
        <Button variant="ghost" size="sm" onClick={handleSkip}>
          Skip
          <X size={16} className="ml-1" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className={cn('w-24 h-24 rounded-3xl flex items-center justify-center mb-8', slide.color)}>
          <Icon size={48} />
        </div>
        <h1 className="text-2xl font-bold text-center mb-4">{slide.title}</h1>
        <p className="text-center text-muted-foreground max-w-xs">{slide.description}</p>
      </div>

      {/* Navigation */}
      <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
        {/* Dots */}
        <div className="flex justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={cn(
                'h-2 rounded-full transition-all min-w-[8px]',
                index === currentSlide ? 'w-6 bg-primary' : 'w-2 bg-muted'
              )}
            />
          ))}
        </div>

        {/* Button */}
        <Button className="w-full" size="lg" onClick={handleNext}>
          {currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
          <ChevronRight size={18} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}

// Hook to manage onboarding state — persisted in DB via profiles.has_seen_onboarding
export function useOnboarding(userId?: string | null) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHasChecked(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('has_seen_onboarding')
        .eq('id', userId)
        .single();

      if (cancelled) return;

      if (data && !data.has_seen_onboarding) {
        setShowOnboarding(true);
      }
      setHasChecked(true);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    if (userId) {
      supabase
        .from('profiles')
        .update({ has_seen_onboarding: true })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.error('[Onboarding] Failed to persist completion:', error);
        });
    }
  }, [userId]);

  const resetOnboarding = useCallback(() => {
    setShowOnboarding(true);
    if (userId) {
      supabase
        .from('profiles')
        .update({ has_seen_onboarding: false })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.error('[Onboarding] Failed to reset:', error);
        });
    }
  }, [userId]);

  return { showOnboarding, hasChecked, completeOnboarding, resetOnboarding };
}
