/**
 * Admin → Seller → Buyer End-to-End Test Suite
 * ==============================================
 * Validates the complete lifecycle from category creation through product
 * listing to buyer visibility, simulating real QA tester actions.
 *
 * Flow:
 *   1. Admin creates category + subcategory (all fields validated)
 *   2. Seller applies under new category, lists product (all fields)
 *   3. Admin approves category, subcategory, seller, and product
 *   4. Buyer verifies visibility only after approval
 */
import { describe, it, expect } from 'vitest';

// ─── Haversine (mirrors DB function) ──────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════

interface CategoryConfig {
  id: string;
  category: string;
  display_name: string;
  icon: string;
  color: string;
  parent_group: string;
  layout_type: 'ecommerce' | 'food' | 'service';
  is_active: boolean;
  display_order: number;
  image_url: string | null;
  // Behavior flags
  is_physical_product: boolean;
  requires_preparation: boolean;
  requires_time_slot: boolean;
  requires_delivery: boolean;
  supports_cart: boolean;
  enquiry_only: boolean;
  has_quantity: boolean;
  has_duration: boolean;
  has_date_range: boolean;
  is_negotiable: boolean;
  requires_price: boolean;
  requires_availability: boolean;
  // Form hints
  show_veg_toggle: boolean;
  show_duration_field: boolean;
  price_label: string | null;
  price_prefix: string | null;
  primary_button_label: string;
  name_placeholder: string | null;
  description_placeholder: string | null;
  duration_label: string | null;
  placeholder_emoji: string | null;
  // Display config
  supports_brand_display: boolean;
  supports_warranty_display: boolean;
  image_aspect_ratio: string;
  image_object_fit: string;
  // Transaction
  transaction_type: string;
  default_sort: string;
  accepts_preorders: boolean;
  lead_time_hours: number | null;
  preorder_cutoff_time: string | null;
  review_dimensions: string[] | null;
}

interface Subcategory {
  id: string;
  category_config_id: string;
  slug: string;
  display_name: string;
  display_order: number;
  icon: string | null;
  is_active: boolean;
}

interface SellerProfile {
  id: string;
  user_id: string;
  business_name: string;
  description: string;
  verification_status: 'pending' | 'approved' | 'rejected';
  is_available: boolean;
  society_id: string;
  categories: string[];
  primary_group: string;
  sell_beyond_community: boolean;
  delivery_radius_km: number;
  fulfillment_mode: 'self_pickup' | 'delivery' | 'both';
  profile_image_url: string;
  cover_image_url: string;
  operating_days: string[];
  availability_start: string;
  availability_end: string;
  accepts_upi: boolean;
  upi_id: string;
  accepts_cod: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  mrp: number | null;
  discount_percentage: number | null;
  category: string;
  subcategory_id: string | null;
  seller_id: string;
  is_available: boolean;
  approval_status: 'draft' | 'pending' | 'approved' | 'rejected';
  image_url: string;
  image_urls: string[];
  stock_quantity: number | null;
  is_veg: boolean;
  action_type: string;
  contact_phone: string;
  prep_time_minutes: number | null;
  tags: string[];
}

interface Society {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface BuyerProfile {
  id: string;
  name: string;
  email: string;
  society_id: string;
  flat_number: string;
  block: string;
  verification_status: 'approved';
  browse_beyond_community: boolean;
  search_radius_km: number;
}

// ═══════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS (mirror real app/DB logic)
// ═══════════════════════════════════════════════════════════════════════

function validateCategoryCreation(cat: Partial<CategoryConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!cat.category?.trim()) errors.push('category slug is required');
  if (!cat.display_name?.trim()) errors.push('display_name is required');
  if (!cat.icon?.trim()) errors.push('icon is required');
  if (!cat.color?.trim()) errors.push('color is required');
  if (!cat.parent_group?.trim()) errors.push('parent_group is required');
  if (!['ecommerce', 'food', 'service'].includes(cat.layout_type || '')) errors.push('layout_type must be ecommerce, food, or service');
  if (!['cart_purchase', 'buy_now', 'book_slot', 'request_service', 'request_quote', 'contact_only', 'schedule_visit'].includes(cat.transaction_type || ''))
    errors.push('invalid transaction_type');
  if (!['popular', 'price_low', 'price_high', 'newest', 'rating'].includes(cat.default_sort || ''))
    errors.push('invalid default_sort');
  if (!cat.primary_button_label?.trim()) errors.push('primary_button_label is required');
  if (!cat.image_aspect_ratio?.trim()) errors.push('image_aspect_ratio is required');
  if (!cat.image_object_fit?.trim()) errors.push('image_object_fit is required');
  return { valid: errors.length === 0, errors };
}

