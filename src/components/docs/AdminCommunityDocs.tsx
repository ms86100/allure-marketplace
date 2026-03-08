import { DocHero, DocSection, DocSubSection, DocStep, DocInfoCard, DocList, DocTable } from './DocPrimitives';
import { Shield } from 'lucide-react';

export function AdminCommunityDocs() {
  return (
    <div>
      <DocHero
        icon={Shield}
        title="Admin & Community"
        subtitle="Admin panel, society admin, bulletin board, disputes, visitor management, guard kiosk, workforce, reports, and notifications."
      />

      <DocSection title="Admin Panel (/admin)">
        <p>The super-admin dashboard with sticky navigation bar and urgency badges for pending tasks. Accessible only to users with admin role.</p>
        <DocSubSection title="Tabs">
          <DocList items={[
            'Sellers — Review pending seller applications (approve/reject with full details), manage active sellers, deactivate/reactivate',
            'Products — Browse all products across sellers, manage catalog',
            'Services Overview — View all service categories, their configuration, and active listings',
            'Catalog Manager — Edit category_config: display names, icons, colors, listing types, action types, attribute blocks. Changes auto-propagate to products via database triggers',
            'Settings — Three partitions: Platform (app name, version, branding), Notifications (push config, template management), System (feature flags, maintenance mode)',
            'License Configuration — Under Catalog → Licenses: manage required licenses/certifications per category',
          ]} />
        </DocSubSection>

        <DocInfoCard variant="warning" title="Listing Type Propagation">
          When an admin changes a category's listing type (e.g., from "cart" to "contact"), a database trigger automatically updates all products in that category. The admin sees a confirmation dialog showing how many products will be affected.
        </DocInfoCard>
      </DocSection>

      <DocSection title="Builder Portal">
        <p>For real estate builder teams managing societies under construction:</p>
        <DocList items={[
          'Builder Dashboard (/builder) — Overview of managed societies, announcements, milestones',
          'Builder Analytics (/builder/analytics) — Construction progress, snag statistics, resident satisfaction',
          'Builder Inspections (/builder-inspections) — Inspection checklists and results',
          'Builder announcements — Post updates to specific societies (builder_announcements table)',
          'Builder members — Team management with role-based access (builder_members table)',
        ]} />
      </DocSection>

      <DocSection title="Society Admin (/society/admin)">
        <p>Society-level administration for committee members. Manages resident verification, society settings, feature toggles, and member management. Accessed via SocietyAdminRoute guard.</p>
      </DocSection>

      <DocSection title="Bulletin Board (/community)">
        <DocList items={[
          'Categories: general, event, poll, announcement, marketplace',
          'Create posts with title, body, optional attachments (photos)',
          'Events — date, location, RSVP tracking (bulletin_rsvps table)',
          'Polls — multiple options with deadline, vote tracking (bulletin_votes table)',
          'Pinned posts — admins can pin important announcements',
          'Comments — threaded discussion on each post (bulletin_comments table)',
          'Upvote/downvote system with vote counts',
          'AI summary — optional AI-generated summary for long posts',
          'Archive system for old posts',
        ]} />
      </DocSection>

      <DocSection title="Disputes (/disputes)">
        <p>Formal complaint and dispute resolution system between residents, sellers, and the society.</p>
        <DocList items={[
          'Submit dispute with category, description, photos, optional anonymity',
          'SLA deadline auto-calculated based on category',
          'Status flow: submitted → acknowledged → in_progress → resolved',
          'Committee notes — private notes visible only to admin/committee members (is_committee_note flag)',
          'Resolution note recorded when dispute is closed',
          'dispute_tickets and dispute_comments tables with RLS policies',
        ]} />
      </DocSection>

      <DocSection title="Visitor Management (/visitors)">
        <p>Residents pre-register expected visitors for smooth gate entry. Visitors receive a time-limited pass. Security can verify at the guard kiosk.</p>
      </DocSection>

      <DocSection title="Guard Kiosk (/guard-kiosk)">
        <p>Dedicated security guard interface (SecurityRoute protected). QR code scanning for resident gate entry, visitor verification, delivery partner verification. Logs all entries in the gate entry system.</p>
      </DocSection>

      <DocSection title="Workforce Management (/workforce)">
        <DocList items={[
          'Domestic help registry with attendance tracking (domestic_help_attendance table)',
          'Worker attendance — daily check-in/check-out with timestamp and photo',
          'Worker leave management — apply, approve/reject leave requests',
          'Worker salary tracking and payment records',
          'Worker hire — post job requests, workers can browse and apply (worker_jobs tables)',
          'My Workers — residents view their assigned domestic workers',
          'Authorized persons — manage who is allowed entry on behalf of a resident',
        ]} />
      </DocSection>

      <DocSection title="Society Features">
        <DocList items={[
          'Society Dashboard (/society) — Overview of society activities, quick stats',
          'Society Finances (/society/finances) — Financial overview, dues, payments',
          'Construction Progress (/society/progress) — Milestone tracking for under-construction societies',
          'Snag List (/society/snags) — Report and track construction defects',
          'Society Reports (/society/reports) — Analytics and reports for committee members',
          'Society Notices (/society/notices) — Official notices from management',
          'Maintenance (/maintenance) — Maintenance requests and tracking',
          'Vehicle Parking (/parking) — Parking slot management and allocation',
          'Payment Milestones (/payment-milestones) — Track construction payment schedules',
        ]} />
      </DocSection>

      <DocSection title="Notification System">
        <DocList items={[
          'Push notifications via Firebase (FCM for Android, APNs for iOS)',
          'device_tokens table stores per-user, per-platform tokens with APNS support',
          'notification_queue table for async delivery — edge function processes and sends',
          'Campaign system (campaigns table) — send targeted notifications to society, role, or individual users',
          'Notification inbox (/notifications/inbox) — in-app notification center with read/unread status',
          'NotificationHealthCheck component on profile page monitors push registration status',
        ]} />
      </DocSection>

      <DocSection title="Audit & Security">
        <DocList items={[
          'audit_log table records all significant actions (create, update, delete) with actor, target, metadata',
          'audit_log_archive for long-term storage of old audit records',
          'AI review log (ai_review_log) — tracks AI-assisted moderation decisions with confidence scores',
          'RLS policies on all tables ensure data isolation between societies',
          'Role-based route guards: AdminRoute, SellerRoute, SecurityRoute, BuilderRoute, SocietyAdminRoute, ManagementRoute',
        ]} />
      </DocSection>
    </div>
  );
}
