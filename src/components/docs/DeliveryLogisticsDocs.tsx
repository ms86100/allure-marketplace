import { DocHero, DocSection, DocSubSection, DocStep, DocInfoCard, DocList, DocTable } from './DocPrimitives';
import { Truck } from 'lucide-react';

export function DeliveryLogisticsDocs() {
  return (
    <div>
      <DocHero
        icon={Truck}
        title="Delivery & Logistics"
        subtitle="Society delivery monitoring, delivery partner dashboard with GPS tracking, partner management, and parcel tracking."
      />

      {/* ─── SocietyDeliveriesPage ─── */}
      <DocSection title="SocietyDeliveriesPage — Delivery Monitoring" id="society-deliveries">
        <p>The /society/deliveries route provides a monitoring dashboard for society administrators.</p>
        <DocList items={[
          'Feature-gated — only visible when delivery feature is enabled for the society (FeatureGate component)',
          'Shows all active and recent deliveries within the community',
          'Delivery cards show: order reference, rider name, status, pickup/drop info, ETA',
          'Status filter tabs: Active, Completed, Failed',
          'Real-time status updates from delivery_assignments table',
          'Admin can view delivery tracking details and contact riders',
        ]} />
      </DocSection>

      {/* ─── DeliveryPartnerDashboardPage ─── */}
      <DocSection title="DeliveryPartnerDashboardPage — Rider Dashboard" id="partner-dashboard">
        <p>The /my-deliveries route is the delivery partner's mobile-first dashboard.</p>

        <DocSubSection title="Partner Identification">
          <DocList items={[
            'Partners identified by phone number matching: queries delivery_partner_pool by phone from user\'s profile',
            'Auto-links user_id to pool record if not already set (enables GPS auth)',
            'No separate login required — uses existing authenticated session',
            'If no matching partner found, shows "not registered" message',
          ]} />
        </DocSubSection>

        <DocSubSection title="Tabs">
          <DocTable
            headers={['Tab', 'Shows']}
            rows={[
              ['Active', 'Current in-progress deliveries'],
              ['Completed', 'Past completed deliveries'],
              ['All', 'Full delivery history'],
            ]}
          />
        </DocSubSection>

        <DocSubSection title="Delivery Flow">
          <DocStep number={1} title="Accept Assignment">
            <p>View delivery details: pickup location (seller), drop-off (buyer address), items list, delivery fee. Accept or decline button.</p>
          </DocStep>
          <DocStep number={2} title="Pickup">
            <p>Navigate to seller location. Confirm pickup button updates status to "picked_up". GPS tracking starts automatically (useBackgroundLocationTracking hook).</p>
          </DocStep>
          <DocStep number={3} title="At Gate">
            <p>Arrive at society gate. Status updates to "at_gate". Security guard can verify via guard kiosk. at_gate_at timestamp recorded.</p>
          </DocStep>
          <DocStep number={4} title="Deliver">
            <p>Complete delivery with OTP verification from buyer. OTP stored as hash (otp_hash) with max attempts (max_otp_attempts, default 3). otp_attempt_count tracks failed attempts. On success, status → "delivered", delivered_at timestamp recorded.</p>
          </DocStep>
        </DocSubSection>

        <DocSubSection title="GPS Tracking">
          <DocList items={[
            'useBackgroundLocationTracking hook manages continuous location updates',
            'Location data: latitude, longitude, accuracy (meters), speed (km/h), heading',
            'Stored in delivery_locations table with assignment_id and partner_id',
            'Updates pushed to buyer\'s LiveDeliveryTracker in real-time',
            'Permission denied handling: shows warning if location permission is rejected',
            'Tracking automatically stops when delivery is completed',
          ]} />
        </DocSubSection>

        <DocSubSection title="Delivery Card Details">
          <DocList items={[
            'Order reference and buyer address',
            'Item list with quantities',
            'Delivery fee and payment info',
            'Status badge with color coding (from useStatusLabels)',
            'ETA display (eta_minutes field)',
            'Navigation button to open maps app',
            'Phone call button to contact buyer',
            'Status transition buttons based on current state',
          ]} />
        </DocSubSection>
      </DocSection>

      {/* ─── DeliveryPartnerManagementPage ─── */}
      <DocSection title="DeliveryPartnerManagementPage — Partner Admin" id="partner-management">
        <p>The /delivery-partners route (ManagementRoute protected) manages the delivery partner pool.</p>
        <DocList items={[
          'Add Partner form: name (required), phone (required), vehicle type (dropdown), vehicle number, photo upload',
          'Partner list shows: name, phone, vehicle info, rating, total deliveries, availability status',
          'Activate/Deactivate toggle per partner (is_active flag)',
          'Availability toggle (is_available flag) — controls whether partner receives new assignments',
          'Performance metrics: total_deliveries count, rating (decimal)',
          'Partners scoped to society_id — each society manages its own pool',
          'Stored in delivery_partner_pool table',
        ]} />
      </DocSection>

      {/* ─── ParcelManagementPage ─── */}
      <DocSection title="ParcelManagementPage — Parcel Tracking" id="parcel-management">
        <p>The /parcels route tracks packages received at the society gate.</p>

        <DocSubSection title="4-Status System">
          <DocTable
            headers={['Status', 'Description', 'Who Triggers']}
            rows={[
              ['Received', 'Parcel received at gate by security guard', 'Security (Guard Kiosk)'],
              ['Notified', 'Resident notified about the parcel (push notification sent)', 'System (automatic)'],
              ['Collected', 'Resident picked up the parcel', 'Resident (self-mark) or Security'],
              ['Returned', 'Parcel returned to sender/courier', 'Security'],
            ]}
          />
        </DocSubSection>

        <DocList items={[
          'Tab-based filtering by status',
          'Each parcel card: sender/courier name, tracking number, resident name/flat, received date, status badge',
          'Residents see only their own parcels',
          'Security guards add new parcels via Guard Kiosk with recipient lookup',
          'Auto-notification on parcel receipt via notification_queue',
        ]} />
      </DocSection>

      {/* ─── Delivery Assignment System ─── */}
      <DocSection title="Delivery Assignment Architecture" id="assignment-system">
        <p>The delivery_assignments table manages the full lifecycle of each delivery:</p>
        <DocTable
          headers={['Field', 'Purpose']}
          rows={[
            ['idempotency_key', 'Prevents duplicate assignment creation'],
            ['delivery_code', 'Unique code for delivery verification'],
            ['otp_hash + otp_expires_at', 'Secure OTP verification with expiry'],
            ['otp_attempt_count + max_otp_attempts', 'Rate limiting on OTP verification (default 3 attempts)'],
            ['delivery_fee + partner_payout + platform_margin', 'Financial breakdown per delivery'],
            ['distance_meters + eta_minutes', 'Route and time estimation'],
            ['last_location_lat/lng + last_location_at', 'Latest GPS position'],
            ['stalled_notified', 'Flag for stall detection alerts'],
            ['external_tracking_id', 'For third-party delivery integration'],
            ['gate_entry_id', 'Links to gate entry system for security verification'],
            ['failure_owner', 'Assigns responsibility when delivery fails'],
            ['attempt_count', 'Tracks re-delivery attempts'],
          ]}
        />

        <DocInfoCard variant="info" title="Tracking Logs">
          delivery_tracking_logs table records every status change with: status, timestamp, GPS location, source (system/manual), and optional note. This provides a complete audit trail for dispute resolution.
        </DocInfoCard>
      </DocSection>
    </div>
  );
}
