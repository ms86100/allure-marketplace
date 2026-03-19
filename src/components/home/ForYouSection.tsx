import { SmartSuggestionBanner } from '@/components/home/SmartSuggestionBanner';
import { ArrivalSuggestionCard } from '@/components/home/ArrivalSuggestionCard';
import { BuyAgainRow } from '@/components/home/BuyAgainRow';
import { UpcomingAppointmentBanner } from '@/components/home/UpcomingAppointmentBanner';

/**
 * Gap #18: Simplified ForYouSection — removed MutationObserver.
 * Each child returns null when empty, so we just render them.
 * The outer wrapper uses CSS-only spacing.
 */
export function ForYouSection() {
  return (
    <div className="mt-4 space-y-2 empty:hidden">
      <ArrivalSuggestionCard />
      <SmartSuggestionBanner />
      <div className="px-4">
        <UpcomingAppointmentBanner />
      </div>
      <BuyAgainRow />
    </div>
  );
}
