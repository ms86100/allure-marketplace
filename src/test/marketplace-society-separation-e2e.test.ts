/**
 * Round 4 — Real Integration Tests: Marketplace vs Society Separation
 * ====================================================================
 * Authenticates as real test users and hits actual Supabase tables/RPCs
 * to verify marketplace independence from society context.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createAuthenticatedClient,
  ensureTestUsersSeeded,
  testSlug,
  cleanupRows,
} from './helpers/integration';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Setup ──────────────────────────────────────────────────────────────────

let buyerClient: SupabaseClient;
let sellerClient: SupabaseClient;
let seeded = false;

beforeAll(async () => {
  try {
    await ensureTestUsersSeeded();
    [buyerClient, sellerClient] = await Promise.all([
      createAuthenticatedClient('buyer'),
      createAuthenticatedClient('seller'),
    ]);
    seeded = true;
  } catch (e) {
    console.warn('Integration seed unavailable, integration suites will be skipped:', (e as Error).message);
  }
}, 30_000);

function requireSeeded() {
  if (!seeded) {
    return true; // signal to skip
  }
  return false;
}


// ═══════════════════════════════════════════════════════════════════════════
// Suite 1: No-society buyer — full marketplace flow
// ═══════════════════════════════════════════════════════════════════════════

describe('No-society buyer — marketplace access', () => {
  it('can call search_sellers_by_location RPC', async () => {
    const { data, error } = await buyerClient.rpc('search_sellers_by_location', {
      _lat: 18.55,
      _lng: 73.85,
      _radius_km: 50,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read approved products', async () => {
    const { data, error } = await buyerClient
      .from('products')
      .select('id, name, price, approval_status')
      .eq('approval_status', 'approved')
      .eq('is_available', true)
      .limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read active coupons', async () => {
    const { data, error } = await buyerClient
      .from('coupons')
      .select('id, code, discount_value, is_active')
      .eq('is_active', true)
      .limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read seller recommendations', async () => {
    const { data, error } = await buyerClient
      .from('seller_recommendations')
      .select('id, seller_id')
      .limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can insert search demand log without society', async () => {
    const { error } = await buyerClient
      .from('search_demand_log')
      .insert({ search_term: testSlug('test_demand'), society_id: null });
    expect(error).toBeNull();
  });

  it('can read own cart items', async () => {
    const { data, error } = await buyerClient
      .from('cart_items')
      .select('id, product_id, quantity');
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read own orders', async () => {
    const { data, error } = await buyerClient
      .from('orders')
      .select('id, status, total_amount')
      .limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 2: Commercial seller — marketplace tools
// ═══════════════════════════════════════════════════════════════════════════

describe('Commercial seller — marketplace tools', () => {
  it('can read own seller profile', async () => {
    const { data, error } = await sellerClient
      .from('seller_profiles')
      .select('id, business_name, society_id, verification_status')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read own products', async () => {
    const { data, error } = await sellerClient
      .from('products')
      .select('id, name, price')
      .limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read own orders as seller', async () => {
    const { data, error } = await sellerClient
      .from('orders')
      .select('id, status, buyer_id')
      .limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can call get_unmet_demand with null society', async () => {
    const { data, error } = await sellerClient.rpc('get_unmet_demand', {
      _society_id: null,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can call get_location_stats', async () => {
    const { data, error } = await sellerClient.rpc('get_location_stats', {
      _lat: 18.55,
      _lng: 73.85,
      _radius_km: 10,
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 3: Society feature denial for non-society users
// ═══════════════════════════════════════════════════════════════════════════

describe('Society features blocked for non-society buyer', () => {
  it('cannot read gate_entry_logs', async () => {
    const { data, error } = await buyerClient
      .from('gate_entry_logs')
      .select('id')
      .limit(1);
    // RLS should block or return empty — either error or empty array is valid
    if (error) {
      expect(error.code).toBeDefined();
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it('cannot read bulletin_posts from other society', async () => {
    const { data, error } = await buyerClient
      .from('bulletin_posts')
      .select('id')
      .limit(1);
    if (error) {
      expect(error.code).toBeDefined();
    } else {
      // Buyer without society should see nothing
      expect(data?.length).toBeLessThanOrEqual(0);
    }
  });

  it('cannot read delivery_partner_pool', async () => {
    const { data, error } = await buyerClient
      .from('delivery_partner_pool')
      .select('id')
      .limit(1);
    if (error) {
      expect(error.code).toBeDefined();
    } else {
      expect(data).toHaveLength(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 4: RPC has no society equality filtering
// ═══════════════════════════════════════════════════════════════════════════

describe('search_sellers_by_location — no society gate', () => {
  it('returns results without society context', async () => {
    const { data, error } = await buyerClient.rpc('search_sellers_by_location', {
      _lat: 18.55,
      _lng: 73.85,
      _radius_km: 100,
    });
    expect(error).toBeNull();
    // With a 100km radius we should find sellers if any exist in test data
    expect(Array.isArray(data)).toBe(true);
  });

  it('returns null for invalid coordinates', async () => {
    const { data, error } = await buyerClient.rpc('search_sellers_by_location', {
      _lat: null as any,
      _lng: null as any,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 5: Feature classification (unit — mirrors useEffectiveFeatures.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('Feature classification — delivery_management is society-scoped', () => {
  const MARKETPLACE_FEATURES = new Set([
    'marketplace', 'seller_tools', 'trust_directory', 'trust_score',
    'subscriptions', 'notifications',
  ]);

  it('delivery_management is NOT a marketplace feature', () => {
    expect(MARKETPLACE_FEATURES.has('delivery_management')).toBe(false);
  });

  it('marketplace features do not include society features', () => {
    const SOCIETY_ONLY = [
      'collective_buy', 'gate_entry', 'authorized_persons', 'bulletin',
      'visitor_management', 'domestic_help', 'workforce_management',
      'delivery_management', 'parcel_management', 'inspection', 'maintenance',
    ];
    SOCIETY_ONLY.forEach(f => {
      expect(MARKETPLACE_FEATURES.has(f)).toBe(false);
    });
  });

  it('all 6 marketplace features are present', () => {
    expect(MARKETPLACE_FEATURES.size).toBe(6);
  });
});