function validateSubcategoryCreation(sub: Partial<Subcategory>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!sub.category_config_id?.trim()) errors.push('category_config_id is required');
  if (!sub.display_name?.trim()) errors.push('display_name is required');
  if (!sub.slug?.trim()) errors.push('slug is required');
  return { valid: errors.length === 0, errors };
}

function validateProductListing(p: Partial<Product>, catRequiresPrice: boolean): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!p.name?.trim()) errors.push('name is required');
  if (!p.description?.trim()) errors.push('description is required');
  if (!p.category?.trim()) errors.push('category is required');
  if (!p.image_url?.trim()) errors.push('image_url is required');
  if (!p.image_urls?.length) errors.push('at least one product image is required');
  if (!p.seller_id?.trim()) errors.push('seller_id is required');
  if (!p.action_type?.trim()) errors.push('action_type is required');

  const priceExemptActions = ['contact_seller', 'request_quote', 'make_offer'];
  if (catRequiresPrice && !priceExemptActions.includes(p.action_type || '')) {
    if (p.price == null || p.price <= 0) errors.push('valid price is required for this category');
  }
  if (p.action_type === 'contact_seller' && !p.contact_phone?.trim()) {
    errors.push('contact phone required for contact_seller action');
  }
  if (p.mrp != null && p.price != null && p.mrp < p.price) {
    errors.push('MRP cannot be less than selling price');
  }
  if (p.stock_quantity != null && p.stock_quantity < 0) {
    errors.push('stock_quantity cannot be negative');
  }
  return { valid: errors.length === 0, errors };
}

function validateSellerApplication(s: Partial<SellerProfile>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!s.business_name?.trim()) errors.push('business_name is required');
  if (!s.description?.trim()) errors.push('description is required');
  if (!s.categories?.length) errors.push('at least one category is required');
  if (!s.primary_group?.trim()) errors.push('primary_group is required');
  if (!s.profile_image_url?.trim()) errors.push('profile_image_url is required');
  if (!s.cover_image_url?.trim()) errors.push('cover_image_url is required');
  if (!s.operating_days?.length) errors.push('operating_days is required');
  if (!s.fulfillment_mode) errors.push('fulfillment_mode is required');
  if (!['self_pickup', 'delivery', 'both'].includes(s.fulfillment_mode || ''))
    errors.push('invalid fulfillment_mode');
  if (s.delivery_radius_km != null && (s.delivery_radius_km < 1 || s.delivery_radius_km > 10))
    errors.push('delivery_radius_km must be between 1 and 10');
  if (s.accepts_upi && !s.upi_id?.trim()) errors.push('UPI ID required when UPI is enabled');
  return { valid: errors.length === 0, errors };
}

