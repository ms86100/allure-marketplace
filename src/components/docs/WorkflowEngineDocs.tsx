import { DocHero, DocSection, DocInfoCard, DocTable, DocFlowStep } from './DocPrimitives';
import { GitBranch } from 'lucide-react';

export function WorkflowEngineDocs() {
  return (
    <div className="space-y-2">
      <DocHero
        icon={GitBranch}
        title="Dynamic Workflow Engine"
        description="A fully database-driven, admin-configurable workflow system that controls order and booking lifecycles. Supports actor-based transitions, per-category pipelines, seller/buyer hints, and real-time validation via database triggers."
        badges={['Admin', 'DB-Driven', 'Actor Validation', 'Configurable']}
      />

      {/* ─── ARCHITECTURE OVERVIEW ─── */}
      <DocSection title="1. Architecture Overview">
        <p>The workflow engine replaces hardcoded status arrays with a fully dynamic system. Every order or booking follows a <strong>status pipeline</strong> defined per <code className="text-[10px] bg-muted px-1 rounded">(parent_group, transaction_type)</code> combination.</p>

        <DocInfoCard title="Core Concept" icon="🧩">
          <p>Instead of code like <code className="text-[10px] bg-muted px-1 rounded">if (status === 'placed') nextStatus = 'accepted'</code>, the engine reads allowed transitions from the database. This means:</p>
          <p>• Admins can add, remove, or reorder statuses without code changes.</p>
          <p>• Different categories can have completely different lifecycles.</p>
          <p>• Actor-based rules control <em>who</em> can trigger each transition.</p>
        </DocInfoCard>

        <DocInfoCard title="System Architecture Diagram" icon="📐">
          <p>The engine consists of four layers working together:</p>
          <p className="mt-2 font-semibold text-foreground text-xs">Data Layer</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">category_status_flows</code> — Ordered status pipeline per workflow (status_key, sort_order, display_label, color, icon, buyer_hint, seller_hint, actor, is_terminal).</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">category_status_transitions</code> — Actor-based transition rules (from_status → to_status → allowed_actor) per workflow.</p>
          <p className="mt-2 font-semibold text-foreground text-xs">Enforcement Layer</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">validate_order_status_transition</code> — Database trigger that fires on every order status update. Validates the transition against the transitions table and rejects unauthorized moves.</p>
          <p className="mt-2 font-semibold text-foreground text-xs">Frontend Layer</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">useCategoryStatusFlow</code> — Loads the status pipeline for a given workflow. Falls back to <code className="text-[10px] bg-muted px-1 rounded">default</code> parent_group if no specific workflow exists.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">useStatusTransitions</code> — Loads allowed transitions for building action buttons.</p>
          <p className="mt-2 font-semibold text-foreground text-xs">Admin Layer</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">AdminWorkflowManager</code> — Visual editor for creating and editing workflows, statuses, and transition rules.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── DATA MODEL ─── */}
      <DocSection title="2. Data Model">
        <DocInfoCard title="category_status_flows Table" icon="📊">
          <p>Each row represents one status step in a workflow pipeline.</p>
        </DocInfoCard>
        <DocTable
          headers={['Column', 'Type', 'Purpose']}
          rows={[
            ['parent_group', 'text', 'Category group (e.g., food_kitchen, services)'],
            ['transaction_type', 'text', 'Flow type (cart_purchase, service_booking, request_service, self_fulfillment)'],
            ['status_key', 'text', 'Machine-readable status (e.g., placed, accepted, preparing)'],
            ['sort_order', 'integer', 'Position in the pipeline (1, 2, 3…)'],
            ['display_label', 'text', 'Human-readable label for UI (e.g., "Order Placed")'],
            ['color', 'text', 'Status badge color (e.g., blue, green, amber)'],
            ['icon', 'text', 'Lucide icon name for timeline display'],
            ['actor', 'text', 'Who typically triggers this status (buyer, seller, system, delivery)'],
            ['is_terminal', 'boolean', 'Whether this is a final status (completed, cancelled, failed)'],
            ['buyer_hint', 'text', 'Guidance shown to buyers (e.g., "Seller is preparing your order")'],
            ['seller_hint', 'text', 'Guidance shown to sellers (e.g., "Start preparing the order")'],
          ]}
        />

        <DocInfoCard title="category_status_transitions Table" icon="🔀">
          <p>Each row defines one allowed transition between statuses, scoped to a specific actor.</p>
        </DocInfoCard>
        <DocTable
          headers={['Column', 'Type', 'Purpose']}
          rows={[
            ['parent_group', 'text', 'Matches the workflow\'s parent_group'],
            ['transaction_type', 'text', 'Matches the workflow\'s transaction_type'],
            ['from_status', 'text', 'Source status (e.g., placed)'],
            ['to_status', 'text', 'Target status (e.g., accepted)'],
            ['allowed_actor', 'text', 'Who can trigger this transition (buyer, seller, system, delivery, any)'],
          ]}
        />
      </DocSection>

      {/* ─── WORKFLOW TYPES ─── */}
      <DocSection title="3. Supported Workflow Types">
        <DocInfoCard title="Cart Purchase (Products)" icon="🛒">
          <DocFlowStep number={1} title="placed" desc="Buyer places the order. Seller receives an alert." />
          <DocFlowStep number={2} title="accepted" desc="Seller accepts and begins preparation." />
          <DocFlowStep number={3} title="preparing" desc="Order is being prepared." />
          <DocFlowStep number={4} title="ready" desc="Order is ready for pickup or delivery." />
          <DocFlowStep number={5} title="picked_up" desc="Delivery partner has collected the order." />
          <DocFlowStep number={6} title="delivered" desc="Order delivered to the buyer." />
          <DocFlowStep number={7} title="completed" desc="Order confirmed complete. Terminal status." />
        </DocInfoCard>

        <DocInfoCard title="Service Booking" icon="📅">
          <DocFlowStep number={1} title="booking_requested" desc="Buyer selects a time slot and submits booking." />
          <DocFlowStep number={2} title="confirmed" desc="Seller confirms the booking." />
          <DocFlowStep number={3} title="scheduled" desc="Booking is locked into the calendar." />
          <DocFlowStep number={4} title="in_progress" desc="Service session is underway." />
          <DocFlowStep number={5} title="completed" desc="Service delivered successfully. Terminal status." />
        </DocInfoCard>

        <DocInfoCard title="Request Service (Enquiry)" icon="💬">
          <DocFlowStep number={1} title="inquiry_sent" desc="Buyer sends an enquiry or service request." />
          <DocFlowStep number={2} title="seller_responded" desc="Seller responds with availability/quote." />
          <DocFlowStep number={3} title="negotiation" desc="Back-and-forth discussion on scope/pricing." />
          <DocFlowStep number={4} title="confirmed" desc="Both parties agree. Service is confirmed." />
          <DocFlowStep number={5} title="in_progress" desc="Service work is underway." />
          <DocFlowStep number={6} title="completed" desc="Service fulfilled. Terminal status." />
        </DocInfoCard>

        <DocInfoCard title="Self-Fulfillment (Pickup)" icon="📦">
          <DocFlowStep number={1} title="placed" desc="Buyer places a pickup order." />
          <DocFlowStep number={2} title="accepted" desc="Seller accepts." />
          <DocFlowStep number={3} title="preparing" desc="Order being prepared." />
          <DocFlowStep number={4} title="ready" desc="Ready for buyer pickup." />
          <DocFlowStep number={5} title="completed" desc="Buyer picked up. Terminal status." />
        </DocInfoCard>

        <DocInfoCard title="Default Fallback" icon="🔄">
          <p>If no workflow is defined for a specific <code className="text-[10px] bg-muted px-1 rounded">parent_group</code>, the system falls back to the <code className="text-[10px] bg-muted px-1 rounded">default</code> parent_group's workflow. This ensures every order has a valid lifecycle even before custom workflows are configured.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── TRANSITION VALIDATION ─── */}
      <DocSection title="4. Transition Validation (DB Trigger)">
        <p>A PostgreSQL trigger named <code className="text-[10px] bg-muted px-1 rounded">validate_order_status_transition</code> fires on every <code className="text-[10px] bg-muted px-1 rounded">UPDATE</code> to the orders table when the status changes.</p>

        <DocInfoCard title="Validation Flow" icon="🛡️">
          <DocFlowStep number={1} title="Status Change Detected" desc="Trigger fires when OLD.status ≠ NEW.status on the orders table." />
          <DocFlowStep number={2} title="Lookup Workflow" desc="Resolves the product's parent_group + transaction_type from category_config." />
          <DocFlowStep number={3} title="Check Transition" desc="Queries category_status_transitions for a matching (from → to) rule." />
          <DocFlowStep number={4} title="Fallback to Default" desc="If no rule found for the specific parent_group, checks the 'default' parent_group." />
          <DocFlowStep number={5} title="Accept or Reject" desc="If a valid transition exists → allows the update. Otherwise → raises an exception and rolls back." />
        </DocInfoCard>

        <DocInfoCard title="Actor Enforcement" icon="👤">
          <p>The <code className="text-[10px] bg-muted px-1 rounded">allowed_actor</code> field supports these values:</p>
          <p>• <strong>buyer</strong> — Only the buyer can trigger (e.g., placing an order, confirming delivery).</p>
          <p>• <strong>seller</strong> — Only the seller can trigger (e.g., accepting, marking ready).</p>
          <p>• <strong>delivery</strong> — Only the delivery system (e.g., picked_up, delivered).</p>
          <p>• <strong>system</strong> — Automated transitions (e.g., auto-cancellation after timeout).</p>
          <p>• <strong>any</strong> — Any actor can trigger (e.g., cancellation from either party).</p>
        </DocInfoCard>

        <DocInfoCard title="Special Transitions" icon="⚡">
          <p>Some transitions are <strong>non-linear</strong> and can happen from multiple statuses:</p>
          <p>• <strong>Cancellation</strong> — <code className="text-[10px] bg-muted px-1 rounded">placed → cancelled</code>, <code className="text-[10px] bg-muted px-1 rounded">accepted → cancelled</code>, <code className="text-[10px] bg-muted px-1 rounded">preparing → cancelled</code> (actor: any).</p>
          <p>• <strong>Rescheduling</strong> — <code className="text-[10px] bg-muted px-1 rounded">scheduled → rescheduled → confirmed</code> (forms a valid backward flow).</p>
          <p>• <strong>Failure</strong> — <code className="text-[10px] bg-muted px-1 rounded">picked_up → failed</code> (delivery failure).</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── FRONTEND INTEGRATION ─── */}
      <DocSection title="5. Frontend Integration">
        <DocInfoCard title="useCategoryStatusFlow Hook" icon="🪝">
          <p>Loads the ordered status pipeline for rendering timelines, progress bars, and status badges.</p>
          <p>• Accepts <code className="text-[10px] bg-muted px-1 rounded">parentGroup</code> and <code className="text-[10px] bg-muted px-1 rounded">transactionType</code>.</p>
          <p>• Automatically maps <code className="text-[10px] bg-muted px-1 rounded">booking</code> → <code className="text-[10px] bg-muted px-1 rounded">service_booking</code> for compatibility.</p>
          <p>• Falls back to <code className="text-[10px] bg-muted px-1 rounded">default</code> parent_group when no specific flow exists.</p>
          <p>• Returns: <code className="text-[10px] bg-muted px-1 rounded">flowSteps[]</code> with display_label, color, icon, buyer_hint, seller_hint.</p>
        </DocInfoCard>

        <DocInfoCard title="useStatusTransitions Hook" icon="🪝">
          <p>Loads the transition rules for building contextual action buttons.</p>
          <p>• Given the current status, returns which statuses the current actor can move to.</p>
          <p>• Used by seller dashboard ("Accept", "Mark Ready") and buyer order detail ("Cancel").</p>
        </DocInfoCard>

        <DocInfoCard title="UI Integration Points" icon="🎨">
          <p>• <strong>Order Timeline</strong> — Labels come from <code className="text-[10px] bg-muted px-1 rounded">getFlowStepLabel()</code> which reads display_label from the DB flow.</p>
          <p>• <strong>Buyer Hints</strong> — Contextual messages via <code className="text-[10px] bg-muted px-1 rounded">getBuyerHint()</code> (e.g., "Your order is being prepared").</p>
          <p>• <strong>Orders Monitor</strong> — Status labels use <code className="text-[10px] bg-muted px-1 rounded">useStatusLabels()</code> hook instead of hardcoded maps.</p>
          <p>• <strong>Status Badges</strong> — Colors and icons from the flow data, no hardcoded styling per status.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── ADMIN WORKFLOW MANAGER ─── */}
      <DocSection title="6. Admin Workflow Manager">
        <p>Located under <strong>Admin → Commerce → Workflows</strong>, this is the visual editor for managing all workflow configurations.</p>

        <DocInfoCard title="Workflow List View" icon="📋">
          <p>Displays all configured workflows grouped by <code className="text-[10px] bg-muted px-1 rounded">(parent_group, transaction_type)</code>. Each card shows:</p>
          <p>• Parent group name and transaction type badge.</p>
          <p>• Number of steps in the pipeline.</p>
          <p>• Quick preview of the status sequence.</p>
        </DocInfoCard>

        <DocInfoCard title="Pipeline Editor" icon="🔧">
          <p>When editing a workflow, the admin can configure each status step:</p>
          <p>• <strong>Status Key</strong> — Machine-readable identifier (e.g., <code className="text-[10px] bg-muted px-1 rounded">preparing</code>).</p>
          <p>• <strong>Display Label</strong> — Human-readable name (e.g., "Being Prepared").</p>
          <p>• <strong>Buyer Hint</strong> — Message shown to buyers at this status.</p>
          <p>• <strong>Seller Hint</strong> — Message shown to sellers at this status.</p>
          <p>• <strong>Color & Icon</strong> — Visual styling for badges and timelines.</p>
          <p>• <strong>Actor</strong> — Who triggers this status (buyer/seller/system/delivery).</p>
          <p>• <strong>Terminal Toggle</strong> — Marks whether this is a final status.</p>
          <p>Steps can be added, removed, and reordered via drag or sort controls.</p>
        </DocInfoCard>

        <DocInfoCard title="Transition Rules Editor" icon="🔀">
          <p>For each status, the admin can configure which target statuses each actor can transition to. This is displayed as a matrix of toggles:</p>
          <p>• Rows = source statuses.</p>
          <p>• Columns = target statuses × actor.</p>
          <p>• Toggle on = transition allowed. Toggle off = transition blocked.</p>
          <p>This allows precise control over non-linear flows like cancellations and rescheduling.</p>
        </DocInfoCard>

        <DocInfoCard title="Built-in Validations" icon="✅">
          <p>The editor prevents broken workflows with these checks on save:</p>
          <p>• <strong>Terminal Status Required</strong> — At least one status must be marked terminal.</p>
          <p>• <strong>No Duplicate Keys</strong> — Every status_key must be unique within the workflow.</p>
          <p>• <strong>Orphan Detection</strong> — Warns if a non-terminal status has no outgoing transitions.</p>
          <p>• <strong>Cycle Detection</strong> — Warns if a transition goes from a higher sort_order to a lower one (potential backward flow). This is a warning, not a block, since rescheduling is a valid backward flow.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── PERFORMANCE ─── */}
      <DocSection title="7. Performance & Indexing">
        <DocInfoCard title="Database Indexes" icon="⚡">
          <p>Two specialized indexes ensure workflow queries remain fast at scale:</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">idx_flows_lookup</code> — On <code className="text-[10px] bg-muted px-1 rounded">(parent_group, transaction_type, sort_order)</code> for fast pipeline loading.</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">idx_cst_lookup</code> — On <code className="text-[10px] bg-muted px-1 rounded">(parent_group, transaction_type, from_status)</code> for fast transition validation in the trigger.</p>
          <p>These indexes make the trigger validation a constant-time operation regardless of how many workflows exist.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── EXAMPLE SCENARIO ─── */}
      <DocSection title="8. Example: Food Order Lifecycle">
        <p>Here's how the workflow engine handles a typical food order from start to finish:</p>

        <DocInfoCard title="Scenario Walkthrough" icon="🍕">
          <DocFlowStep number={1} title="Buyer places order" desc="Status: placed. Workflow: food_kitchen / cart_purchase. Buyer hint: 'Order sent to seller'. Seller hint: 'New order received — review it'." />
          <DocFlowStep number={2} title="Seller accepts" desc="Transition: placed → accepted (actor: seller). DB trigger validates this transition exists. Buyer hint: 'Seller confirmed your order'." />
          <DocFlowStep number={3} title="Seller starts cooking" desc="Transition: accepted → preparing (actor: seller). Buyer hint: 'Your food is being prepared'. Seller hint: 'Start preparing the order'." />
          <DocFlowStep number={4} title="Food is ready" desc="Transition: preparing → ready (actor: seller). Delivery system is notified. Buyer hint: 'Almost there! Order is ready'." />
          <DocFlowStep number={5} title="Rider picks up" desc="Transition: ready → picked_up (actor: delivery). Buyer sees live tracking. Buyer hint: 'On the way to you'." />
          <DocFlowStep number={6} title="Delivered" desc="Transition: picked_up → delivered (actor: delivery). OTP verification at gate. Buyer hint: 'Delivered! Enjoy your meal'." />
          <DocFlowStep number={7} title="Completed" desc="Transition: delivered → completed (actor: buyer). Terminal status. Review prompt appears." />
        </DocInfoCard>

        <DocInfoCard title="Cancellation (Non-Linear)" icon="❌">
          <p>At any point before <code className="text-[10px] bg-muted px-1 rounded">ready</code>, either party can cancel:</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">placed → cancelled</code> (actor: any)</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">accepted → cancelled</code> (actor: any)</p>
          <p>• <code className="text-[10px] bg-muted px-1 rounded">preparing → cancelled</code> (actor: seller only)</p>
          <p>The trigger validates the actor has permission for the specific transition.</p>
        </DocInfoCard>
      </DocSection>

      {/* ─── FUTURE ROADMAP ─── */}
      <DocSection title="9. Future Roadmap">
        <DocInfoCard title="Planned Enhancements" icon="🚀">
          <p>• <strong>Workflow Simulation Mode</strong> — Admin can simulate an order flowing through all statuses to validate a workflow before deployment.</p>
          <p>• <strong>Event-Driven Automation</strong> — Trigger side effects (notifications, calendar events, reminders) automatically when a status transition occurs.</p>
          <p>• <strong>Full Actor Identity Validation</strong> — Pass caller identity via <code className="text-[10px] bg-muted px-1 rounded">app.actor</code> PostgreSQL setting to enforce actor checks at the database level.</p>
          <p>• <strong>Workflow Versioning</strong> — Track changes to workflows over time, allowing rollback to previous configurations.</p>
        </DocInfoCard>
      </DocSection>
    </div>
  );
}
