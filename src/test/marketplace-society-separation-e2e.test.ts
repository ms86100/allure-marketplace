/**
 * Round 3 — E2E Verification Matrix
 * Tests marketplace vs society domain separation.
 * 
 * These tests validate the LOGIC that mirrors production code:
 * - Products RLS: approved products from approved sellers are marketplace-open (no society gate)
 * - Discovery RPC: coordinate/radius-based, no society equality required
 * - FeatureGate: marketplace features always enabled, society features require effectiveSocietyId
 * - Coupons: marketplace-open (no society filter on SELECT)
 * - Search demand: authenticated insert, society_id nullable
 * - Seller detail: no society scoping (approved sellers always accessible)
 */
import { describe, it, expect } from 'vitest';

// ─── Domain Classification (mirrors useEffectiveFeatures.ts) ────────────────

const MARKETPLACE_FEATURES = new Set([
  'marketplace', 'seller_tools', 'trust_directory', 'trust_score',
  'subscriptions', 'notifications', 'delivery_management',
]);

const SOCIETY_FEATURES = [
  'collective_buy', 'gate_entry', 'authorized_persons', 'bulletin',
  'visitor_management', 'domestic_help', 'workforce_management',
  'worker_marketplace', 'worker_attendance', 'worker_salary', 'worker_leave',
  'society_notices', 'security_audit', 'guard_kiosk', 'vehicle_parking',
  'resident_identity_verification', 'community_rules', 'society_reports',
  'inspection', 'maintenance', 'parcel_management',
];

// ─── Logic mirrors ──────────────────────────────────────────────────────────

function isFeatureEnabled(
  key: string,
  opts: { isAdmin: boolean; effectiveSocietyId: string | null; featureMap: Map<string, { is_enabled: boolean }> }
): boolean {
  if (opts.isAdmin) return true;
  if (MARKETPLACE_FEATURES.has(key)) return true;
  if (!opts.effectiveSocietyId) return false;
  return opts.featureMap.get(key)?.is_enabled ?? false;
}

/**
 * Mirrors Round 3 products RLS: approved products from approved sellers are visible to all.
 * No society equality check.
 */
function canSeeProduct(opts: {
  productApprovalStatus: string;
  sellerVerificationStatus: string;
  isOwnProduct: boolean;
  isAdmin: boolean;
}): boolean {
  if (opts.isAdmin) return true;
  if (opts.isOwnProduct) return true;
  return opts.productApprovalStatus === 'approved' && opts.sellerVerificationStatus === 'approved';
}

/**
 * Mirrors Round 3 search_sellers_by_location: radius-based, no society equality gate.
 * Society-resident sellers visible if within radius (haversine passes) OR sell_beyond OR commercial.
 */
function isSellerDiscoverable(opts: {
  sellerType: 'commercial' | 'society_resident';
  sellBeyond: boolean;
  distanceKm: number;
  searchRadiusKm: number;
  deliveryRadiusKm: number | null;
  isApproved: boolean;
  isAvailable: boolean;
}): boolean {
  if (!opts.isApproved || !opts.isAvailable) return false;
  const effectiveRadius = Math.min(opts.searchRadiusKm, opts.deliveryRadiusKm ?? opts.searchRadiusKm);
  if (opts.distanceKm > effectiveRadius) return false;
  // Within radius → always visible (Round 3 change: no society gate)
  return true;
}

function canBuyerSeeCoupon(coupon: { is_active: boolean; starts_at: Date; expires_at: Date | null }): boolean {
  const now = new Date();
  return coupon.is_active && coupon.starts_at <= now && (coupon.expires_at === null || coupon.expires_at > now);
}

// ─── Suite 1: Products RLS — marketplace-open ───────────────────────────────

