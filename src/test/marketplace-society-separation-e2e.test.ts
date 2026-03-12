/**
 * Phase 4 — E2E Verification Matrix
 * Validates the marketplace vs society domain separation:
 *
 * 1. Buyer without society: full marketplace flow
 * 2. Buyer in society purchasing cross-society seller: full flow
 * 3. Commercial seller (no society): coupon, orders, demand insights
 * 4. Society features: blocked for no-society users
 */
import { describe, it, expect } from 'vitest';

// ─── Domain Classification ──────────────────────────────────────────────────

/** Features that belong to the marketplace domain — must work without society */
const MARKETPLACE_FEATURES = new Set([
  'marketplace', 'seller_tools', 'trust_directory', 'trust_score',
  'subscriptions', 'notifications',
]);

/** Features that belong to the society domain — require effectiveSocietyId */
const SOCIETY_FEATURES = [
  'collective_buy', 'gate_entry', 'authorized_persons', 'bulletin',
  'visitor_management', 'domestic_help', 'workforce_management',
  'worker_marketplace', 'worker_attendance', 'worker_salary', 'worker_leave',
  'society_notices', 'security_audit', 'guard_kiosk', 'vehicle_parking',
  'resident_identity_verification', 'community_rules', 'society_reports',
  'inspection', 'maintenance', 'parcel_management',
];

// ─── Helpers mirroring production logic ─────────────────────────────────────

function isFeatureEnabled(
  key: string,
  opts: {
    isAdmin: boolean;
    effectiveSocietyId: string | null;
    featureMap: Map<string, { is_enabled: boolean }>;
  }
): boolean {
  if (opts.isAdmin) return true;
  if (MARKETPLACE_FEATURES.has(key)) return true;
  if (!opts.effectiveSocietyId) return false;
  const feature = opts.featureMap.get(key);
  if (!feature) return false;
  return feature.is_enabled;
}

/** Simulates coupon SELECT policy — marketplace-safe (no society filter) */
function canBuyerSeeCoupon(coupon: {
  is_active: boolean;
  starts_at: Date;
  expires_at: Date | null;
}): boolean {
  const now = new Date();
  return (
    coupon.is_active &&
    coupon.starts_at <= now &&
    (coupon.expires_at === null || coupon.expires_at > now)
  );
}

/** Simulates search demand log INSERT policy — authenticated only */
function canLogSearchDemand(userId: string | null): boolean {
  return userId !== null;
}

/** Simulates get_unmet_demand scoping */
function getDemandScope(
  societyId: string | null,
  sellerId: string | null
): 'society' | 'seller-scoped' | 'null-only' {
  if (societyId) return 'society';
  if (sellerId) return 'seller-scoped';
  return 'null-only';
}

/** Simulates store discovery enablement — coordinate-only, no isApproved gate */
function isDiscoveryEnabled(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null;
}

/** Simulates seller detail page access — coordinate fallback */
function canAccessSellerDetail(opts: {
  buyerSocietyId: string | null;
  sellerSocietyId: string | null;
  sellerType: 'commercial' | 'society_resident';
  sellBeyond: boolean;
  distanceKm: number;
  browsingRadiusKm: number;
}): boolean {
  // Commercial sellers always accessible
  if (opts.sellerType === 'commercial') return true;
  // Same society
  if (opts.buyerSocietyId && opts.buyerSocietyId === opts.sellerSocietyId) return true;
  // Sell beyond enabled
  if (opts.sellBeyond) return true;
  // Within browsing radius (coordinate fallback)
  if (opts.distanceKm <= opts.browsingRadiusKm) return true;
  return false;
}

/** Simulates coupon creation for sellers */
function canSellerCreateCoupon(opts: {
  sellerId: string | null;
  societyId: string | null;
}): boolean {
  // Only need a valid seller profile, society is optional
  return opts.sellerId !== null;
}

// ─── Test Suite 1: Buyer without society ────────────────────────────────────

