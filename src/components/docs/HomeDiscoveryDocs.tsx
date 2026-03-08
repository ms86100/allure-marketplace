import { DocHero, DocSection, DocSubSection, DocStep, DocInfoCard, DocList } from './DocPrimitives';
import { Home } from 'lucide-react';

export function HomeDiscoveryDocs() {
  return (
    <div>
      <DocHero
        icon={Home}
        title="Home & Discovery"
        subtitle="The buyer's landing page: marketplace sections, reorder shortcuts, society quick-links, and community teasers."
      />

      <DocSection title="Home Page Layout">
        <p>The home page (/) is the primary entry point for authenticated, approved users. It renders inside AppLayout (bottom navigation bar, header with notifications). The page loads a skeleton while profile data resolves.</p>

        <DocSubSection title="Key Sections (top to bottom)">
          <DocList items={[
            'MarketplaceSection — Category group chips (horizontal scroll), featured banners carousel, and product grids organized by parent groups',
            'ReorderLastOrder — If the user has a previous order, shows a one-tap "Reorder" card with order summary',
            'SocietyQuickLinks — Grid of quick-access links (Visitors, Parking, Workforce, Parcels, etc.) relevant to the user\'s society features',
            'CommunityTeaser — Preview of recent bulletin posts to encourage community engagement',
          ]} />
        </DocSubSection>
      </DocSection>

      <DocSection title="Search Page">
        <p>The /search page provides a full-text search across products and sellers. Debounced input triggers queries against the products table with category and name matching. Results display as compact listing cards.</p>
      </DocSection>

      <DocSection title="Categories & Category Groups">
        <DocSubSection title="Categories Page (/categories)">
          <p>Displays all active category groups (parent_groups table) as visual cards with icons and colors. Each card links to its category group page.</p>
        </DocSubSection>

        <DocSubSection title="Category Group Page (/category/:category)">
          <p>Shows all sellers and products within a specific category group. Sellers are displayed as store cards with trust signals. Products use the ListingCard component with category-specific action buttons (Add to Cart, Book, Contact, etc.).</p>
        </DocSubSection>
      </DocSection>

      <DocSection title="Feature Gating">
        <DocInfoCard variant="tip" title="Dynamic Feature Flags">
          Society quick-links and certain home page sections are conditionally rendered based on the society's enabled features (useEffectiveFeatures hook). Features like visitor management, parking, workforce management, and delivery can be toggled per society.
        </DocInfoCard>
      </DocSection>

      <DocSection title="Navigation">
        <DocList items={[
          'Bottom tab bar: Home, Categories, Community, Cart, Profile',
          'Header: Society name, notification bell with unread count',
          'Deep linking supported via HashRouter — all routes work within Capacitor mobile wrapper',
        ]} />
      </DocSection>
    </div>
  );
}
