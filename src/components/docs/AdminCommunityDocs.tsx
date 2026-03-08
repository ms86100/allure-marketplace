import { DocHero, DocSection, DocSubSection, DocStep, DocInfoCard, DocList, DocTable } from './DocPrimitives';
import { Shield } from 'lucide-react';

export function AdminCommunityDocs() {
  return (
    <div>
      <DocHero
        icon={Shield}
        title="Admin & Community"
        subtitle="Admin panel with dashboard stats, user/seller/society management, catalog configuration, bulletin board, disputes, visitor management, guard kiosk, workforce, and notification system."
      />

      {/* ─── AdminPage ─── */}
      <DocSection title="AdminPage — Platform Administration" id="admin-panel">
        <p>The /admin route (AdminRoute protected) is the super-admin dashboard with animated stat cards and tabbed navigation via AdminSidebarNav.</p>

        <DocSubSection title="Dashboard Header">
          <DocList items={[
            'Animated header: "Dashboard — Platform overview & management"',
            'EmergencyBroadcastSheet button — send urgent notifications to all users',
            'SocietySwitcher — filter admin view to a specific society or view all',
          ]} />
        </DocSubSection>

        <DocSubSection title="Stats Grid">
          <DocTable
            headers={['Stat', 'Icon', 'Color']}
            rows={[
              ['Users count', 'Users', 'Blue'],
              ['Sellers count', 'Store', 'Emerald'],
              ['Orders count', 'Package', 'Amber'],
              ['Revenue total', 'DollarSign', 'Violet'],
              ['Societies count', 'Building2', 'Cyan'],
              ['Reviews count', 'Star', 'Indigo'],
              ['Pending Reports', 'Flag', 'Rose'],
            ]}
          />
          <p>Each card has hover animation (scale) and staggered entrance delays.</p>
        </DocSubSection>

        <DocSubSection title="Navigation Tabs (AdminSidebarNav)">
          <DocTable
            headers={['Tab', 'Content']}
            rows={[
              ['Sellers', 'SellerApplicationReview (pending applications with full details: store info, categories, products, license docs — approve/reject) + AdminProductApprovals (pending product submissions)'],
              ['Users', 'Pending user registrations — each card shows: name, email, phone, address details, society name. Approve (checkmark) or Reject (X) buttons'],
              ['Societies', 'All societies list with verified/pending indicators. Toggle verification, edit settings, manage features. Pending count badge'],
              ['Orders', 'Platform-wide order overview with status filters and search'],
              ['Payments', 'Payment records with status filtering (pending/completed/failed)'],
              ['Catalog', 'AdminCatalogManager — edit category_config: display names, icons, colors, listing types (transaction_type), action types, attribute blocks, layout types. Changes auto-propagate to products via DB triggers'],
              ['Banners', 'AdminBannerManager — manage featured banners shown on home page carousel'],
              ['Features', 'FeatureManagement — toggle society-level feature flags (visitor management, parking, workforce, delivery, etc.)'],
              ['Settings', 'PlatformSettingsManager with three partitions: Platform (app name, version, branding, labels), Notifications (push config, templates), System (maintenance mode, rate limits)'],
              ['Disputes', 'AdminDisputesTab — manage dispute tickets across all societies'],
              ['AI Review', 'AdminAIReviewLog — view AI moderation decisions with confidence scores and reasoning'],
              ['Campaigns', 'CampaignSender — create and send targeted push notification campaigns to societies, roles, or individual users'],
              ['Tools', 'AppNavigator, ApiKeySettings, ResetAndSeedButton, PurgeDataButton, NotificationDiagnostics'],
            ]}
          />
        </DocSubSection>

        <DocInfoCard variant="warning" title="Catalog Listing Type Propagation">
          When an admin changes a category's transaction_type (e.g., from "cart_purchase" to "contact_only"), the database trigger sync_products_action_type_on_category_tx_change automatically updates ALL products in that category. The admin sees a TransactionTypeConfirmSave dialog showing how many products will be affected.
        </DocInfoCard>
      </DocSection>

      {/* ─── Builder Portal ─── */}
      <DocSection title="Builder Portal" id="builder-portal">
        <p>For real estate builder teams managing under-construction societies:</p>
        <DocTable
          headers={['Page', 'Route', 'Features']}
          rows={[
            ['Builder Dashboard', '/builder', 'Overview of managed societies, post announcements (builder_announcements), construction milestones (construction_milestones), team management'],
            ['Builder Analytics', '/builder/analytics', 'Construction progress stats, snag statistics (collective_escalations), resident satisfaction metrics'],
            ['Builder Inspections', '/builder-inspections', 'Inspection checklists, test results, defect tracking'],
          ]}
        />
        <DocList items={[
          'Builder members managed in builder_members table with role-based access',
          'Builder-society association via builder_societies table',
          'BuilderRoute guard checks builder membership before granting access',
        ]} />
      </DocSection>

      {/* ─── SocietyAdminPage ─── */}
      <DocSection title="SocietyAdminPage — Society Management" id="society-admin">
        <p>The /society/admin route (SocietyAdminRoute protected) for committee members:</p>
        <DocList items={[
          'Resident verification: approve/reject pending residents',
          'Society settings: name, address, auto-approve toggle, max admins limit',
          'Feature toggles per society',
          'Member management: view all residents, update roles',
          'Society admin limit enforced by validate_society_admin_limit() trigger',
        ]} />
      </DocSection>

      {/* ─── BulletinPage ─── */}
      <DocSection title="BulletinPage — Community Board" id="bulletin">
        <p>The /community route is the community bulletin board.</p>
        <DocList items={[
          'Post categories: general, event, poll, announcement, marketplace',
          'Create post: title, body, category selector, optional photo attachments (attachment_urls array)',
          'Events: event_date, event_location fields, RSVP tracking (bulletin_rsvps table with status: going/maybe/not_going)',
          'Polls: poll_options (JSON array), poll_deadline, voting via bulletin_votes table (poll_option_id)',
          'Pinned posts: is_pinned flag, admins can pin/unpin — pinned posts always show at top',
          'Comments: threaded discussion (bulletin_comments table), auto-increments comment_count via trigger',
          'Upvote/downvote: bulletin_votes table with vote_type, auto-updates vote_count via trigger',
          'AI summary: ai_summary field for auto-generated post summaries',
          'Archive: is_archived flag for hiding old posts',
          'Activity logging: log_bulletin_activity() trigger records post creation in society_activity',
        ]} />
      </DocSection>

      {/* ─── DisputesPage ─── */}
      <DocSection title="DisputesPage — Dispute Resolution" id="disputes">
        <p>The /disputes route handles formal complaints.</p>
        <DocList items={[
          'Submit dispute: category dropdown (configurable), description textarea, photo upload (photo_urls array), anonymous toggle (is_anonymous)',
          'SLA deadline auto-calculated based on category (sla_deadline field)',
          'Status flow: submitted → acknowledged (acknowledged_at timestamp) → in_progress → resolved (resolved_at + resolution_note)',
          'Committee notes: dispute_comments with is_committee_note flag — private, visible only to admins',
          'Activity logging: log_dispute_activity() trigger',
          'Admin view: AdminDisputesTab in admin panel shows all disputes cross-society',
        ]} />
      </DocSection>

      {/* ─── VisitorManagementPage ─── */}
      <DocSection title="VisitorManagementPage — Visitor Pre-Registration" id="visitors">
        <p>The /visitors route allows residents to pre-register expected visitors.</p>
        <DocList items={[
          'Register visitor: name, phone, purpose, expected date/time',
          'Visitor types configurable per society (get_visitor_types_for_society function): delivery, guest, vendor, etc.',
          'Time-limited pass generation for visitor entry',
          'Security verification at guard kiosk',
          'Visitor history and status tracking',
        ]} />
      </DocSection>

      {/* ─── GuardKioskPage ─── */}
      <DocSection title="GuardKioskPage — Security Interface" id="guard-kiosk">
        <p>The /guard-kiosk route (SecurityRoute protected) is the dedicated security guard interface.</p>
        <DocList items={[
          'Resident gate entry: QR code scanning for verified residents',
          'Visitor verification: validate pre-registered visitors',
          'Delivery partner verification: confirm delivery assignments',
          'Worker entry validation: validate_worker_entry() function checks active worker status',
          'Parcel logging: register incoming parcels for residents',
          'All entries logged in the gate entry system with timestamps',
        ]} />
      </DocSection>

      {/* ─── WorkforceManagementPage ─── */}
      <DocSection title="Workforce Management" id="workforce">
        <p>The /workforce route (and related sub-pages) manages domestic help and workers.</p>
        <DocTable
          headers={['Page', 'Route', 'Features']}
          rows={[
            ['Workforce Hub', '/workforce', 'Central management for all worker types'],
            ['Worker Attendance', '/worker-attendance', 'Daily check-in/check-out with timestamp (domestic_help_attendance table)'],
            ['My Workers', '/my-workers', 'Residents view their assigned domestic workers'],
            ['Worker Leave', '/worker-leave', 'Apply, approve/reject leave requests'],
            ['Worker Salary', '/worker-salary', 'Salary tracking and payment records'],
            ['Worker Hire', '/worker-hire', 'Post job requests for workers'],
            ['Create Job Request', '/worker-hire/create', 'Job creation form with requirements and pay'],
            ['Worker Jobs', '/worker/jobs', 'Workers browse available job requests (WorkerRoute protected)'],
            ['Worker My Jobs', '/worker/my-jobs', 'Workers view their accepted/completed jobs'],
            ['Authorized Persons', '/authorized-persons', 'Manage who can enter on resident\'s behalf (authorized_persons table)'],
          ]}
        />
        <DocInfoCard variant="info" title="Worker Job System">
          <DocList items={[
            'accept_worker_job() — atomically assigns worker to job request',
            'complete_worker_job() — marks job as completed',
            'rate_worker_job() — buyer rates worker after completion',
          ]} />
        </DocInfoCard>
      </DocSection>

      {/* ─── Society Features ─── */}
      <DocSection title="Society Feature Pages" id="society-features">
        <DocTable
          headers={['Page', 'Route', 'Description']}
          rows={[
            ['Society Dashboard', '/society', 'Overview of society activities and quick stats'],
            ['Society Finances', '/society/finances', 'Financial overview, maintenance dues, payments'],
            ['Construction Progress', '/society/progress', 'Milestone tracking for under-construction societies (construction_milestones table)'],
            ['Snag List', '/society/snags', 'Report and track construction defects, collective escalation when multiple residents report same issue'],
            ['Society Reports', '/society/reports', 'Analytics: top products (get_society_top_products), trending items, activity summaries'],
            ['Society Notices', '/society/notices', 'Official notices from management'],
            ['Maintenance', '/maintenance', 'Maintenance request submission and tracking'],
            ['Vehicle Parking', '/parking', 'Parking slot management and allocation'],
            ['Payment Milestones', '/payment-milestones', 'Construction payment schedules with stages (booking, foundation, slab, etc.)'],
            ['Gate Entry', '/gate-entry', 'Resident QR code display for gate entry'],
          ]}
        />
      </DocSection>

      {/* ─── Notification System ─── */}
      <DocSection title="Notification System" id="notifications">
        <DocList items={[
          'Push notifications via Firebase (FCM for Android, APNs for iOS)',
          'device_tokens table: user_id, token, platform (android/ios/web), apns_token',
          'claim_device_token() function: upserts token with ON CONFLICT handling',
          'notification_queue table: user_id, type, title, body, reference_path, payload, status, next_retry_at',
          'claim_notification_queue() function: atomic batch processing (SELECT FOR UPDATE SKIP LOCKED)',
          'Edge function processes queue and sends via FCM/APNs',
          'Campaign system (campaigns table): sent_by, target_society_id, target_user_ids, target_platform, title, body, status tracking (targeted_count, sent_count, failed_count, cleaned_count)',
          'CampaignSender component in admin panel for composing and sending campaigns',
          'Notification Inbox (/notifications/inbox): in-app notification center with read/unread status',
          'NotificationHealthCheck on profile page: monitors push registration and shows warnings',
          'NotificationDiagnostics in admin tools: debug push delivery issues',
        ]} />
      </DocSection>

      {/* ─── Audit & Security ─── */}
      <DocSection title="Audit & Security Architecture" id="audit-security">
        <DocList items={[
          'audit_log table: action, actor_id, target_type, target_id, society_id, metadata (JSONB)',
          'audit_log_archive: long-term storage for archived audit records',
          'ai_review_log: AI moderation decisions with confidence, model_used, rule_hits, input_snapshot',
          'society_activity: per-society activity feed (log_order_activity, log_bulletin_activity, log_dispute_activity, log_help_request_activity triggers)',
          'Security audit page (/security/audit): SecurityRoute protected, security event log',
          'RLS policies on ALL tables ensure society-level data isolation',
          'Role-based route guards: AdminRoute, SellerRoute, SecurityRoute, BuilderRoute, SocietyAdminRoute, ManagementRoute, WorkerRoute',
          'Database functions: is_admin(), is_society_admin(), is_security_officer(), is_builder_member(), is_builder_for_society(), can_write_to_society(), can_manage_society(), can_access_feature()',
        ]} />
      </DocSection>
    </div>
  );
}