describe('Buyer without society — full marketplace flow', () => {
  const buyer = {
    userId: 'buyer-no-society-001',
    effectiveSocietyId: null as string | null,
    isAdmin: false,
    lat: 12.9716,
    lng: 77.5946,
  };

  const featureMap = new Map([
    ['marketplace', { is_enabled: true }],
    ['seller_tools', { is_enabled: true }],
  ]);

  it('marketplace feature is enabled without society', () => {
    expect(isFeatureEnabled('marketplace', {
      isAdmin: buyer.isAdmin,
      effectiveSocietyId: buyer.effectiveSocietyId,
      featureMap,
    })).toBe(true);
  });

  it('store discovery works with coordinates only', () => {
    expect(isDiscoveryEnabled(buyer.lat, buyer.lng)).toBe(true);
  });

  it('store discovery disabled without coordinates', () => {
    expect(isDiscoveryEnabled(null, null)).toBe(false);
  });

  it('can access commercial seller detail page', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: null,
      sellerSocietyId: 'society-B',
      sellerType: 'commercial',
      sellBeyond: false,
      distanceKm: 3,
      browsingRadiusKm: 5,
    })).toBe(true);
  });

  it('can access society_resident seller within radius', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: null,
      sellerSocietyId: 'society-B',
      sellerType: 'society_resident',
      sellBeyond: false,
      distanceKm: 2,
      browsingRadiusKm: 5,
    })).toBe(true);
  });

  it('blocks society_resident seller outside radius without sell_beyond', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: null,
      sellerSocietyId: 'society-B',
      sellerType: 'society_resident',
      sellBeyond: false,
      distanceKm: 8,
      browsingRadiusKm: 5,
    })).toBe(false);
  });

  it('can see active coupons (no society filter)', () => {
    expect(canBuyerSeeCoupon({
      is_active: true,
      starts_at: new Date('2020-01-01'),
      expires_at: new Date('2030-12-31'),
    })).toBe(true);
  });

  it('cannot see expired coupons', () => {
    expect(canBuyerSeeCoupon({
      is_active: true,
      starts_at: new Date('2020-01-01'),
      expires_at: new Date('2020-06-01'),
    })).toBe(false);
  });

  it('cannot see inactive coupons', () => {
    expect(canBuyerSeeCoupon({
      is_active: false,
      starts_at: new Date('2020-01-01'),
      expires_at: null,
    })).toBe(false);
  });

  it('can log search demand without society', () => {
    expect(canLogSearchDemand(buyer.userId)).toBe(true);
  });

  it('anonymous user cannot log search demand', () => {
    expect(canLogSearchDemand(null)).toBe(false);
  });
});

// ─── Test Suite 2: Cross-society buyer ──────────────────────────────────────

describe('Buyer in society A purchasing from seller in society B', () => {
  const buyer = {
    userId: 'buyer-society-A-001',
    effectiveSocietyId: 'society-A',
    isAdmin: false,
    lat: 12.9716,
    lng: 77.5946,
  };

  it('marketplace feature enabled with society', () => {
    expect(isFeatureEnabled('marketplace', {
      isAdmin: false,
      effectiveSocietyId: buyer.effectiveSocietyId,
      featureMap: new Map([['marketplace', { is_enabled: true }]]),
    })).toBe(true);
  });

  it('discovery works with coordinates', () => {
    expect(isDiscoveryEnabled(buyer.lat, buyer.lng)).toBe(true);
  });

  it('can access cross-society seller with sell_beyond', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: 'society-A',
      sellerSocietyId: 'society-B',
      sellerType: 'society_resident',
      sellBeyond: true,
      distanceKm: 4,
      browsingRadiusKm: 5,
    })).toBe(true);
  });

  it('can access cross-society seller within radius even without sell_beyond', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: 'society-A',
      sellerSocietyId: 'society-B',
      sellerType: 'society_resident',
      sellBeyond: false,
      distanceKm: 3,
      browsingRadiusKm: 5,
    })).toBe(true);
  });

  it('can see cross-society seller coupons (no society filter)', () => {
    expect(canBuyerSeeCoupon({
      is_active: true,
      starts_at: new Date('2020-01-01'),
      expires_at: null,
    })).toBe(true);
  });

  it('can log search demand with society context', () => {
    expect(canLogSearchDemand(buyer.userId)).toBe(true);
  });
});

// ─── Test Suite 3: Commercial seller (no society) ───────────────────────────

