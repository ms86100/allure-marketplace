import { useCallback, useEffect, useRef } from 'react';

/**
 * Analytics tracking hooks for ProductListingCard.
 * Fires lightweight events for impression, click, add, wishlist.
 * Replace the console.debug calls with your analytics provider (Mixpanel, Amplitude, etc.)
 */

interface CardEvent {
  productId: string;
  category: string;
  price: number;
  sellerId: string;
  layout: string;
}

function emit(event: string, data: CardEvent) {
  // Replace with real analytics SDK call
  if (typeof window !== 'undefined' && (window as any).__CARD_ANALYTICS_DEBUG__) {
    console.debug(`[analytics] ${event}`, data);
  }
  // Future: window.analytics?.track(event, data);
}

export function useCardAnalytics(product: CardEvent & { layout: string }) {
  const impressionFired = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const payload: CardEvent = {
    productId: product.productId,
    category: product.category,
    price: product.price,
    sellerId: product.sellerId,
    layout: product.layout,
  };

  // Intersection observer for impression tracking
  useEffect(() => {
    if (!ref.current || impressionFired.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionFired.current) {
          impressionFired.current = true;
          emit('card_impression', payload);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.productId]);

  const onCardClick = useCallback(() => {
    emit('card_click', payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.productId]);

  const onAddClick = useCallback(() => {
    emit('card_add', payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.productId]);

  const onWishlistClick = useCallback(() => {
    emit('card_wishlist', payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.productId]);

  return { ref, onCardClick, onAddClick, onWishlistClick };
}