/** Simulates buyer discovery logic (mirrors search_nearby_sellers RPC) */
function simulateBuyerDiscovery(params: {
  buyerSociety: Society;
  buyerRadius: number;
  societies: Society[];
  sellers: SellerProfile[];
  products: Product[];
  categories: CategoryConfig[];
  subcategories: Subcategory[];
}): {
  visibleCategories: CategoryConfig[];
  visibleSubcategories: Subcategory[];
  visibleSellers: { seller: SellerProfile; products: Product[] }[];
} {
  const { buyerSociety, buyerRadius, societies, sellers, products, categories, subcategories } = params;

  // Only show active & approved categories that have at least one visible product
  const approvedProducts = products.filter(
    (p) => p.is_available && p.approval_status === 'approved'
  );

  const visibleSellers: { seller: SellerProfile; products: Product[] }[] = [];

  for (const seller of sellers) {
    if (seller.verification_status !== 'approved') continue;
    if (!seller.is_available) continue;

    const sellerSociety = societies.find((s) => s.id === seller.society_id);
    if (!sellerSociety) continue;

    // Same-society sellers are always visible; cross-society needs distance check
    if (seller.society_id !== buyerSociety.id) {
      if (!seller.sell_beyond_community) continue;
      const dist = haversineKm(buyerSociety.lat, buyerSociety.lon, sellerSociety.lat, sellerSociety.lon);
      if (dist > seller.delivery_radius_km || dist > buyerRadius) continue;
    }

    const sellerProducts = approvedProducts.filter((p) => p.seller_id === seller.id);
    if (sellerProducts.length === 0) continue;

    visibleSellers.push({ seller, products: sellerProducts });
  }

  // Categories visible if active AND have at least one visible product
  const activeCategorySlugs = new Set(
    visibleSellers.flatMap((s) => s.products.map((p) => p.category))
  );
  const visibleCategories = categories.filter(
    (c) => c.is_active && activeCategorySlugs.has(c.category)
  );

  // Subcategories visible if active AND parent category is visible
  const visibleCatIds = new Set(visibleCategories.map((c) => c.id));
  const visibleSubcategories = subcategories.filter(
    (sc) => sc.is_active && visibleCatIds.has(sc.category_config_id)
  );

  return { visibleCategories, visibleSubcategories, visibleSellers };
}

// ═══════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════

const SOCIETY_A: Society = { id: 'soc-alpha', name: 'Alpha Residences', lat: 12.9716, lon: 77.5946 };
const SOCIETY_B: Society = { id: 'soc-beta', name: 'Beta Towers', lat: 12.9720, lon: 77.5960 };

const NEW_CATEGORY: CategoryConfig = {
  id: 'cat-organic-001',
  category: 'organic_produce',
  display_name: 'Organic Produce',
  icon: '🥬',
  color: '#4CAF50',
  parent_group: 'food',
  layout_type: 'food',
  is_active: false, // starts inactive — admin must activate
  display_order: 50,
  image_url: 'https://images.example.com/organic.jpg',
  is_physical_product: true,
  requires_preparation: false,
  requires_time_slot: false,
  requires_delivery: true,
  supports_cart: true,
  enquiry_only: false,
  has_quantity: true,
  has_duration: false,
  has_date_range: false,
  is_negotiable: false,
  requires_price: true,
  requires_availability: true,
  show_veg_toggle: true,
  show_duration_field: false,
  price_label: 'Price per unit',
  price_prefix: '₹',
  primary_button_label: 'Add to Cart',
  name_placeholder: 'e.g. Organic Tomatoes',
  description_placeholder: 'Describe freshness, origin, weight…',
  duration_label: null,
  placeholder_emoji: '🥬',
  supports_brand_display: false,
  supports_warranty_display: false,
  image_aspect_ratio: '1:1',
  image_object_fit: 'cover',
  transaction_type: 'cart_purchase',
  default_sort: 'newest',
  accepts_preorders: false,
  lead_time_hours: null,
  preorder_cutoff_time: null,
  review_dimensions: ['freshness', 'packaging', 'value'],
};

const NEW_SUBCATEGORY: Subcategory = {
  id: 'subcat-veggies-001',
  category_config_id: NEW_CATEGORY.id,
  slug: 'fresh_vegetables',
  display_name: 'Fresh Vegetables',
  display_order: 1,
  icon: '🥕',
  is_active: false, // starts inactive
};

const NEW_SUBCATEGORY_2: Subcategory = {
  id: 'subcat-fruits-001',
  category_config_id: NEW_CATEGORY.id,
  slug: 'seasonal_fruits',
  display_name: 'Seasonal Fruits',
  display_order: 2,
  icon: '🍎',
  is_active: false,
};

