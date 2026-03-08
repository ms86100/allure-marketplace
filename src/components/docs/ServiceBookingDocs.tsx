import { DocHero, DocSection, DocSubSection, DocInfoCard, DocList, DocTable } from './DocPrimitives';
import { Calendar } from 'lucide-react';

export function ServiceBookingDocs() {
  return (
    <div>
      <DocHero
        icon={Calendar}
        title="Service Booking"
        subtitle="Time-slot selection, date ranges, booking confirmation, and category-driven booking flows."
      />

      <DocSection title="Booking Flow">
        <p>When a product's action type is "book" or "request_service", the BookingSheet component opens. The form fields are dynamically configured per category via the <code>category_config</code> table:</p>
        <DocList items={[
          'requires_time_slot — shows the TimeSlotPicker with available time slots',
          'has_date_range — shows a DateRangePicker for rental-type bookings (up to 90 days ahead)',
          'has_duration — shows a duration selector',
          'enquiry_only — converts the form into a simple enquiry/contact form',
        ]} />
      </DocSection>

      <DocSection title="Time Slot Picker">
        <p>Displays a calendar for date selection and a grid of time slots. Respects the seller's configured availability (availability_start, availability_end from seller_profiles). Unavailable dates can be blocked. Maximum booking window is 30 days ahead by default.</p>
        <DocInfoCard variant="tip" title="Seller Availability">
          Time slots are generated based on the seller's configured operating hours. The system automatically grays out past time slots for today's date.
        </DocInfoCard>
      </DocSection>

      <DocSection title="Date Range Picker">
        <p>Used for rental categories (e.g., equipment rental). Shows start and end date selection with price calculation (daily rate × number of days). Maximum 90-day range.</p>
      </DocSection>

      <DocSection title="Booking Confirmation">
        <p>After selecting date/time, the user confirms the booking. This creates an order with type "booking" or "rental" in the orders table. The seller receives a push notification and the order appears in their dashboard's Orders tab.</p>
      </DocSection>

      <DocSection title="Category Configuration">
        <DocTable
          headers={['Field', 'Purpose', 'Example']}
          rows={[
            ['requires_time_slot', 'Show time picker', 'Home cleaning, tutoring'],
            ['has_date_range', 'Show date range for rentals', 'Equipment rental'],
            ['has_duration', 'Show duration selector', 'Fitness classes'],
            ['enquiry_only', 'Simple contact form only', 'Interior design consultation'],
            ['requires_availability', 'Seller must set hours', 'All service categories'],
            ['lead_time_hours', 'Minimum hours before booking', '2 hours for food prep'],
          ]}
        />
      </DocSection>

      <DocSection title="Order Status Flow">
        <p>Service bookings follow a category-specific status flow defined in <code>category_status_flows</code>. Typical flow: pending → confirmed → in_progress → completed. Each status transition defines who can trigger it (buyer or seller) and whether it's terminal.</p>
      </DocSection>
    </div>
  );
}