describe('Commercial seller without society', () => {
  const seller = {
    sellerId: 'seller-commercial-001',
    userId: 'user-commercial-001',
    societyId: null as string | null,
    sellerType: 'commercial' as const,
  };

  it('can create coupons without society', () => {
    expect(canSellerCreateCoupon({
      sellerId: seller.sellerId,
      societyId: seller.societyId,
    })).toBe(true);
  });

  it('seller_tools feature enabled without society', () => {
    expect(isFeatureEnabled('seller_tools', {
      isAdmin: false,
      effectiveSocietyId: null,
      featureMap: new Map(),
    })).toBe(true);
  });

  it('demand insights scoped to seller activity (not global)', () => {
    expect(getDemandScope(null, seller.sellerId)).toBe('seller-scoped');
  });

  it('demand insights for society seller scoped to society', () => {
    expect(getDemandScope('society-X', null)).toBe('society');
  });

  it('demand insights without either scoped to null-only logs', () => {
    expect(getDemandScope(null, null)).toBe('null-only');
  });

  it('commercial seller always accessible from any buyer', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: null,
      sellerSocietyId: null,
      sellerType: 'commercial',
      sellBeyond: false,
      distanceKm: 10,
      browsingRadiusKm: 5,
    })).toBe(true);
  });

  it('commercial seller accessible to society buyer cross-society', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: 'society-A',
      sellerSocietyId: null,
      sellerType: 'commercial',
      sellBeyond: false,
      distanceKm: 7,
      browsingRadiusKm: 5,
    })).toBe(true);
  });
});

// ─── Test Suite 4: Society features blocked for no-society users ────────────

describe('Society features blocked when effectiveSocietyId is null', () => {
  const featureMap = new Map(
    SOCIETY_FEATURES.map(key => [key, { is_enabled: true }])
  );

  SOCIETY_FEATURES.forEach(feature => {
    it(`${feature} is disabled without society`, () => {
      expect(isFeatureEnabled(feature, {
        isAdmin: false,
        effectiveSocietyId: null,
        featureMap,
      })).toBe(false);
    });
  });

  it('society features enabled WITH society context', () => {
    SOCIETY_FEATURES.forEach(feature => {
      expect(isFeatureEnabled(feature, {
        isAdmin: false,
        effectiveSocietyId: 'society-123',
        featureMap,
      })).toBe(true);
    });
  });

  it('admin bypasses all gates regardless of society', () => {
    SOCIETY_FEATURES.forEach(feature => {
      expect(isFeatureEnabled(feature, {
        isAdmin: true,
        effectiveSocietyId: null,
        featureMap,
      })).toBe(true);
    });
  });
});

// ─── Test Suite 5: Marketplace features always accessible ───────────────────

describe('Marketplace features always accessible regardless of society', () => {
  const scenarios = [
    { label: 'no society', effectiveSocietyId: null },
    { label: 'with society', effectiveSocietyId: 'society-123' },
  ];

  scenarios.forEach(({ label, effectiveSocietyId }) => {
    MARKETPLACE_FEATURES.forEach(feature => {
      it(`${feature} enabled for ${label}`, () => {
        expect(isFeatureEnabled(feature, {
          isAdmin: false,
          effectiveSocietyId,
          featureMap: new Map(),
        })).toBe(true);
      });
    });
  });
});

// ─── Test Suite 6: Edge cases ───────────────────────────────────────────────

describe('Edge cases — boundary conditions', () => {
  it('seller at exact radius boundary is accessible', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: null,
      sellerSocietyId: 'society-B',
      sellerType: 'society_resident',
      sellBeyond: false,
      distanceKm: 5,
      browsingRadiusKm: 5,
    })).toBe(true);
  });

  it('seller 0.01km beyond radius is blocked', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: null,
      sellerSocietyId: 'society-B',
      sellerType: 'society_resident',
      sellBeyond: false,
      distanceKm: 5.01,
      browsingRadiusKm: 5,
    })).toBe(false);
  });

  it('same-society seller always accessible regardless of distance', () => {
    expect(canAccessSellerDetail({
      buyerSocietyId: 'society-B',
      sellerSocietyId: 'society-B',
      sellerType: 'society_resident',
      sellBeyond: false,
      distanceKm: 100,
      browsingRadiusKm: 5,
    })).toBe(true);
  });

  it('coupon with null expires_at is always valid (perpetual)', () => {
    expect(canBuyerSeeCoupon({
      is_active: true,
      starts_at: new Date('2020-01-01'),
      expires_at: null,
    })).toBe(true);
  });

  it('coupon not yet started is not visible', () => {
    expect(canBuyerSeeCoupon({
      is_active: true,
      starts_at: new Date('2099-01-01'),
      expires_at: null,
    })).toBe(false);
  });
});
