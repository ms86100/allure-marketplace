import { DocHero, DocSection, DocSubSection, DocStep, DocInfoCard, DocList, DocTable } from './DocPrimitives';
import { ShoppingCart } from 'lucide-react';

export function MarketplaceShoppingDocs() {
  return (
    <div>
      <DocHero
        icon={ShoppingCart}
        title="Marketplace & Shopping"
        subtitle="Seller stores, product details, contact hub, cart, orders, subscriptions, collective buying, trust directory, and favorites."
      />

      <DocSection title="Seller Store Page (/seller/:id)">
        <p>Each seller has a dedicated store page showing their profile, products, and trust signals.</p>
        <DocSubSection title="Trust Signals">
          <DocList items={[
            'Activity badge — shows "Active today" or last active time based on seller activity',
            'Fulfillment mode — displays whether seller does delivery, pickup, or both',
            'Zero-cancellation badge — appears if seller has no order cancellations',
            'Recommend button — residents can recommend a seller to boost their trust score',
            'Star rating with review count from verified buyers',
          ]} />
        </DocSubSection>
        <p>Products are listed in a grid/list with category-appropriate action buttons. The store respects the seller's operating hours and shows an "Currently closed" banner when outside hours.</p>
      </DocSection>

      <DocSection title="Product Detail (ProductDetailSheet)">
        <p>Opens as a bottom sheet when tapping a product. Shows product images (carousel), name, price, description, seller info, and attribute blocks (dynamic fields configured per category). The primary action button is determined by the category's <code>action_type</code> — Add to Cart, Book, Contact, Request Quote, etc.</p>
        <DocInfoCard variant="info" title="Category-Driven Actions">
          Each product's action button is inherited from its category configuration. When an admin changes a category's listing type, all products in that category are automatically updated via a database trigger.
        </DocInfoCard>
      </DocSection>

      <DocSection title="Contact Seller Hub">
        <p>When a product's action type is "contact", the Contact Seller modal opens with three interaction options:</p>
        <DocSubSection title="Call Now">
          <p>Opens the device's phone dialer. The interaction is logged to <code>seller_contact_interactions</code>. After 5 seconds, a post-call feedback modal appears with 6 options: call connected with discussion, no agreement, seller didn't answer, number unreachable, agreement reached, or need more info.</p>
        </DocSubSection>
        <DocSubSection title="Message (Chat)">
          <p>Opens a real-time chat drawer backed by <code>seller_conversations</code> and <code>seller_conversation_messages</code> tables. Messages update in real-time via database subscriptions. Sending a message also enqueues a push notification to the seller.</p>
        </DocSubSection>
        <DocSubSection title="Post-Call Feedback">
          <p>Stored in the <code>call_feedback</code> table. Quick one-tap radio selection. Helps the platform track seller responsiveness and contact quality.</p>
        </DocSubSection>
      </DocSection>

      <DocSection title="Cart (/cart)">
        <DocList items={[
          'Multi-seller handling — items grouped by seller, each group shows seller name and delivery info',
          'First-order badge — new buyers see a "First Order" badge with any applicable welcome discount',
          'Preparation time and delivery window displayed per seller group',
          'Quantity adjustment with + / - buttons, swipe-to-delete with undo toast (5 second window)',
          'Price breakdown: subtotal, delivery fee, platform fee, coupon discount, refund tier indicator',
          'Coupon input field — validates against coupons table (seller-specific, society-specific, usage limits)',
          'Checkout creates order records in the orders table with line items in order_items',
        ]} />
      </DocSection>

      <DocSection title="Orders (/orders)">
        <p>Tabbed view: Active orders and Past orders. Each order card shows order number, seller name, total amount, item count, and current status with a color-coded badge. Tapping opens the Order Detail page.</p>
      </DocSection>

      <DocSection title="Order Detail (/orders/:id)">
        <DocList items={[
          'Full order timeline with status progression (category_status_flows table defines the flow)',
          'Service booking details — date, time slot, duration (for service categories)',
          'Live delivery tracker — when delivery is assigned, shows rider info, GPS location, ETA',
          'Order chat — messaging between buyer and seller within the order context',
          'Cancel/return actions available based on order status and category rules',
          'Payment summary with itemized breakdown',
        ]} />
      </DocSection>

      <DocSection title="Subscriptions (/subscriptions)">
        <p>Users can subscribe to recurring orders (e.g., daily milk, weekly vegetables). The subscription management page shows active subscriptions with controls to:</p>
        <DocList items={[
          'Pause — temporarily stop deliveries with a resume date',
          'Resume — reactivate a paused subscription',
          'Cancel — permanently end subscription with confirmation dialog',
          'View delivery history and upcoming schedule',
        ]} />
      </DocSection>

      <DocSection title="Collective Buy (/group-buys)">
        <p>Community-powered group purchasing. A resident creates a collective buy request (product name, minimum quantity, target price, expiry date). Other residents join by adding their desired quantity.</p>
        <DocList items={[
          'Create request — product details, min quantity threshold, optional target price, expiry date',
          'Join — add quantity to an existing request',
          'Leave — withdraw participation before the request is fulfilled',
          'Status: open → fulfilled (when min quantity met) → expired (if deadline passed)',
          'Progress bar shows current vs. minimum quantity',
        ]} />
      </DocSection>

      <DocSection title="Trust Directory (/directory)">
        <p>A skill-sharing and endorsement system (not a seller directory). Residents list skills they can offer or help with. Other residents can endorse skills, increasing trust scores.</p>
        <DocList items={[
          'skill_listings table: user_id, skill_name, description, trust_score, endorsement_count',
          'Endorsements from fellow residents boost visibility',
          'Displayed on user profiles as skill badges',
        ]} />
      </DocSection>

      <DocSection title="Favorites (/favorites)">
        <p>Users can heart/favorite products from any listing. The favorites page shows all saved items with quick navigation to the product detail or seller store. Stored in the <code>favorites</code> table with user_id and product_id.</p>
      </DocSection>
    </div>
  );
}