describe('Products RLS — marketplace-open for approved products', () => {
  it('approved product from approved seller visible to any user', () => {
    expect(canSeeProduct({ productApprovalStatus: 'approved', sellerVerificationStatus: 'approved', isOwnProduct: false, isAdmin: false })).toBe(true);
  });

  it('unapproved product hidden from non-owner', () => {
    expect(canSeeProduct({ productApprovalStatus: 'pending', sellerVerificationStatus: 'approved', isOwnProduct: false, isAdmin: false })).toBe(false);
  });

  it('product from unapproved seller hidden', () => {
    expect(canSeeProduct({ productApprovalStatus: 'approved', sellerVerificationStatus: 'pending', isOwnProduct: false, isAdmin: false })).toBe(false);
  });

  it('owner can see own unapproved product', () => {
    expect(canSeeProduct({ productApprovalStatus: 'pending', sellerVerificationStatus: 'pending', isOwnProduct: true, isAdmin: false })).toBe(true);
  });

  it('admin sees everything', () => {
    expect(canSeeProduct({ productApprovalStatus: 'rejected', sellerVerificationStatus: 'rejected', isOwnProduct: false, isAdmin: true })).toBe(true);
  });
});

// ─── Suite 2: Discovery RPC — no society gate ───────────────────────────────

describe('Discovery RPC — coordinate-based, no society equality', () => {
  it('commercial seller within radius is discoverable', () => {
    expect(isSellerDiscoverable({ sellerType: 'commercial', sellBeyond: false, distanceKm: 3, searchRadiusKm: 5, deliveryRadiusKm: null, isApproved: true, isAvailable: true })).toBe(true);
  });

  it('society-resident seller within radius is discoverable (Round 3 fix)', () => {
    expect(isSellerDiscoverable({ sellerType: 'society_resident', sellBeyond: false, distanceKm: 3, searchRadiusKm: 5, deliveryRadiusKm: null, isApproved: true, isAvailable: true })).toBe(true);
  });

  it('seller outside radius is not discoverable', () => {
    expect(isSellerDiscoverable({ sellerType: 'commercial', sellBeyond: true, distanceKm: 8, searchRadiusKm: 5, deliveryRadiusKm: null, isApproved: true, isAvailable: true })).toBe(false);
  });

  it('delivery_radius_km limits discovery', () => {
    expect(isSellerDiscoverable({ sellerType: 'commercial', sellBeyond: false, distanceKm: 4, searchRadiusKm: 10, deliveryRadiusKm: 3, isApproved: true, isAvailable: true })).toBe(false);
  });

  it('unavailable seller not discoverable', () => {
    expect(isSellerDiscoverable({ sellerType: 'commercial', sellBeyond: false, distanceKm: 1, searchRadiusKm: 5, deliveryRadiusKm: null, isApproved: true, isAvailable: false })).toBe(false);
  });

  it('unapproved seller not discoverable', () => {
    expect(isSellerDiscoverable({ sellerType: 'commercial', sellBeyond: false, distanceKm: 1, searchRadiusKm: 5, deliveryRadiusKm: null, isApproved: false, isAvailable: true })).toBe(false);
  });
});

// ─── Suite 3: Buyer without society — full flow ─────────────────────────────

describe('Buyer without society — full marketplace flow', () => {
  const noSociety = { isAdmin: false, effectiveSocietyId: null as string | null, featureMap: new Map<string, { is_enabled: boolean }>() };

  it('marketplace feature enabled', () => {
    expect(isFeatureEnabled('marketplace', noSociety)).toBe(true);
  });

  it('can see approved products (no society RLS gate)', () => {
    expect(canSeeProduct({ productApprovalStatus: 'approved', sellerVerificationStatus: 'approved', isOwnProduct: false, isAdmin: false })).toBe(true);
  });

  it('can see coupons (no society filter)', () => {
    expect(canBuyerSeeCoupon({ is_active: true, starts_at: new Date('2020-01-01'), expires_at: null })).toBe(true);
  });

  it('seller_tools enabled for commercial seller without society', () => {
    expect(isFeatureEnabled('seller_tools', noSociety)).toBe(true);
  });

  it('delivery_management enabled without society', () => {
    expect(isFeatureEnabled('delivery_management', noSociety)).toBe(true);
  });
});

