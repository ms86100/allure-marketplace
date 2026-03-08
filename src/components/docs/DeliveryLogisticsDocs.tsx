import { DocHero, DocSection, DocSubSection, DocStep, DocInfoCard, DocList, DocTable } from './DocPrimitives';
import { Truck } from 'lucide-react';

export function DeliveryLogisticsDocs() {
  return (
    <div>
      <DocHero
        icon={Truck}
        title="Delivery & Logistics"
        subtitle="Society delivery monitoring, partner dashboard, partner management, and parcel management."
      />

      <DocSection title="Society Deliveries (/society/deliveries)">
        <p>A monitoring dashboard for society administrators to track all active deliveries within the community. Feature-gated — only visible when the delivery feature is enabled for the society.</p>
        <DocList items={[
          'Live view of all in-progress deliveries',
          'Delivery status tracking: assigned → picked_up → at_gate → delivered',
          'Rider information and contact details',
          'ETA display with real-time updates',
          'Filter by status (active, completed, failed)',
        ]} />
      </DocSection>

      <DocSection title="Delivery Partner Dashboard (/my-deliveries)">
        <p>The delivery partner's mobile-first dashboard for managing assigned deliveries.</p>
        <DocSubSection title="Identification">
          <p>Partners are identified by phone number (delivery_partner_pool table). No separate login required — uses the same authenticated user account.</p>
        </DocSubSection>
        <DocSubSection title="Delivery Flow">
          <DocStep number={1} title="Accept">
            <p>View assigned delivery details (pickup location, drop-off, items). Accept or decline the assignment.</p>
          </DocStep>
          <DocStep number={2} title="Pickup">
            <p>Navigate to seller, confirm pickup. Status updates to "picked_up".</p>
          </DocStep>
          <DocStep number={3} title="At Gate">
            <p>Arrive at society gate, status updates to "at_gate". Security guard can verify via guard kiosk.</p>
          </DocStep>
          <DocStep number={4} title="Deliver">
            <p>Complete delivery with OTP verification from buyer. OTP stored as hash with attempt limits (max_otp_attempts). Status updates to "delivered".</p>
          </DocStep>
        </DocSubSection>

        <DocInfoCard variant="info" title="GPS Tracking">
          Active deliveries track the rider's GPS location (delivery_locations table) with latitude, longitude, accuracy, speed, and heading. Location updates are pushed in real-time to the buyer's order detail page.
        </DocInfoCard>
      </DocSection>

      <DocSection title="Partner Management (/delivery-partners)">
        <p>Admin/management interface for managing the delivery partner pool within a society.</p>
        <DocList items={[
          'Add new partners — name, phone, vehicle type, vehicle number, photo',
          'Activate/deactivate partners',
          'View delivery history and performance (total deliveries, rating)',
          'Set availability status (available/unavailable)',
          'Partners are stored in delivery_partner_pool table with society_id scope',
        ]} />
      </DocSection>

      <DocSection title="Parcel Management (/parcels)">
        <p>Track parcels and packages received at the society gate for residents.</p>
        <DocSubSection title="4-Status System">
          <DocTable
            headers={['Status', 'Description']}
            rows={[
              ['Received', 'Parcel received at gate by security'],
              ['Notified', 'Resident has been notified about the parcel'],
              ['Collected', 'Resident has picked up the parcel'],
              ['Returned', 'Parcel returned to sender or delivery partner'],
            ]}
          />
        </DocSubSection>
        <p>Tabs view for filtering by status. Security guards add new parcels via the guard kiosk; residents see their parcels and can mark as collected.</p>
      </DocSection>

      <DocSection title="Delivery Assignment System">
        <p>The <code>delivery_assignments</code> table manages the full lifecycle:</p>
        <DocList items={[
          'Idempotency key prevents duplicate assignments',
          'OTP-based delivery verification with hash storage and attempt limits',
          'Delivery fee, partner payout, and platform margin tracked per assignment',
          'Stall detection — stalled_notified flag triggers alerts if delivery is stuck',
          'External tracking ID support for third-party delivery integration',
          'Delivery tracking logs record every status change with location and timestamp',
        ]} />
      </DocSection>
    </div>
  );
}
