import { DocHero, DocSection, DocSubSection, DocStep, DocInfoCard, DocList, DocTable } from './DocPrimitives';
import { Store } from 'lucide-react';

export function SellerToolsDocs() {
  return (
    <div>
      <DocHero
        icon={Store}
        title="Seller Tools"
        subtitle="Onboarding wizard, dashboard with 4 tabs, product management, earnings, and store settings."
      />

      <DocSection title="Become a Seller (/become-seller)">
        <p>A 6-step onboarding wizard guides residents through setting up their seller profile:</p>
        <DocStep number={1} title="Category Group">
          <p>Select which parent group your business belongs to (Food, Services, Products, Rentals, etc.).</p>
        </DocStep>
        <DocStep number={2} title="Specialization">
          <p>Choose specific service categories within the group (e.g., under Food: Home Cooking, Tiffin Service, Bakery).</p>
        </DocStep>
        <DocStep number={3} title="Store Details">
          <p>Enter store name, description, phone number, and optional logo upload.</p>
        </DocStep>
        <DocStep number={4} title="Configuration">
          <p>Set operating hours, delivery/pickup preferences, service area, and payment methods accepted.</p>
        </DocStep>
        <DocStep number={5} title="Products">
          <p>Add initial products/services with images, pricing, and descriptions.</p>
        </DocStep>
        <DocStep number={6} title="Review & Submit">
          <p>Review all details. On submission, creates a seller_profiles record with status "pending". Admin must approve before the store goes live.</p>
        </DocStep>

        <DocInfoCard variant="warning" title="Admin Approval Required">
          New seller applications require admin approval. The admin sees pending applications in the Admin Panel → Sellers tab with full details for review.
        </DocInfoCard>
      </DocSection>

      <DocSection title="Seller Dashboard (/seller)">
        <p>The main hub for active sellers, organized into 4 tabs:</p>

        <DocSubSection title="Orders Tab">
          <p>Lists incoming and active orders with filter counts (New, In Progress, Ready, Completed). Each order card shows buyer name, items, total, and time since order. Quick-action buttons for status transitions (Accept, Mark Ready, etc.).</p>
        </DocSubSection>

        <DocSubSection title="Schedule Tab">
          <p>Calendar view of upcoming bookings and service appointments. Conditional service widgets appear based on seller's categories (e.g., time-slot management for service sellers). Shows today's schedule and upcoming week.</p>
        </DocSubSection>

        <DocSubSection title="Tools Tab">
          <DocList items={[
            'Coupon Manager — Create, edit, and manage discount coupons (percentage or fixed amount, usage limits, date ranges, minimum order amounts)',
            'Product management shortcut — Quick link to /seller/products',
            'Store settings shortcut — Quick link to /seller/settings',
            'Analytics overview — Quick stats summary',
          ]} />
        </DocSubSection>

        <DocSubSection title="Stats Tab">
          <DocList items={[
            'Revenue analytics — daily, weekly, monthly charts',
            'Order volume trends',
            'Top-selling products',
            'Demand insights — what buyers are searching for in the seller\'s categories',
            'Customer retention metrics',
          ]} />
        </DocSubSection>
      </DocSection>

      <DocSection title="Product Management (/seller/products)">
        <DocList items={[
          'Add/edit products with name, description, price, images',
          'AI image upload — optional AI-powered image enhancement',
          'Attribute blocks — dynamic fields configured per category (e.g., cuisine type for food, duration for services)',
          'Service-specific fields — availability windows, duration, staff assignment',
          'Bulk upload support for inventory-heavy sellers',
          'Veg/non-veg toggle for food categories',
          'Stock management with in-stock/out-of-stock toggle',
        ]} />
      </DocSection>

      <DocSection title="Earnings (/seller/earnings)">
        <p>Settlement table from <code>payment_settlements</code> showing completed payouts. Displays settlement date, order count, gross amount, platform fee, and net payout. Summary cards show total earnings, pending settlements, and this month's revenue.</p>
      </DocSection>

      <DocSection title="Store Settings (/seller/settings)">
        <DocList items={[
          'Store profile — name, description, logo, contact info',
          'Operating hours — set daily open/close times',
          'Conditional service availability — enable/disable services by day of week',
          'Staff management — add/manage staff members who can fulfill orders',
          'License upload — required licenses/certifications for regulated categories (e.g., FSSAI for food)',
          'Delivery settings — delivery radius, minimum order, delivery fee',
          'Payment preferences — accepted payment methods',
        ]} />
      </DocSection>

      <DocSection title="New Order Alerts">
        <DocInfoCard variant="info" title="Real-Time Notifications">
          Sellers receive real-time push notifications and an in-app overlay (NewOrderAlertOverlay) when a new order arrives. The alert includes order details and quick-accept action. Uses database realtime subscriptions on the orders table.
        </DocInfoCard>
      </DocSection>
    </div>
  );
}
