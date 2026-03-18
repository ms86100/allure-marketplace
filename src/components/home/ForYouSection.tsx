import { useRef, useLayoutEffect, useState, ReactNode } from 'react';
import { SmartSuggestionBanner } from '@/components/home/SmartSuggestionBanner';
import { ArrivalSuggestionCard } from '@/components/home/ArrivalSuggestionCard';
import { ReorderLastOrder } from '@/components/home/ReorderLastOrder';
import { BuyAgainRow } from '@/components/home/BuyAgainRow';
import { UpcomingAppointmentBanner } from '@/components/home/UpcomingAppointmentBanner';

/**
 * Wraps conditional personalization sections into a single container.
 * Only renders the outer wrapper if at least one child has content.
 * Prevents scattered empty gaps when most sections are conditional.
 */
export function ForYouSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasContent, setHasContent] = useState(true);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    // Check if any child rendered meaningful content (not just empty divs)
    const observer = new MutationObserver(() => {
      const childNodes = containerRef.current?.children;
      if (!childNodes) return;
      let hasVisible = false;
      for (let i = 0; i < childNodes.length; i++) {
        const el = childNodes[i] as HTMLElement;
        if (el.offsetHeight > 0 && el.innerHTML.trim().length > 0) {
          hasVisible = true;
          break;
        }
      }
      setHasContent(hasVisible);
    });

    observer.observe(containerRef.current, { childList: true, subtree: true });

    // Initial check
    const timer = setTimeout(() => {
      const childNodes = containerRef.current?.children;
      if (!childNodes) return;
      let hasVisible = false;
      for (let i = 0; i < childNodes.length; i++) {
        const el = childNodes[i] as HTMLElement;
        if (el.offsetHeight > 0 && el.innerHTML.trim().length > 0) {
          hasVisible = true;
          break;
        }
      }
      setHasContent(hasVisible);
    }, 100);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={containerRef} className={hasContent ? 'mt-4 space-y-2' : 'hidden'}>
      <ArrivalSuggestionCard />
      <SmartSuggestionBanner />
      <div className="px-4">
        <UpcomingAppointmentBanner />
      </div>
      <ReorderLastOrder />
      <BuyAgainRow />
    </div>
  );
}