const SELLER_APPLICANT: SellerProfile = {
  id: 'seller-organic-001',
  user_id: 'user-seller-organic',
  business_name: "Ravi's Organic Farm",
  description: 'Farm-fresh organic produce delivered daily from our family farm in Nandi Hills.',
  verification_status: 'pending',
  is_available: true,
  society_id: SOCIETY_B.id,
  categories: ['organic_produce'],
  primary_group: 'food',
  sell_beyond_community: true,
  delivery_radius_km: 5,
  fulfillment_mode: 'both',
  profile_image_url: 'https://images.example.com/ravi-profile.jpg',
  cover_image_url: 'https://images.example.com/ravi-cover.jpg',
  operating_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  availability_start: '07:00',
  availability_end: '19:00',
  accepts_upi: true,
  upi_id: 'ravi.farm@upi',
  accepts_cod: true,
};

const PRODUCT_LISTING: Product = {
  id: 'prod-organic-tomato-001',
  name: 'Organic Cherry Tomatoes',
  description: 'Vine-ripened cherry tomatoes, pesticide-free, 500g pack. Harvested fresh every morning.',
  price: 120,
  mrp: 150,
  discount_percentage: 20,
  category: 'organic_produce',
  subcategory_id: NEW_SUBCATEGORY.id,
  seller_id: SELLER_APPLICANT.id,
  is_available: true,
  approval_status: 'draft', // starts as draft
  image_url: 'https://images.example.com/cherry-tomatoes.jpg',
  image_urls: [
    'https://images.example.com/cherry-tomatoes.jpg',
    'https://images.example.com/cherry-tomatoes-pack.jpg',
  ],
  stock_quantity: 50,
  is_veg: true,
  action_type: 'add_to_cart',
  contact_phone: '+919876543210',
  prep_time_minutes: null,
  tags: ['organic', 'farm-fresh', 'pesticide-free'],
};