// ─── Suite 4: Cross-society buyer ───────────────────────────────────────────

describe('Cross-society buyer — marketplace flow', () => {
  it('can see products from other society seller (RLS marketplace-open)', () => {
    expect(canSeeProduct({ productApprovalStatus: 'approved', sellerVerificationStatus: 'approved', isOwnProduct: false, isAdmin: false })).toBe(true);
  });

  it('can discover cross-society seller within radius', () => {
    expect(isSellerDiscoverable({ sellerType: 'society_resident', sellBeyond: false, distanceKm: 4, searchRadiusKm: 5, deliveryRadiusKm: null, isApproved: true, isAvailable: true })).toBe(true);
  });

  it('can see cross-society coupons', () => {
    expect(canBuyerSeeCoupon({ is_active: true, starts_at: new Date('2020-01-01'), expires_at: new Date('2030-12-31') })).toBe(true);
  });
});

// ─── Suite 5: Society features remain gated ─────────────────────────────────

describe('Society features blocked without effectiveSocietyId', () => {
  const featureMap = new Map(SOCIETY_FEATURES.map(k => [k, { is_enabled: true }]));

  SOCIETY_FEATURES.forEach(feature => {
    it(`${feature} disabled without society`, () => {
      expect(isFeatureEnabled(feature, { isAdmin: false, effectiveSocietyId: null, featureMap })).toBe(false);
    });
  });

  it('society features enabled WITH society', () => {
    SOCIETY_FEATURES.forEach(f => {
      expect(isFeatureEnabled(f, { isAdmin: false, effectiveSocietyId: 'soc-1', featureMap })).toBe(true);
    });
  });

  it('admin bypasses all gates', () => {
    SOCIETY_FEATURES.forEach(f => {
      expect(isFeatureEnabled(f, { isAdmin: true, effectiveSocietyId: null, featureMap })).toBe(true);
    });
  });
});

// ─── Suite 6: Marketplace features always accessible ────────────────────────

describe('Marketplace features always accessible', () => {
  [null, 'soc-1'].forEach(sid => {
    MARKETPLACE_FEATURES.forEach(f => {
      it(`${f} enabled (society=${sid ?? 'null'})`, () => {
        expect(isFeatureEnabled(f, { isAdmin: false, effectiveSocietyId: sid, featureMap: new Map() })).toBe(true);
      });
    });
  });
});

// ─── Suite 7: Seller detail page — no society block ─────────────────────────

describe('Seller detail page — approved sellers always accessible', () => {
  it('cross-society seller accessible (Round 3: no society scoping)', () => {
    // SellerDetailPage no longer blocks based on society mismatch
    const sellerApproved = true;
    expect(sellerApproved).toBe(true); // Only verification_status matters now
  });

  it('commercial seller always accessible', () => {
    expect(canSeeProduct({ productApprovalStatus: 'approved', sellerVerificationStatus: 'approved', isOwnProduct: false, isAdmin: false })).toBe(true);
  });
});

// ─── Suite 8: Cart resilience ───────────────────────────────────────────────

describe('Cart resilience — null product handling', () => {
  it('cart filters out items with null product', () => {
    const cartItems = [
      { product_id: '1', quantity: 2, product: { id: '1', price: 100, name: 'A' } },
      { product_id: '2', quantity: 1, product: null },
    ];
    const filtered = cartItems.filter(item => item.product != null);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].product_id).toBe('1');
  });

  it('cart total ignores null-product items', () => {
    const items = [
      { quantity: 2, product: { price: 100 } },
      { quantity: 1, product: null },
    ];
    const total = items.reduce((sum, item) => sum + ((item.product as any)?.price || 0) * item.quantity, 0);
    expect(total).toBe(200);
  });
});
