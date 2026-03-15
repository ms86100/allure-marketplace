import { DocHero, DocSection, DocInfoCard, DocTable, DocFlowStep } from './DocPrimitives';
import { GitBranch } from 'lucide-react';

export function WorkflowEngineDocs() {
  return (
    <div className="space-y-2">
      <DocHero
        icon={GitBranch}
        title="Dynamic Workflow Engine"
        description="A fully database-driven, admin-configurable workflow system that controls order and booking lifecycles. Supports actor-based transitions, per-category pipelines, seller/buyer hints, and real-time validation via database triggers."
        badges={['Admin', 'DB-Driven', 'Actor Validation', '5 Actors', '4 Workflow Types']}
      />

      {/* ─── ACTORS ─── */}
      <DocSection title="1. Actors & Their Roles">
        <p>The workflow engine recognizes <strong>five distinct actors</strong>. Every status transition in the system is gated by which actor is performing the action.</p>

        <DocInfoCard title="Buyer (Resident / Customer)" icon="🛍️">
          <p><strong>Identity:</strong> Any authenticated user browsing the marketplace.</p>
          <p><strong>Can trigger:</strong></p>
          <p>• <strong>Order creation</strong> — Places an order, books a service, or sends an enquiry. This inserts a row into the <code className="text-[10px] bg-muted px-1 rounded">orders</code> table with status = first step of the workflow (e.g., <code className="text-[10px] bg-muted px-1 rounded">placed</code>, <code className="text-[10px] bg-muted px-1 rounded">booking_requested</code>, <code className="text-[10px] bg-muted px-1 rounded">inquiry_sent</code>).</p>
          <p>• <strong>Cancellation</strong> — Can cancel from early statuses (placed, accepted) where allowed by transitions.</p>
          <p>• <strong>Completion confirmation</strong> — Marks <code className="text-[10px] bg-muted px-1 rounded">delivered → completed</code> to confirm receipt.</p>
          <p>• <strong>Rescheduling request</strong> — For bookings, can trigger <code className="text-[10px] bg-muted px-1 rounded">scheduled → rescheduled</code>.</p>
          <p><strong>Cannot do:</strong> Accept orders, mark as preparing/ready, assign delivery, or change system statuses.</p>
          <p><strong>UI influence:</strong> Sees <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> messages at each status. Action buttons are built from <code className="text-[10px] bg-muted px-1 rounded">useStatusTransitions</code> filtered by actor=buyer.</p>
        </DocInfoCard>

        <DocInfoCard title="Seller (Vendor / Service Provider)" icon="🏪">
          <p><strong>Identity:</strong> User with an active <code className="text-[10px] bg-muted px-1 rounded">seller_profiles</code> record linked to the order's product.</p>
          <p><strong>Can trigger:</strong></p>
          <p>• <strong>Accept</strong> — <code className="text-[10px] bg-muted px-1 rounded">placed → accepted</code>. The seller reviews the order and confirms they can fulfill it. This starts the preparation clock.</p>
          <p>• <strong>Prepare</strong> — <code className="text-[10px] bg-muted px-1 rounded">accepted → preparing</code>. Indicates active work has begun.</p>
          <p>• <strong>Ready</strong> — <code className="text-[10px] bg-muted px-1 rounded">preparing → ready</code>. Signals the order is ready for pickup/delivery. This triggers the delivery assignment system.</p>
          <p>• <strong>Confirm booking</strong> — <code className="text-[10px] bg-muted px-1 rounded">booking_requested → confirmed</code>. For service bookings, the seller approves the time slot.</p>
          <p>• <strong>Respond to enquiry</strong> — <code className="text-[10px] bg-muted px-1 rounded">inquiry_sent → seller_responded</code>. For request_service flows.</p>
          <p>• <strong>Cancel (limited)</strong> — Can cancel from <code className="text-[10px] bg-muted px-1 rounded">preparing</code> onwards only if explicitly allowed by the transition rules (e.g., out of stock mid-preparation).</p>
          <p><strong>Cannot do:</strong> Create orders, mark as delivered, assign riders, or bypass the trigger validation.</p>
          <p><strong>UI influence:</strong> Sees <code className="text-[10px] bg-muted px-1 rounded">seller_hint</code> messages. The seller dashboard shows action buttons only for transitions where actor=seller.</p>
          <p><strong>Side effects on seller actions:</strong></p>
          <p>• Accepting an order → push notification to buyer + order timer starts.</p>
          <p>• Marking ready → delivery assignment created in <code className="text-[10px] bg-muted px-1 rounded">delivery_assignments</code> (if delivery required).</p>
          <p>• Seller receives a <strong>NewOrderAlertOverlay</strong> (full-screen buzzer) when a new order arrives.</p>
        </DocInfoCard>

        <DocInfoCard title="Delivery Partner" icon="🚚">
          <p><strong>Identity:</strong> A rider from the <code className="text-[10px] bg-muted px-1 rounded">delivery_partner_pool</code> assigned via <code className="text-[10px] bg-muted px-1 rounded">delivery_assignments</code>.</p>
          <p><strong>Can trigger:</strong></p>
          <p>• <strong>Pickup</strong> — <code className="text-[10px] bg-muted px-1 rounded">ready → picked_up</code>. Rider collects the order from the seller. Location tracking begins.</p>
          <p>• <strong>At gate</strong> — Updates <code className="text-[10px] bg-muted px-1 rounded">delivery_assignments.at_gate_at</code> when arriving at the society gate.</p>
          <p>• <strong>Deliver</strong> — <code className="text-[10px] bg-muted px-1 rounded">picked_up → delivered</code>. Requires OTP verification (<code className="text-[10px] bg-muted px-1 rounded">otp_hash</code> + <code className="text-[10px] bg-muted px-1 rounded">otp_attempt_count</code> checked). Gate entry logged.</p>
          <p>• <strong>Failed delivery</strong> — <code className="text-[10px] bg-muted px-1 rounded">picked_up → failed</code>. When buyer is unreachable. <code className="text-[10px] bg-muted px-1 rounded">failed_reason</code> and <code className="text-[10px] bg-muted px-1 rounded">failure_owner</code> recorded.</p>
          <p><strong>Cannot do:</strong> Accept orders, prepare items, or cancel on behalf of buyer/seller.</p>
          <p><strong>Side effects:</strong></p>
          <p>• Pickup → buyer receives "On the way" notification + live tracking enabled via <code className="text-[10px] bg-muted px-1 rounded">delivery_locations</code> table.</p>
          <p>• At gate → buyer receives "Rider at gate" notification.</p>
          <p>• Delivery → OTP verified, <code className="text-[10px] bg-muted px-1 rounded">gate_entries</code> record created, buyer prompted to confirm + review.</p>
        </DocInfoCard>

        <DocInfoCard title="System (Automated)" icon="🤖">
          <p><strong>Identity:</strong> Database triggers, edge functions, and scheduled jobs — no human actor.</p>
          <p><strong>Can trigger:</strong></p>
          <p>• <strong>Auto-cancellation</strong> — If a seller doesn't accept within <code className="text-[10px] bg-muted px-1 rounded">seller_response_timeout</code> (from admin_settings), the system moves <code className="text-[10px] bg-muted px-1 rounded">placed → cancelled</code>.</p>
          <p>• <strong>No-show detection</strong> — For bookings, if the service time passes without <code className="text-[10px] bg-muted px-1 rounded">in_progress</code>, system marks <code className="text-[10px] bg-muted px-1 rounded">scheduled → no_show</code>.</p>
          <p>• <strong>Stalled delivery alerts</strong> — If a delivery doesn't progress, <code className="text-[10px] bg-muted px-1 rounded">stalled_notified</code> flag is set and admin is alerted.</p>
          <p>• <strong>Auto-completion</strong> — Some workflows auto-complete after a grace period post-delivery.</p>
          <p><strong>Side effects:</strong> Notifications to all affected parties, audit log entries, and potential refund triggers.</p>
        </DocInfoCard>

        <DocInfoCard title="Admin (Platform Admin)" icon="🛡️">
          <p><strong>Identity:</strong> User with <code className="text-[10px] bg-muted px-1 rounded">admin</code> role in <code className="text-[10px] bg-muted px-1 rounded">user_roles</code> table.</p>
          <p><strong>Can trigger:</strong></p>
          <p>• <strong>Force status override</strong> — Admin can move an order to any status for dispute resolution (uses actor=any transitions).</p>
          <p>• <strong>Workflow configuration</strong> — Creates, edits, and deletes workflow pipelines and transition rules via AdminWorkflowManager.</p>
          <p>• <strong>Dispute resolution</strong> — Can trigger refunds, cancel contested orders, or mark as completed on behalf of either party.</p>
          <p><strong>Side effects:</strong> All admin actions are logged in <code className="text-[10px] bg-muted px-1 rounded">audit_log</code> with actor_id and metadata.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── WHAT HAPPENS WHEN ─── */}
      <DocSection title="2. What Happens When an Order is Created">
        <p>This section traces every system behavior from the moment a buyer taps "Place Order" or "Book Service".</p>

        <DocInfoCard title="Step 1: Order Row Inserted" icon="📝">
          <p><strong>Actor:</strong> Buyer (via frontend)</p>
          <p><strong>What happens in the database:</strong></p>
          <p>• A new row is inserted into the <code className="text-[10px] bg-muted px-1 rounded">orders</code> table with:</p>
          <p className="pl-3">– <code className="text-[10px] bg-muted px-1 rounded">status</code> = first status of the workflow (e.g., <code className="text-[10px] bg-muted px-1 rounded">placed</code> for cart_purchase, <code className="text-[10px] bg-muted px-1 rounded">booking_requested</code> for service_booking)</p>
          <p className="pl-3">– <code className="text-[10px] bg-muted px-1 rounded">buyer_id</code> = authenticated user ID</p>
          <p className="pl-3">– <code className="text-[10px] bg-muted px-1 rounded">seller_id</code> = resolved from product's seller_profile</p>
          <p className="pl-3">– <code className="text-[10px] bg-muted px-1 rounded">product_id</code>, <code className="text-[10px] bg-muted px-1 rounded">quantity</code>, <code className="text-[10px] bg-muted px-1 rounded">total_amount</code>, <code className="text-[10px] bg-muted px-1 rounded">delivery_address_id</code></p>
          <p>• For service bookings: <code className="text-[10px] bg-muted px-1 rounded">service_bookings</code> row also created via <code className="text-[10px] bg-muted px-1 rounded">book_service_slot()</code> atomic function which locks the time slot.</p>
          <p>• For cart purchases: <code className="text-[10px] bg-muted px-1 rounded">order_items</code> rows created, <code className="text-[10px] bg-muted px-1 rounded">cart_items</code> cleared.</p>
        </DocInfoCard>

        <DocInfoCard title="Step 2: Workflow Resolution" icon="🔍">
          <p><strong>Actor:</strong> System (DB trigger)</p>
          <p><strong>How the correct workflow is determined:</strong></p>
          <p>1. The product's <code className="text-[10px] bg-muted px-1 rounded">category</code> is looked up in <code className="text-[10px] bg-muted px-1 rounded">category_config</code>.</p>
          <p>2. From category_config, the system reads <code className="text-[10px] bg-muted px-1 rounded">parent_group</code> (e.g., food_kitchen) and <code className="text-[10px] bg-muted px-1 rounded">transaction_type</code> (e.g., cart_purchase).</p>
          <p>3. The trigger searches <code className="text-[10px] bg-muted px-1 rounded">category_status_transitions</code> for this (parent_group, transaction_type) pair.</p>
          <p>4. If no workflow exists for this specific parent_group, it falls back to <code className="text-[10px] bg-muted px-1 rounded">parent_group = 'default'</code>.</p>
          <p>5. This ensures <strong>every order always has a valid workflow</strong>, even new categories.</p>
        </DocInfoCard>

        <DocInfoCard title="Step 3: Notification Cascade" icon="🔔">
          <p><strong>Actor:</strong> System (edge functions)</p>
          <p><strong>What fires immediately after order creation:</strong></p>
          <p>• <strong>Push notification</strong> sent to seller via FCM/APNs (from <code className="text-[10px] bg-muted px-1 rounded">device_tokens</code>).</p>
          <p>• <strong>NewOrderAlertOverlay</strong> activated on seller's app — full-screen buzzer with persistent audio that requires acknowledgment.</p>
          <p>• <strong>notification_queue</strong> row inserted for in-app notification history.</p>
          <p>• <strong>Buyer sees</strong> confirmation screen with order ID, estimated time, and the <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> from the first workflow step.</p>
          <p>• <strong>Seller response timer</strong> starts — if seller doesn't accept within <code className="text-[10px] bg-muted px-1 rounded">seller_response_timeout</code> (configurable in admin_settings), system auto-cancels.</p>
        </DocInfoCard>

        <DocInfoCard title="Step 4: For Service Bookings — Additional Actions" icon="📅">
          <p><strong>Actor:</strong> System (atomic DB function)</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">book_service_slot()</code> acquires a row-level lock on the <code className="text-[10px] bg-muted px-1 rounded">service_slots</code> row.</p>
          <p>• Checks: duplicate booking? overlapping time? past date? capacity full?</p>
          <p>• If valid: increments <code className="text-[10px] bg-muted px-1 rounded">booked_count</code>, creates <code className="text-[10px] bg-muted px-1 rounded">service_bookings</code> record with status=requested.</p>
          <p>• If addons selected: inserts rows into <code className="text-[10px] bg-muted px-1 rounded">service_booking_addons</code>.</p>
          <p>• If recurring: creates multiple future bookings based on weekly/monthly pattern.</p>
          <p>• 24h and 1h reminder notifications are scheduled.</p>
        </DocInfoCard>

        <DocInfoCard title="Step 5: For Delivery Orders — Address & Assignment Setup" icon="📍">
          <p><strong>Actor:</strong> System</p>
          <p>• Delivery address resolved from <code className="text-[10px] bg-muted px-1 rounded">delivery_addresses</code> (buyer's default or selected).</p>
          <p>• No delivery assignment created yet — this happens when seller marks <code className="text-[10px] bg-muted px-1 rounded">ready</code>.</p>
          <p>• If the category has <code className="text-[10px] bg-muted px-1 rounded">requires_delivery = false</code> (self-fulfillment), no delivery infrastructure is involved.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── STATUS-BY-STATUS DEEP DIVE ─── */}
      <DocSection title="3. Status-by-Status: What Each Actor Sees & What the System Does">

        <DocInfoCard title="placed / booking_requested / inquiry_sent (Initial Status)" icon="1️⃣">
          <p><strong>Triggered by:</strong> Buyer</p>
          <p><strong>Buyer sees:</strong> Order confirmation + <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> (e.g., "Waiting for seller to accept"). Timeline shows step 1 highlighted.</p>
          <p><strong>Seller sees:</strong> Full-screen alert overlay with buzzer sound. Order card in "New Orders" section of dashboard. <code className="text-[10px] bg-muted px-1 rounded">seller_hint</code> (e.g., "Review and accept this order"). Action buttons: "Accept" and "Reject".</p>
          <p><strong>Delivery:</strong> Not involved yet.</p>
          <p><strong>System:</strong> Response timer running. Audit log entry created. If preorder: scheduled for future processing.</p>
        </DocInfoCard>

        <DocInfoCard title="accepted / confirmed (Seller Acknowledges)" icon="2️⃣">
          <p><strong>Triggered by:</strong> Seller</p>
          <p><strong>DB trigger validates:</strong> <code className="text-[10px] bg-muted px-1 rounded">placed → accepted</code> with actor=seller exists in transitions table.</p>
          <p><strong>Buyer sees:</strong> Push notification "Order accepted!" + <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> updates (e.g., "Seller is working on your order"). Timeline advances to step 2.</p>
          <p><strong>Seller sees:</strong> Order moves to "Active Orders" section. <code className="text-[10px] bg-muted px-1 rounded">seller_hint</code> (e.g., "Start preparing"). Action buttons: "Mark Preparing" and "Cancel".</p>
          <p><strong>Delivery:</strong> Still not involved.</p>
          <p><strong>System:</strong> Response timer cleared. Preparation timer may start (for food orders with lead_time_hours).</p>
          <p><strong>For bookings:</strong> <code className="text-[10px] bg-muted px-1 rounded">confirmed</code> status locks the slot permanently. Calendar entry available for both parties. Automated reminders scheduled (24h + 1h before).</p>
        </DocInfoCard>

        <DocInfoCard title="preparing (Active Work)" icon="3️⃣">
          <p><strong>Triggered by:</strong> Seller</p>
          <p><strong>DB trigger validates:</strong> <code className="text-[10px] bg-muted px-1 rounded">accepted → preparing</code> with actor=seller.</p>
          <p><strong>Buyer sees:</strong> <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> (e.g., "Your food is being prepared"). Real-time status badge updates via subscription.</p>
          <p><strong>Seller sees:</strong> <code className="text-[10px] bg-muted px-1 rounded">seller_hint</code> (e.g., "Prepare the order items"). Action button: "Mark Ready".</p>
          <p><strong>System:</strong> If <code className="text-[10px] bg-muted px-1 rounded">requires_preparation = true</code> in category_config, preparation time tracking begins. Stall detection — if no progress for extended period, admin alerted.</p>
        </DocInfoCard>

        <DocInfoCard title="ready (Awaiting Pickup)" icon="4️⃣">
          <p><strong>Triggered by:</strong> Seller</p>
          <p><strong>DB trigger validates:</strong> <code className="text-[10px] bg-muted px-1 rounded">preparing → ready</code> with actor=seller.</p>
          <p><strong>Buyer sees:</strong> <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> (e.g., "Order ready! Awaiting pickup").</p>
          <p><strong>Seller sees:</strong> <code className="text-[10px] bg-muted px-1 rounded">seller_hint</code> (e.g., "Hand over to delivery partner"). Waiting indicator.</p>
          <p><strong>🔥 Critical system side effects:</strong></p>
          <p>• <strong>Delivery assignment created</strong> — Row inserted into <code className="text-[10px] bg-muted px-1 rounded">delivery_assignments</code> with: idempotency_key, order_id, society_id, status=pending, delivery_fee, OTP hash generated.</p>
          <p>• <strong>Rider assignment</strong> — If auto-assign enabled, nearest available rider from <code className="text-[10px] bg-muted px-1 rounded">delivery_partner_pool</code> is selected. Push notification sent to rider.</p>
          <p>• <strong>For self-fulfillment:</strong> No delivery created. Buyer receives "Ready for pickup" notification with seller location.</p>
        </DocInfoCard>

        <DocInfoCard title="scheduled (Bookings Only)" icon="📅">
          <p><strong>Triggered by:</strong> Seller (after confirming a booking)</p>
          <p><strong>Buyer sees:</strong> Calendar view with booking details. Countdown timer. <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> (e.g., "Your session is scheduled for March 15 at 6 PM").</p>
          <p><strong>Seller sees:</strong> Booking appears in their availability calendar. <code className="text-[10px] bg-muted px-1 rounded">seller_hint</code> (e.g., "Be ready before the start time").</p>
          <p><strong>System:</strong> 24h reminder notification queued. 1h reminder notification queued. If staff assigned, staff member notified. ICS calendar file available for download.</p>
          <p><strong>Special transitions from this status:</strong></p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">scheduled → rescheduled</code> (actor: buyer or seller) — old slot released atomically, new slot booked.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">scheduled → cancelled</code> (actor: any) — slot released, cancellation policy applied (fee if within notice period).</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">scheduled → no_show</code> (actor: system) — if session time passes without check-in.</p>
        </DocInfoCard>

        <DocInfoCard title="picked_up (In Transit)" icon="5️⃣">
          <p><strong>Triggered by:</strong> Delivery partner</p>
          <p><strong>DB trigger validates:</strong> <code className="text-[10px] bg-muted px-1 rounded">ready → picked_up</code> with actor=delivery.</p>
          <p><strong>Buyer sees:</strong> Live tracking map activated. ETA displayed. <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> (e.g., "Your order is on the way!"). Rider name, photo, and phone visible.</p>
          <p><strong>Seller sees:</strong> Order moves to "Dispatched" section. No further action needed.</p>
          <p><strong>Delivery partner:</strong> Location tracking active — <code className="text-[10px] bg-muted px-1 rounded">delivery_locations</code> table receives GPS updates (lat, lng, speed, heading, accuracy).</p>
          <p><strong>System:</strong></p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">delivery_assignments.pickup_at</code> timestamped.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">delivery_tracking_logs</code> entry created with status=picked_up.</p>
          <p>• ETA calculation begins based on distance_meters.</p>
          <p>• Stall detection — if no location update for extended period, <code className="text-[10px] bg-muted px-1 rounded">stalled_notified = true</code> and admin alerted.</p>
        </DocInfoCard>

        <DocInfoCard title="delivered (At Destination)" icon="6️⃣">
          <p><strong>Triggered by:</strong> Delivery partner (after OTP verification)</p>
          <p><strong>DB trigger validates:</strong> <code className="text-[10px] bg-muted px-1 rounded">picked_up → delivered</code> with actor=delivery.</p>
          <p><strong>Verification process:</strong></p>
          <p>• Rider enters OTP provided to buyer. System checks <code className="text-[10px] bg-muted px-1 rounded">otp_hash</code> match.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">otp_attempt_count</code> incremented. Max attempts enforced via <code className="text-[10px] bg-muted px-1 rounded">max_otp_attempts</code>.</p>
          <p>• On success: <code className="text-[10px] bg-muted px-1 rounded">delivered_at</code> timestamped, <code className="text-[10px] bg-muted px-1 rounded">gate_entry_id</code> linked.</p>
          <p><strong>Buyer sees:</strong> "Delivered!" confirmation. Review prompt appears. <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> (e.g., "Enjoy! Tap to confirm and leave a review").</p>
          <p><strong>System:</strong> Delivery partner marked available again. <code className="text-[10px] bg-muted px-1 rounded">total_deliveries</code> incremented on rider profile.</p>
        </DocInfoCard>

        <DocInfoCard title="completed (Terminal — Success)" icon="✅">
          <p><strong>Triggered by:</strong> Buyer (explicit confirmation) or System (auto-complete after grace period).</p>
          <p><strong>What this means:</strong> The transaction is finalized. No further status changes possible.</p>
          <p><strong>System side effects:</strong></p>
          <p>• Review eligible — buyer can now rate the seller/product (stored in <code className="text-[10px] bg-muted px-1 rounded">reviews</code>).</p>
          <p>• Settlement eligible — payment can be released to seller.</p>
          <p>• Analytics updated — seller's order count, rating, and response metrics recalculated.</p>
          <p>• Coupon redemption finalized (if used).</p>
        </DocInfoCard>

        <DocInfoCard title="cancelled (Terminal — Aborted)" icon="❌">
          <p><strong>Triggered by:</strong> Buyer, Seller, or System (timeout).</p>
          <p><strong>Non-linear transition — can happen from multiple statuses:</strong></p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">placed → cancelled</code> (actor: any) — order never acknowledged.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">accepted → cancelled</code> (actor: any) — seller accepted but can't fulfill.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">preparing → cancelled</code> (actor: seller) — mid-preparation issue (out of stock).</p>
          <p><strong>System side effects:</strong></p>
          <p>• Refund triggered (if payment was collected).</p>
          <p>• For bookings: slot released back to pool (<code className="text-[10px] bg-muted px-1 rounded">booked_count</code> decremented).</p>
          <p>• Cancellation policy enforced — late cancellation fee applied if within <code className="text-[10px] bg-muted px-1 rounded">cancellation_notice_hours</code>.</p>
          <p>• Both parties notified via push + in-app.</p>
          <p>• If system-cancelled (timeout): reason logged as "Seller did not respond within [X] minutes".</p>
        </DocInfoCard>

        <DocInfoCard title="failed (Terminal — Delivery Failure)" icon="⚠️">
          <p><strong>Triggered by:</strong> Delivery partner</p>
          <p><strong>When:</strong> Buyer unreachable at delivery, wrong address, or gate access denied.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">failed_reason</code> recorded (text description).</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">failure_owner</code> recorded (buyer, seller, or delivery — determines who bears cost).</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">attempt_count</code> incremented. Re-delivery may be attempted.</p>
          <p>• Admin notified for dispute resolution if needed.</p>
        </DocInfoCard>

        <DocInfoCard title="no_show (Terminal — Booking Specific)" icon="👻">
          <p><strong>Triggered by:</strong> System (automated) or Seller (manual)</p>
          <p><strong>When:</strong> A scheduled service session time passes without the buyer checking in or the service beginning.</p>
          <p>• No-show fee may be applied per seller's cancellation policy.</p>
          <p>• Seller's no-show rate metric updated.</p>
          <p>• Buyer notified with option to rebook.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── DATA MODEL ─── */}
      <DocSection title="4. Data Model (Complete Reference)">
        <DocInfoCard title="category_status_flows — Pipeline Definition" icon="📊">
          <p>Each row = one status step in a workflow. Ordered by <code className="text-[10px] bg-muted px-1 rounded">sort_order</code>.</p>
        </DocInfoCard>
        <DocTable
          headers={['Column', 'Type', 'Purpose']}
          rows={[
            ['parent_group', 'text', 'Category group (food_kitchen, services, retail, etc.)'],
            ['transaction_type', 'text', 'Flow type (cart_purchase, service_booking, request_service, self_fulfillment)'],
            ['status_key', 'text', 'Machine-readable status identifier'],
            ['sort_order', 'integer', 'Pipeline position (1, 2, 3…) — controls timeline display'],
            ['display_label', 'text', 'Human-readable label shown in UI timelines'],
            ['color', 'text', 'Badge color (blue, green, amber, red, etc.)'],
            ['icon', 'text', 'Lucide icon name for timeline nodes'],
            ['actor', 'text', 'Primary actor who triggers this status'],
            ['is_terminal', 'boolean', 'If true, no further transitions allowed'],
            ['buyer_hint', 'text', 'Contextual guidance shown to buyers'],
            ['seller_hint', 'text', 'Contextual guidance shown to sellers'],
          ]}
        />

        <DocInfoCard title="category_status_transitions — Transition Rules" icon="🔀">
          <p>Each row = one allowed status change. Multiple rows per status enable non-linear flows.</p>
        </DocInfoCard>
        <DocTable
          headers={['Column', 'Type', 'Purpose']}
          rows={[
            ['parent_group', 'text', 'Scoped to workflow'],
            ['transaction_type', 'text', 'Scoped to workflow'],
            ['from_status', 'text', 'Current status'],
            ['to_status', 'text', 'Target status'],
            ['allowed_actor', 'text', 'Who can perform this transition (buyer/seller/delivery/system/any)'],
          ]}
        />

        <DocInfoCard title="Workflow Resolution Priority" icon="🎯">
          <p>When the DB trigger needs to validate a transition, it checks in this order:</p>
          <p>1. <strong>Exact match</strong> — Look for (parent_group=food_kitchen, transaction_type=cart_purchase, from→to).</p>
          <p>2. <strong>Default fallback</strong> — Look for (parent_group=default, transaction_type=cart_purchase, from→to).</p>
          <p>3. <strong>Reject</strong> — If neither exists, the transition is blocked and the UPDATE is rolled back with an error.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── WORKFLOW TYPES DETAILED ─── */}
      <DocSection title="5. Workflow Types — Complete Pipelines">

        <DocInfoCard title="Cart Purchase (food_kitchen, retail, groceries)" icon="🛒">
          <DocTable
            headers={['Step', 'Status', 'Actor', 'Buyer Hint', 'Seller Hint', 'System Action']}
            rows={[
              ['1', 'placed', 'buyer', 'Waiting for seller', 'New order — review it', 'Buzzer + timer starts'],
              ['2', 'accepted', 'seller', 'Seller confirmed', 'Start preparing', 'Timer cleared'],
              ['3', 'preparing', 'seller', 'Being prepared', 'Prepare order items', 'Stall detection active'],
              ['4', 'ready', 'seller', 'Ready for pickup', 'Hand to delivery', 'Delivery assignment created'],
              ['5', 'picked_up', 'delivery', 'On the way!', '—', 'GPS tracking starts'],
              ['6', 'delivered', 'delivery', 'Delivered!', '—', 'OTP verified, review prompt'],
              ['7', 'completed', 'buyer', 'Complete', '—', 'Settlement eligible'],
              ['—', 'cancelled', 'any', 'Order cancelled', 'Order cancelled', 'Refund triggered'],
            ]}
          />
        </DocInfoCard>

        <DocInfoCard title="Service Booking (education, wellness, home_services)" icon="📅">
          <DocTable
            headers={['Step', 'Status', 'Actor', 'Buyer Hint', 'Seller Hint', 'System Action']}
            rows={[
              ['1', 'booking_requested', 'buyer', 'Waiting for confirmation', 'Review booking request', 'Slot soft-locked'],
              ['2', 'confirmed', 'seller', 'Booking confirmed', 'Slot locked in your calendar', 'Reminders scheduled'],
              ['3', 'scheduled', 'system', 'Session on [date]', 'Be ready before start', '24h + 1h reminders'],
              ['4', 'in_progress', 'seller', 'Session in progress', 'Session active', '—'],
              ['5', 'completed', 'seller', 'Session complete', 'Mark as done', 'Review prompt'],
              ['—', 'rescheduled', 'any', 'Being rescheduled', 'Buyer wants to reschedule', 'Old slot released'],
              ['—', 'cancelled', 'any', 'Booking cancelled', 'Booking cancelled', 'Slot released + fee check'],
              ['—', 'no_show', 'system', 'Marked as no-show', 'Buyer did not attend', 'No-show fee applied'],
            ]}
          />
        </DocInfoCard>

        <DocInfoCard title="Request Service / Enquiry (custom_services, interior)" icon="💬">
          <DocTable
            headers={['Step', 'Status', 'Actor', 'Buyer Hint', 'Seller Hint', 'System Action']}
            rows={[
              ['1', 'inquiry_sent', 'buyer', 'Enquiry sent', 'New enquiry received', 'Notification sent'],
              ['2', 'seller_responded', 'seller', 'Seller replied', 'Respond with quote', '—'],
              ['3', 'negotiation', 'any', 'Discussing details', 'Negotiate terms', 'Chat enabled'],
              ['4', 'confirmed', 'any', 'Service confirmed', 'Service confirmed', '—'],
              ['5', 'in_progress', 'seller', 'Work in progress', 'Complete the service', '—'],
              ['6', 'completed', 'any', 'Service complete', 'Mark done', 'Review prompt'],
              ['—', 'cancelled', 'any', 'Enquiry closed', 'Enquiry closed', '—'],
            ]}
          />
        </DocInfoCard>

        <DocInfoCard title="Self-Fulfillment / Pickup (any category)" icon="📦">
          <DocTable
            headers={['Step', 'Status', 'Actor', 'Buyer Hint', 'Seller Hint', 'System Action']}
            rows={[
              ['1', 'placed', 'buyer', 'Waiting for seller', 'New pickup order', 'Buzzer'],
              ['2', 'accepted', 'seller', 'Confirmed', 'Start preparing', '—'],
              ['3', 'preparing', 'seller', 'Being prepared', 'Prepare items', '—'],
              ['4', 'ready', 'seller', 'Ready for pickup!', 'Buyer will collect', 'Buyer notified + location shared'],
              ['5', 'completed', 'buyer', 'Picked up', '—', 'Review prompt'],
              ['—', 'cancelled', 'any', 'Cancelled', 'Cancelled', 'Refund if applicable'],
            ]}
          />
        </DocInfoCard>
      </DocSection>

      {/* ─── TRANSITION VALIDATION TRIGGER ─── */}
      <DocSection title="6. DB Trigger — How Validation Works">
        <p>The <code className="text-[10px] bg-muted px-1 rounded">validate_order_status_transition</code> trigger is the enforcement backbone. It fires on every <code className="text-[10px] bg-muted px-1 rounded">UPDATE</code> to <code className="text-[10px] bg-muted px-1 rounded">orders</code> where the status column changes.</p>

        <DocInfoCard title="Trigger Execution Flow" icon="⚙️">
          <DocFlowStep number={1} title="Detect Change" desc="OLD.status ≠ NEW.status → trigger fires. If status unchanged, trigger is skipped (no overhead)." />
          <DocFlowStep number={2} title="Resolve Product Category" desc="JOIN orders → products → category_config to get parent_group and transaction_type." />
          <DocFlowStep number={3} title="Query Specific Workflow" desc="SELECT from category_status_transitions WHERE parent_group = [resolved] AND transaction_type = [resolved] AND from_status = OLD.status AND to_status = NEW.status." />
          <DocFlowStep number={4} title="Fallback Query" desc="If step 3 returns no rows: retry with parent_group = 'default'. This ensures new categories work with the default pipeline." />
          <DocFlowStep number={5} title="Decision" desc="Row found → ALLOW the update (status changes). No row → RAISE EXCEPTION 'Invalid status transition: [old] → [new]' and the entire UPDATE is rolled back." />
        </DocInfoCard>

        <DocInfoCard title="What the Trigger Prevents" icon="🚫">
          <p>• <strong>Skipping steps</strong> — A seller can't go from <code className="text-[10px] bg-muted px-1 rounded">placed</code> directly to <code className="text-[10px] bg-muted px-1 rounded">ready</code> (must go through accepted → preparing → ready).</p>
          <p>• <strong>Wrong actor</strong> — A buyer can't mark an order as <code className="text-[10px] bg-muted px-1 rounded">preparing</code> (only seller-allowed transition).</p>
          <p>• <strong>Invalid backward moves</strong> — Can't go from <code className="text-[10px] bg-muted px-1 rounded">delivered</code> back to <code className="text-[10px] bg-muted px-1 rounded">preparing</code>.</p>
          <p>• <strong>Post-terminal changes</strong> — Once <code className="text-[10px] bg-muted px-1 rounded">completed</code> or <code className="text-[10px] bg-muted px-1 rounded">cancelled</code>, no transitions exist from those statuses, so no changes are possible.</p>
        </DocInfoCard>

        <DocInfoCard title="Performance" icon="⚡">
          <p>The trigger uses two dedicated indexes for constant-time lookups:</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">idx_cst_lookup</code> on <code className="text-[10px] bg-muted px-1 rounded">(parent_group, transaction_type, from_status)</code> — transition validation.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">idx_flows_lookup</code> on <code className="text-[10px] bg-muted px-1 rounded">(parent_group, transaction_type, sort_order)</code> — pipeline loading.</p>
          <p>Even with hundreds of workflows and thousands of orders/second, the trigger adds &lt;1ms overhead.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── FRONTEND INTEGRATION ─── */}
      <DocSection title="7. Frontend Integration — Hooks & UI">
        <DocInfoCard title="useCategoryStatusFlow(parentGroup, transactionType)" icon="🪝">
          <p><strong>Purpose:</strong> Loads the ordered status pipeline for rendering timelines and progress indicators.</p>
          <p><strong>Behavior:</strong></p>
          <p>• Queries <code className="text-[10px] bg-muted px-1 rounded">category_status_flows</code> for the given (parentGroup, transactionType) pair.</p>
          <p>• If no results: retries with parentGroup='default'.</p>
          <p>• Maps <code className="text-[10px] bg-muted px-1 rounded">booking</code> → <code className="text-[10px] bg-muted px-1 rounded">service_booking</code> automatically for backward compatibility.</p>
          <p><strong>Returns:</strong> <code className="text-[10px] bg-muted px-1 rounded">flowSteps[]</code> — array of {'{status_key, display_label, color, icon, buyer_hint, seller_hint, sort_order, is_terminal}'}.</p>
          <p><strong>Used by:</strong> OrderDetailPage timeline, OrdersMonitor status badges, SellerOrderCard status display.</p>
        </DocInfoCard>

        <DocInfoCard title="useStatusTransitions(parentGroup, transactionType)" icon="🪝">
          <p><strong>Purpose:</strong> Loads transition rules to determine what action buttons to show.</p>
          <p><strong>Returns:</strong> <code className="text-[10px] bg-muted px-1 rounded">transitions[]</code> — array of {'{from_status, to_status, allowed_actor}'}.</p>
          <p><strong>Usage example:</strong> Given current status=<code className="text-[10px] bg-muted px-1 rounded">accepted</code> and actor=seller, filter transitions to show "Mark Preparing" and "Cancel" buttons. If actor=buyer, show only "Cancel" (if allowed).</p>
        </DocInfoCard>

        <DocInfoCard title="Helper Functions" icon="🔧">
          <p>• <code className="text-[10px] bg-muted px-1 rounded">getFlowStepLabel(statusKey)</code> — Returns the display_label for a status from the loaded flow. Used in order timelines instead of hardcoded labels.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">getBuyerHint(statusKey)</code> — Returns the buyer_hint for the current status. Shown as a contextual message below the status badge.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">useStatusLabels()</code> — Returns a map of status_key → display_label for all statuses in a workflow. Used by OrdersMonitor for badge text.</p>
        </DocInfoCard>

        <DocInfoCard title="Where UI Reads Workflow Data" icon="🎨">
          <p>• <strong>OrderDetailPage</strong> — Timeline nodes, step labels, active step highlighting, buyer hints — all from <code className="text-[10px] bg-muted px-1 rounded">useCategoryStatusFlow</code>.</p>
          <p>• <strong>Seller Dashboard</strong> — Action buttons built from <code className="text-[10px] bg-muted px-1 rounded">useStatusTransitions</code> filtered by actor=seller.</p>
          <p>• <strong>OrdersMonitor (Admin)</strong> — Status column labels from <code className="text-[10px] bg-muted px-1 rounded">useStatusLabels()</code>.</p>
          <p>• <strong>Status Badges everywhere</strong> — Colors and icons from flow data, no hardcoded per-status styling.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── ADMIN WORKFLOW MANAGER ─── */}
      <DocSection title="8. Admin Workflow Manager">
        <p>Located at <strong>Admin → Commerce → Workflows</strong>. This is where platform admins create, edit, and validate workflow configurations.</p>

        <DocInfoCard title="Workflow List" icon="📋">
          <p>Shows all configured workflows, each identified by (parent_group, transaction_type). Cards display step count and a mini pipeline preview.</p>
          <p>Click any workflow to open the full editor.</p>
        </DocInfoCard>

        <DocInfoCard title="Step Editor" icon="🔧">
          <p>For each status in the pipeline, the admin can configure:</p>
          <p>• <strong>status_key</strong> — Machine identifier (lowercase_snake_case).</p>
          <p>• <strong>display_label</strong> — What buyers/sellers see.</p>
          <p>• <strong>buyer_hint</strong> — Contextual message for buyers at this status.</p>
          <p>• <strong>seller_hint</strong> — Contextual message for sellers at this status.</p>
          <p>• <strong>color</strong> — Badge color (e.g., blue, green, amber, red).</p>
          <p>• <strong>icon</strong> — Lucide icon name.</p>
          <p>• <strong>actor</strong> — Who triggers this status.</p>
          <p>• <strong>is_terminal</strong> — Toggle for terminal statuses.</p>
        </DocInfoCard>

        <DocInfoCard title="Transition Matrix" icon="🔀">
          <p>A visual matrix where admins toggle which actors can transition between which statuses.</p>
          <p>This is how non-linear flows (cancellation from multiple statuses, rescheduling loops) are configured.</p>
        </DocInfoCard>

        <DocInfoCard title="Save Validations" icon="✅">
          <p>On save, the editor runs these checks:</p>
          <p>• <strong>Terminal required</strong> — At least one status must be terminal. Otherwise, orders can never finish.</p>
          <p>• <strong>No duplicate keys</strong> — Each status_key must be unique in the workflow.</p>
          <p>• <strong>Orphan warning</strong> — Warns if a non-terminal status has no outgoing transitions (dead end).</p>
          <p>• <strong>Backward flow warning</strong> — Warns if any transition goes from a higher sort_order to a lower one (potential cycle). This is a warning only — rescheduling is a valid backward flow.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── CROSS-SYSTEM INTEGRATION ─── */}
      <DocSection title="9. Cross-System Integration">
        <DocInfoCard title="Delivery System" icon="🚚">
          <p>The workflow engine integrates tightly with delivery infrastructure:</p>
          <p>• <strong>ready status</strong> → creates <code className="text-[10px] bg-muted px-1 rounded">delivery_assignments</code> row with OTP, fee calculation, and rider assignment.</p>
          <p>• <strong>picked_up status</strong> → activates GPS tracking in <code className="text-[10px] bg-muted px-1 rounded">delivery_locations</code>.</p>
          <p>• <strong>delivered status</strong> → OTP verification, gate entry logging, rider pool update.</p>
          <p>• <strong>failed status</strong> → records failure reason and owner for dispute resolution.</p>
          <p>Delivery is a <strong>Society Feature</strong> — delivery partner pools are managed at the society level. Order tracking itself is a marketplace function.</p>
        </DocInfoCard>

        <DocInfoCard title="Notification System" icon="🔔">
          <p>Every status transition triggers notifications:</p>
          <p>• <strong>Push notifications</strong> via FCM/APNs to affected parties.</p>
          <p>• <strong>In-app notifications</strong> via <code className="text-[10px] bg-muted px-1 rounded">notification_queue</code>.</p>
          <p>• <strong>Seller buzzer</strong> (NewOrderAlertOverlay) for new orders.</p>
          <p>• <strong>Scheduled reminders</strong> for bookings (24h and 1h before).</p>
          <p>The notification content can reference <code className="text-[10px] bg-muted px-1 rounded">buyer_hint</code> / <code className="text-[10px] bg-muted px-1 rounded">seller_hint</code> from the workflow for contextual messaging.</p>
        </DocInfoCard>

        <DocInfoCard title="Payment & Settlement" icon="💳">
          <p>• Orders only become <strong>settlement-eligible</strong> when they reach a terminal success status (<code className="text-[10px] bg-muted px-1 rounded">completed</code>).</p>
          <p>• Cancellations trigger refund logic based on cancellation policy.</p>
          <p>• Platform fee percentage (from <code className="text-[10px] bg-muted px-1 rounded">admin_settings</code>) applied at settlement.</p>
          <p>• Coupon redemptions finalized or reversed based on terminal status.</p>
        </DocInfoCard>

        <DocInfoCard title="Review System" icon="⭐">
          <p>• Reviews are only enabled after <code className="text-[10px] bg-muted px-1 rounded">completed</code> status.</p>
          <p>• Review dimensions are category-specific (from <code className="text-[10px] bg-muted px-1 rounded">category_config.review_dimensions</code>).</p>
          <p>• Seller's aggregate rating recalculated on each new review.</p>
        </DocInfoCard>

        <DocInfoCard title="Audit Logging" icon="📝">
          <p>Every status transition is logged in <code className="text-[10px] bg-muted px-1 rounded">audit_log</code> with: action type, actor_id, target_id (order), metadata (old_status, new_status), and timestamp. This provides a complete, tamper-proof history of every order's lifecycle.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── FUTURE ROADMAP ─── */}
      <DocSection title="10. Future Roadmap">
        <DocInfoCard title="Planned Enhancements" icon="🚀">
          <p>• <strong>Workflow Simulation Mode</strong> — Admin can simulate an order flowing through all statuses to validate a workflow before it affects real orders.</p>
          <p>• <strong>Event-Driven Automation</strong> — Attach side-effect triggers to transitions (auto-send notification, create calendar event, schedule reminder) without code changes.</p>
          <p>• <strong>Full Actor Identity Validation</strong> — Pass caller identity via <code className="text-[10px] bg-muted px-1 rounded">SET app.actor = 'seller'</code> before each update so the trigger can enforce actor checks (not just transition existence).</p>
          <p>• <strong>Workflow Versioning</strong> — Track changes to workflows over time with version history and rollback capability.</p>
          <p>• <strong>Custom Webhook Triggers</strong> — Fire HTTP webhooks on specific transitions for external system integration (ERP, accounting, logistics APIs).</p>
        </DocInfoCard>
      </DocSection>
    </div>
  );
}