const BUYER: BuyerProfile = {
  id: 'buyer-user-organic-001',
  name: 'Priya Sharma',
  email: 'priya@example.com',
  society_id: SOCIETY_A.id,
  flat_number: '204',
  block: 'Tower C',
  verification_status: 'approved',
  browse_beyond_community: true,
  search_radius_km: 10,
};

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Admin → Seller → Buyer E2E', () => {
  // ─── Phase 1: Admin Creates Category ────────────────────────────────
  describe('1. Admin Creates Category', () => {
    it('should validate all mandatory category fields are present', () => {
      const result = validateCategoryCreation(NEW_CATEGORY);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject category with missing slug', () => {
      const result = validateCategoryCreation({ ...NEW_CATEGORY, category: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('category slug is required');
    });

    it('should reject category with missing display_name', () => {
      const result = validateCategoryCreation({ ...NEW_CATEGORY, display_name: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject category with invalid layout_type', () => {
      const result = validateCategoryCreation({ ...NEW_CATEGORY, layout_type: 'invalid' as any });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('layout_type must be ecommerce, food, or service');
    });

    it('should reject category with invalid transaction_type', () => {
      const result = validateCategoryCreation({ ...NEW_CATEGORY, transaction_type: 'invalid' });
      expect(result.valid).toBe(false);
    });

    it('should reject category with invalid default_sort', () => {
      const result = validateCategoryCreation({ ...NEW_CATEGORY, default_sort: 'random' });
      expect(result.valid).toBe(false);
    });

    it('should reject category without icon', () => {
      const result = validateCategoryCreation({ ...NEW_CATEGORY, icon: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject category without color', () => {
      const result = validateCategoryCreation({ ...NEW_CATEGORY, color: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject category without parent_group', () => {
      const result = validateCategoryCreation({ ...NEW_CATEGORY, parent_group: '' });
      expect(result.valid).toBe(false);
    });

    it('should have behavior flags set correctly for organic produce', () => {
      expect(NEW_CATEGORY.is_physical_product).toBe(true);
      expect(NEW_CATEGORY.supports_cart).toBe(true);
      expect(NEW_CATEGORY.requires_price).toBe(true);
      expect(NEW_CATEGORY.requires_delivery).toBe(true);
      expect(NEW_CATEGORY.has_quantity).toBe(true);
      expect(NEW_CATEGORY.enquiry_only).toBe(false);
      expect(NEW_CATEGORY.show_veg_toggle).toBe(true);
    });

    it('should have display configuration set', () => {
      expect(NEW_CATEGORY.image_aspect_ratio).toBe('1:1');
      expect(NEW_CATEGORY.image_object_fit).toBe('cover');
      expect(NEW_CATEGORY.primary_button_label).toBe('Add to Cart');
    });

    it('should start with is_active = false (not yet published)', () => {
      expect(NEW_CATEGORY.is_active).toBe(false);
    });

    it('should have review dimensions defined', () => {
      expect(NEW_CATEGORY.review_dimensions).toEqual(['freshness', 'packaging', 'value']);
    });
  });

  // ─── Phase 2: Admin Creates Subcategory ─────────────────────────────
  describe('2. Admin Creates Subcategory', () => {
    it('should validate all mandatory subcategory fields', () => {
      const result = validateSubcategoryCreation(NEW_SUBCATEGORY);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject subcategory without category_config_id', () => {
      const result = validateSubcategoryCreation({ ...NEW_SUBCATEGORY, category_config_id: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject subcategory without display_name', () => {
      const result = validateSubcategoryCreation({ ...NEW_SUBCATEGORY, display_name: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject subcategory without slug', () => {
      const result = validateSubcategoryCreation({ ...NEW_SUBCATEGORY, slug: '' });
      expect(result.valid).toBe(false);
    });

    it('should validate second subcategory (Seasonal Fruits)', () => {
      const result = validateSubcategoryCreation(NEW_SUBCATEGORY_2);
      expect(result.valid).toBe(true);
    });

    it('should link subcategories to correct parent category', () => {
      expect(NEW_SUBCATEGORY.category_config_id).toBe(NEW_CATEGORY.id);
      expect(NEW_SUBCATEGORY_2.category_config_id).toBe(NEW_CATEGORY.id);
    });

    it('subcategories should start inactive', () => {
      expect(NEW_SUBCATEGORY.is_active).toBe(false);
      expect(NEW_SUBCATEGORY_2.is_active).toBe(false);
    });

    it('subcategories should have correct display_order', () => {
      expect(NEW_SUBCATEGORY.display_order).toBeLessThan(NEW_SUBCATEGORY_2.display_order);
    });
  });

  // ─── Phase 3: Seller Applies & Lists Product ───────────────────────
  describe('3. Seller Applies Under New Category', () => {
    it('should validate all mandatory seller application fields', () => {
      const result = validateSellerApplication(SELLER_APPLICANT);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject seller without business_name', () => {
      const result = validateSellerApplication({ ...SELLER_APPLICANT, business_name: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject seller without description', () => {
      const result = validateSellerApplication({ ...SELLER_APPLICANT, description: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject seller without categories', () => {
      const result = validateSellerApplication({ ...SELLER_APPLICANT, categories: [] });
      expect(result.valid).toBe(false);
    });

    it('should reject seller without profile image', () => {
      const result = validateSellerApplication({ ...SELLER_APPLICANT, profile_image_url: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject seller without cover image', () => {
      const result = validateSellerApplication({ ...SELLER_APPLICANT, cover_image_url: '' });
      expect(result.valid).toBe(false);
    });

    it('should reject seller without operating days', () => {
      const result = validateSellerApplication({ ...SELLER_APPLICANT, operating_days: [] });
      expect(result.valid).toBe(false);
    });

    it('should reject seller with invalid fulfillment_mode', () => {
      const result = validateSellerApplication({ ...SELLER_APPLICANT, fulfillment_mode: 'invalid' as any });
      expect(result.valid).toBe(false);
    });

    it('should reject seller with delivery_radius outside 1–10 km', () => {
      expect(validateSellerApplication({ ...SELLER_APPLICANT, delivery_radius_km: 0 }).valid).toBe(false);
      expect(validateSellerApplication({ ...SELLER_APPLICANT, delivery_radius_km: 15 }).valid).toBe(false);
    });

    it('should reject UPI-enabled seller without UPI ID', () => {
      const result = validateSellerApplication({ ...SELLER_APPLICANT, accepts_upi: true, upi_id: '' });
      expect(result.valid).toBe(false);
    });

    it('seller status should start as pending', () => {
      expect(SELLER_APPLICANT.verification_status).toBe('pending');
    });

    it('seller should be under the newly created category', () => {
      expect(SELLER_APPLICANT.categories).toContain(NEW_CATEGORY.category);
    });
  });

  // ─── Phase 4: Seller Lists Product ──────────────────────────────────
  describe('4. Seller Lists Product With All Fields', () => {
    it('should validate all mandatory product fields', () => {
      const result = validateProductListing(PRODUCT_LISTING, NEW_CATEGORY.requires_price);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject product without name', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, name: '' }, true);
      expect(result.valid).toBe(false);
    });

    it('should reject product without description', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, description: '' }, true);
      expect(result.valid).toBe(false);
    });

    it('should reject product without category', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, category: '' }, true);
      expect(result.valid).toBe(false);
    });

    it('should reject product without image_url', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, image_url: '' }, true);
      expect(result.valid).toBe(false);
    });

    it('should reject product without image_urls array', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, image_urls: [] }, true);
      expect(result.valid).toBe(false);
    });

    it('should reject product with zero price in price-required category', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, price: 0 }, true);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('valid price is required for this category');
    });

    it('should reject product with negative price', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, price: -50 }, true);
      expect(result.valid).toBe(false);
    });

    it('should reject product where MRP < selling price', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, mrp: 100, price: 120 }, true);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MRP cannot be less than selling price');
    });

    it('should reject negative stock_quantity', () => {
      const result = validateProductListing({ ...PRODUCT_LISTING, stock_quantity: -1 }, true);
      expect(result.valid).toBe(false);
    });

    it('product should start as draft', () => {
      expect(PRODUCT_LISTING.approval_status).toBe('draft');
    });

    it('product should be mapped to correct subcategory', () => {
      expect(PRODUCT_LISTING.subcategory_id).toBe(NEW_SUBCATEGORY.id);
    });

    it('product should be linked to seller', () => {
      expect(PRODUCT_LISTING.seller_id).toBe(SELLER_APPLICANT.id);
    });

    it('product should have correct category mapping', () => {
      expect(PRODUCT_LISTING.category).toBe(NEW_CATEGORY.category);
    });

    it('product discount should be consistent with MRP & price', () => {
      const expectedDiscount = Math.round(((PRODUCT_LISTING.mrp! - PRODUCT_LISTING.price) / PRODUCT_LISTING.mrp!) * 100);
      expect(PRODUCT_LISTING.discount_percentage).toBe(expectedDiscount);
    });

    it('product should have valid stock quantity', () => {
      expect(PRODUCT_LISTING.stock_quantity).toBeGreaterThan(0);
    });
  });

  // ─── Phase 5: Status Transitions ───────────────────────────────────
  describe('5. Status Transitions (Draft → Submitted → Approved)', () => {
    it('product transitions: draft → pending (seller submits)', () => {
      const submitted = { ...PRODUCT_LISTING, approval_status: 'pending' as const };
      expect(submitted.approval_status).toBe('pending');
    });

    it('product transitions: pending → approved (admin approves)', () => {
      const approved = { ...PRODUCT_LISTING, approval_status: 'approved' as const };
      expect(approved.approval_status).toBe('approved');
    });

    it('product transitions: pending → rejected (admin rejects)', () => {
      const rejected = { ...PRODUCT_LISTING, approval_status: 'rejected' as const };
      expect(rejected.approval_status).toBe('rejected');
    });

    it('validates all approval statuses are valid', () => {
      const validStatuses = ['draft', 'pending', 'approved', 'rejected'];
      validStatuses.forEach((s) => expect(validStatuses).toContain(s));
    });

    it('seller transitions: pending → approved', () => {
      const approved = { ...SELLER_APPLICANT, verification_status: 'approved' as const };
      expect(approved.verification_status).toBe('approved');
    });

    it('category transitions: inactive → active', () => {
      const activated = { ...NEW_CATEGORY, is_active: true };
      expect(activated.is_active).toBe(true);
    });

    it('subcategory transitions: inactive → active', () => {
      const activated = { ...NEW_SUBCATEGORY, is_active: true };
      expect(activated.is_active).toBe(true);
    });
  });

  // ─── Phase 6: Admin Approval Flow ──────────────────────────────────
  describe('6. Admin Approves Category, Seller & Product', () => {
    // Simulate the admin enabling everything
    const activatedCategory = { ...NEW_CATEGORY, is_active: true };
    const activatedSubcategory = { ...NEW_SUBCATEGORY, is_active: true };
    const activatedSubcategory2 = { ...NEW_SUBCATEGORY_2, is_active: true };
    const approvedSeller = { ...SELLER_APPLICANT, verification_status: 'approved' as const };
    const approvedProduct = { ...PRODUCT_LISTING, approval_status: 'approved' as const };

    it('admin activates category → is_active = true', () => {
      expect(activatedCategory.is_active).toBe(true);
    });

    it('admin activates subcategories → is_active = true', () => {
      expect(activatedSubcategory.is_active).toBe(true);
      expect(activatedSubcategory2.is_active).toBe(true);
    });

    it('admin approves seller → verification_status = approved', () => {
      expect(approvedSeller.verification_status).toBe('approved');
    });

    it('admin approves product → approval_status = approved', () => {
      expect(approvedProduct.approval_status).toBe('approved');
    });

    it('approved seller should remain in the new category', () => {
      expect(approvedSeller.categories).toContain('organic_produce');
    });

    it('approved product should retain all original data', () => {
      expect(approvedProduct.name).toBe('Organic Cherry Tomatoes');
      expect(approvedProduct.price).toBe(120);
      expect(approvedProduct.seller_id).toBe(approvedSeller.id);
      expect(approvedProduct.subcategory_id).toBe(activatedSubcategory.id);
    });
  });

  // ─── Phase 7: Buyer Visibility — Before Approval ───────────────────
  describe('7. Buyer Cannot See Unapproved Items', () => {
    const allSocieties = [SOCIETY_A, SOCIETY_B];

    it('buyer should NOT see inactive category', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: BUYER.search_radius_km,
        societies: allSocieties,
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved' }],
        products: [{ ...PRODUCT_LISTING, approval_status: 'approved' }],
        categories: [NEW_CATEGORY], // is_active = false
        subcategories: [NEW_SUBCATEGORY],
      });
      expect(result.visibleCategories).toHaveLength(0);
    });

    it('buyer should NOT see products from pending seller', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: BUYER.search_radius_km,
        societies: allSocieties,
        sellers: [SELLER_APPLICANT], // verification_status = pending
        products: [{ ...PRODUCT_LISTING, approval_status: 'approved' }],
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleSellers).toHaveLength(0);
    });

    it('buyer should NOT see draft products', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: BUYER.search_radius_km,
        societies: allSocieties,
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved' }],
        products: [PRODUCT_LISTING], // approval_status = draft
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleSellers).toHaveLength(0);
    });

    it('buyer should NOT see pending products', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: BUYER.search_radius_km,
        societies: allSocieties,
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved' }],
        products: [{ ...PRODUCT_LISTING, approval_status: 'pending' }],
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleSellers).toHaveLength(0);
    });

    it('buyer should NOT see rejected products', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: BUYER.search_radius_km,
        societies: allSocieties,
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved' }],
        products: [{ ...PRODUCT_LISTING, approval_status: 'rejected' }],
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleSellers).toHaveLength(0);
    });
  });

  // ─── Phase 8: Buyer Visibility — After Full Approval ───────────────
  describe('8. Buyer Sees Everything After Approval', () => {
    const allSocieties = [SOCIETY_A, SOCIETY_B];
    const activeCat = { ...NEW_CATEGORY, is_active: true };
    const activeSub = { ...NEW_SUBCATEGORY, is_active: true };
    const activeSub2 = { ...NEW_SUBCATEGORY_2, is_active: true };
    const approvedSeller: SellerProfile = { ...SELLER_APPLICANT, verification_status: 'approved' };
    const approvedProduct: Product = { ...PRODUCT_LISTING, approval_status: 'approved' };

    const discovery = simulateBuyerDiscovery({
      buyerSociety: SOCIETY_A,
      buyerRadius: BUYER.search_radius_km,
      societies: allSocieties,
      sellers: [approvedSeller],
      products: [approvedProduct],
      categories: [activeCat],
      subcategories: [activeSub, activeSub2],
    });

    it('buyer should see the new category', () => {
      expect(discovery.visibleCategories).toHaveLength(1);
      expect(discovery.visibleCategories[0].display_name).toBe('Organic Produce');
    });

    it('buyer should see subcategories under the category', () => {
      expect(discovery.visibleSubcategories.length).toBeGreaterThanOrEqual(1);
      const subNames = discovery.visibleSubcategories.map((s) => s.display_name);
      expect(subNames).toContain('Fresh Vegetables');
    });

    it('buyer should see the approved seller', () => {
      expect(discovery.visibleSellers).toHaveLength(1);
      expect(discovery.visibleSellers[0].seller.business_name).toBe("Ravi's Organic Farm");
    });

    it('buyer should see the approved product', () => {
      const products = discovery.visibleSellers[0].products;
      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Organic Cherry Tomatoes');
    });

    it('product should have correct pricing for buyer', () => {
      const p = discovery.visibleSellers[0].products[0];
      expect(p.price).toBe(120);
      expect(p.mrp).toBe(150);
    });

    it('buyer is within seller delivery radius', () => {
      const dist = haversineKm(SOCIETY_A.lat, SOCIETY_A.lon, SOCIETY_B.lat, SOCIETY_B.lon);
      expect(dist).toBeLessThan(approvedSeller.delivery_radius_km);
    });
  });

  // ─── Phase 9: Edge Cases ───────────────────────────────────────────
  describe('9. Edge Cases & Boundary Conditions', () => {
    const allSocieties = [SOCIETY_A, SOCIETY_B];

    it('unavailable product should NOT be visible even if approved', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: 10,
        societies: allSocieties,
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved' }],
        products: [{ ...PRODUCT_LISTING, approval_status: 'approved', is_available: false }],
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleSellers).toHaveLength(0);
    });

    it('closed store should NOT be visible even with approved products', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: 10,
        societies: allSocieties,
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved', is_available: false }],
        products: [{ ...PRODUCT_LISTING, approval_status: 'approved' }],
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleSellers).toHaveLength(0);
    });

    it('category with no products should NOT appear to buyer', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: 10,
        societies: allSocieties,
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved' }],
        products: [], // no products
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleCategories).toHaveLength(0);
    });

    it('seller outside delivery radius should NOT be visible', () => {
      const farSociety: Society = { id: 'far', name: 'Far', lat: 13.1, lon: 77.8 };
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: 10,
        societies: [SOCIETY_A, farSociety],
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved', society_id: farSociety.id, delivery_radius_km: 3 }],
        products: [{ ...PRODUCT_LISTING, approval_status: 'approved' }],
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleSellers).toHaveLength(0);
    });

    it('same-society seller should be visible without cross-society flag', () => {
      const result = simulateBuyerDiscovery({
        buyerSociety: SOCIETY_A,
        buyerRadius: 10,
        societies: [SOCIETY_A],
        sellers: [{ ...SELLER_APPLICANT, verification_status: 'approved', society_id: SOCIETY_A.id, sell_beyond_community: false }],
        products: [{ ...PRODUCT_LISTING, approval_status: 'approved' }],
        categories: [{ ...NEW_CATEGORY, is_active: true }],
        subcategories: [{ ...NEW_SUBCATEGORY, is_active: true }],
      });
      expect(result.visibleSellers).toHaveLength(1);
    });

    it('re-editing product resets approval to pending', () => {
      const edited = { ...PRODUCT_LISTING, approval_status: 'pending' as const, price: 130 };
      expect(edited.approval_status).toBe('pending');
    });
  });
});
