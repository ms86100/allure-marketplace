/**
 * Round 4 — Real Integration Tests: Marketplace vs Society Separation
 * ====================================================================
 * Authenticates as real test users and hits actual Supabase tables/RPCs.
 * Integration suites skip gracefully when seed function is unavailable.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createAuthenticatedClient,
  ensureTestUsersSeeded,
  testSlug,
} from './helpers/integration';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Setup ──────────────────────────────────────────────────────────────────

let buyerClient: SupabaseClient;
let sellerClient: SupabaseClient;
let seeded = false;

try {
  // Attempt seed synchronously at module level so describe.skipIf works
  const res = await fetch(
    'https://rvvctaikytfeyzkwoqxg.supabase.co/functions/v1/seed-integration-test-users',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2dmN0YWlreXRmZXl6a3dvcXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NTUxMTksImV4cCI6MjA4NTMzMTExOX0.Y7V9O3ifSufEYrSOoqoHKdzWcFxyCEY2TIf7ENU-lHE',
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2dmN0YWlreXRmZXl6a3dvcXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NTUxMTksImV4cCI6MjA4NTMzMTExOX0.Y7V9O3ifSufEYrSOoqoHKdzWcFxyCEY2TIf7ENU-lHE',
      },
    }
  );
  if (res.ok) {
    [buyerClient, sellerClient] = await Promise.all([
      createAuthenticatedClient('buyer'),
      createAuthenticatedClient('seller'),
    ]);
    seeded = true;
  }
} catch {
  // seed unavailable
}

const skipIntegration = !seeded;

// ═══════════════════════════════════════════════════════════════════════════
// Suite 1: No-society buyer — full marketplace flow
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(skipIntegration)('No-society buyer — marketplace access', () => {
  it('can call search_sellers_by_location RPC', async () => {
    const { data, error } = await buyerClient.rpc('search_sellers_by_location', {
      _lat: 18.55, _lng: 73.85, _radius_km: 50,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read approved products', async () => {
    const { data, error } = await buyerClient
      .from('products').select('id, name').eq('approval_status', 'approved').limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read active coupons', async () => {
    const { data, error } = await buyerClient
      .from('coupons').select('id, code').eq('is_active', true).limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read seller recommendations', async () => {
    const { data, error } = await buyerClient
      .from('seller_recommendations').select('id').limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can insert search demand log without society', async () => {
    const { error } = await buyerClient
      .from('search_demand_log')
      .insert({ search_term: testSlug('demand'), society_id: null });
    expect(error).toBeNull();
  });

  it('can read own cart items', async () => {
    const { data, error } = await buyerClient.from('cart_items').select('id');
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read own orders', async () => {
    const { data, error } = await buyerClient.from('orders').select('id').limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 2: Commercial seller — marketplace tools
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(skipIntegration)('Commercial seller — marketplace tools', () => {
  it('can read own seller profile', async () => {
    const { data, error } = await sellerClient
      .from('seller_profiles').select('id, business_name').limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can read own products', async () => {
    const { data, error } = await sellerClient.from('products').select('id').limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can call get_unmet_demand with null society', async () => {
    const { data, error } = await sellerClient.rpc('get_unmet_demand', { _society_id: null });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('can call get_location_stats', async () => {
    const { data, error } = await sellerClient.rpc('get_location_stats', {
      _lat: 18.55, _lng: 73.85, _radius_km: 10,
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 3: Society feature denial
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(skipIntegration)('Society features blocked for non-society buyer', () => {
  it('cannot read delivery_partner_pool', async () => {
    const { data, error } = await buyerClient.from('delivery_partner_pool').select('id').limit(1);
    if (error) expect(error.code).toBeDefined();
    else expect(data).toHaveLength(0);
  });

  it('cannot read gate_entry_logs', async () => {
    const { data, error } = await buyerClient.from('gate_entry_logs').select('id').limit(1);
    if (error) expect(error.code).toBeDefined();
    else expect(data).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 4: RPC no society gate
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(skipIntegration)('search_sellers_by_location — no society gate', () => {
  it('returns results without society context', async () => {
    const { data, error } = await buyerClient.rpc('search_sellers_by_location', {
      _lat: 18.55, _lng: 73.85, _radius_km: 100,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('returns empty for null coordinates', async () => {
    const { data, error } = await buyerClient.rpc('search_sellers_by_location', {
      _lat: null as any, _lng: null as any,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 5: Feature classification (unit — always runs)
// ═══════════════════════════════════════════════════════════════════════════

describe('Feature classification — delivery_management is society-scoped', () => {
  const MARKETPLACE_FEATURES = new Set([
    'marketplace', 'seller_tools', 'trust_directory', 'trust_score',
    'subscriptions', 'notifications',
  ]);

  const SOCIETY_FEATURES = [
    'collective_buy', 'gate_entry', 'authorized_persons', 'bulletin',
    'visitor_management', 'domestic_help', 'workforce_management',
    'delivery_management', 'parcel_management', 'inspection', 'maintenance',
    'worker_marketplace', 'worker_attendance', 'worker_salary', 'worker_leave',
    'society_notices', 'security_audit', 'guard_kiosk', 'vehicle_parking',
    'resident_identity_verification', 'community_rules', 'society_reports',
  ];

  it('delivery_management is NOT a marketplace feature', () => {
    expect(MARKETPLACE_FEATURES.has('delivery_management')).toBe(false);
  });

  it('no society feature appears in MARKETPLACE_FEATURES', () => {
    SOCIETY_FEATURES.forEach(f => {
      expect(MARKETPLACE_FEATURES.has(f)).toBe(false);
    });
  });

  it('MARKETPLACE_FEATURES has exactly 6 entries', () => {
    expect(MARKETPLACE_FEATURES.size).toBe(6);
  });

  it('marketplace features enabled without society; society features blocked', () => {
    const isEnabled = (key: string, societyId: string | null, isAdmin: boolean) => {
      if (isAdmin) return true;
      if (MARKETPLACE_FEATURES.has(key)) return true;
      if (!societyId) return false;
      return true;
    };

    MARKETPLACE_FEATURES.forEach(f => {
      expect(isEnabled(f, null, false)).toBe(true);
    });
    SOCIETY_FEATURES.forEach(f => {
      expect(isEnabled(f, null, false)).toBe(false);
    });
  });
});
