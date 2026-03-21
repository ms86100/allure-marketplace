import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PaymentMethod } from '@/types/database';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { usePaymentMode } from '@/hooks/usePaymentMode';
import { useCurrency } from '@/hooks/useCurrency';
import { useDeliveryAddresses } from '@/hooks/useDeliveryAddresses';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/utils';
import { usePushNotifications } from '@/contexts/PushNotificationContext';
import { computeStoreStatus, formatStoreClosedMessage } from '@/lib/store-availability';

/** Simple deterministic hash for idempotency keys */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// ── Session persistence for UPI payment state ──
// Survives app-switch, re-renders, and component remounts
const PAYMENT_SESSION_KEY = 'sociva_pending_payment_session';

interface PaymentSession {
  orderIds: string[];
  paymentMethod: string;
  amount: number;
  createdAt: number;
  sellerUpiId?: string;
  sellerName?: string;
}

function savePaymentSession(session: PaymentSession) {
  try { sessionStorage.setItem(PAYMENT_SESSION_KEY, JSON.stringify(session)); } catch {}
}

function loadPaymentSession(): PaymentSession | null {
  try {
    const raw = sessionStorage.getItem(PAYMENT_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as PaymentSession;
    // Expire sessions older than 30 minutes
    if (Date.now() - session.createdAt > 30 * 60 * 1000) {
      clearPaymentSession();
      return null;
    }
    return session;
  } catch { return null; }
}

function clearPaymentSession() {
  try { sessionStorage.removeItem(PAYMENT_SESSION_KEY); } catch {}
}

export function useCartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, society } = useAuth();
  const { requestFullPermission } = usePushNotifications();
  const { items, totalAmount, sellerGroups, updateQuantity, removeItem, clearCart, refresh, addItem, isLoading, hasHydrated, pendingMutations } = useCart();
  const idempotencyKeyRef = useRef<string | null>(null);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [showRazorpayCheckout, setShowRazorpayCheckout] = useState(false);
  const [showUpiDeepLink, setShowUpiDeepLink] = useState(false);
  const paymentMode = usePaymentMode();
  const [pendingOrderIds, setPendingOrderIds] = useState<string[]>([]);
  const pendingOrderIdsRef = useRef<string[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<{ id: string; code: string; discountAmount: number; discount_type?: string; discount_value?: number; max_discount_amount?: number | null; min_order_amount?: number | null } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<'self_pickup' | 'delivery'>('self_pickup');
  const [orderStep, setOrderStep] = useState<'validating' | 'creating' | 'confirming'>('validating');
  const [selectedDeliveryAddress, setSelectedDeliveryAddress] = useState<any>(null);
  const settings = useSystemSettings();
  const { formatPrice, currencySymbol } = useCurrency();
  const { addresses, defaultAddress, isLoading: addressesLoading } = useDeliveryAddresses();

  // Keep ref in sync
  useEffect(() => { pendingOrderIdsRef.current = pendingOrderIds; }, [pendingOrderIds]);

  // ── Restore payment session on mount (app resume / remount) ──
  useEffect(() => {
    const session = loadPaymentSession();
    if (!session || session.orderIds.length === 0) return;

    // Restore pending order IDs from session
    setPendingOrderIds(session.orderIds);

    // Re-open the correct payment UI
    if (session.paymentMethod === 'upi') {
      setPaymentMethod('upi');
      // Small delay to allow component to mount with pendingOrderIds
      setTimeout(() => setShowUpiDeepLink(true), 100);
    }
  }, []); // Only on mount

  // Bug 2 fix: Auto-remove coupon when cart drops below min_order_amount
  useEffect(() => {
    if (!appliedCoupon || !appliedCoupon.min_order_amount) return;
    if (totalAmount < appliedCoupon.min_order_amount) {
      setAppliedCoupon(null);
      toast.info(`Coupon "${appliedCoupon.code}" removed — minimum order of ${formatPrice(appliedCoupon.min_order_amount)} not met.`, { id: 'coupon-below-min' });
    }
  }, [totalAmount, appliedCoupon?.min_order_amount]);

  const effectiveCouponDiscount = (() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.discount_type === 'percentage' && appliedCoupon.discount_value) {
      let d = (totalAmount * appliedCoupon.discount_value) / 100;
      if (appliedCoupon.max_discount_amount) d = Math.min(d, appliedCoupon.max_discount_amount);
      return Math.round(d * 100) / 100;
    }
    // Bug 5 fix: Recalculate fixed-amount coupons dynamically (never exceed cart total)
    const fixedValue = appliedCoupon.discount_value ?? appliedCoupon.discountAmount;
    return Math.min(fixedValue, totalAmount);
  })();

  const effectiveDeliveryFee = fulfillmentType === 'delivery' ? (totalAmount >= settings.freeDeliveryThreshold ? 0 : settings.baseDeliveryFee) : 0;
  const finalAmount = (appliedCoupon ? Math.max(0, totalAmount - effectiveCouponDiscount) : totalAmount) + effectiveDeliveryFee;

  const firstSeller = sellerGroups[0]?.items[0]?.product?.seller;
  const firstSellerFulfillmentMode = (firstSeller as any)?.fulfillment_mode as 'self_pickup' | 'seller_delivery' | 'platform_delivery' | 'pickup_and_seller_delivery' | 'pickup_and_platform_delivery' | undefined;
  const acceptsCod = sellerGroups.length > 1
    ? sellerGroups.every(g => g.items[0]?.product?.seller?.accepts_cod ?? true)
    : (firstSeller?.accepts_cod ?? true);
  // When Razorpay is enabled, online payment is always available (not dependent on seller UPI config)
  const acceptsUpi = paymentMode.isRazorpay
    ? true
    : (sellerGroups.length <= 1 && !!(firstSeller as any)?.accepts_upi && !!(firstSeller as any)?.upi_id);
  const hasFulfillmentConflict = sellerGroups.length > 1 && sellerGroups.some(g => {
    const mode = (g.items[0]?.product?.seller as any)?.fulfillment_mode;
    return mode && mode !== 'self_pickup' && !mode.startsWith('pickup_and_') && mode !== fulfillmentType;
  });
  const hasBelowMinimumOrder = sellerGroups.some(g => {
    const minOrder = (g.items[0]?.product?.seller as any)?.minimum_order_amount;
    return minOrder && g.subtotal < minOrder;
  });
  const noPaymentMethodAvailable = !acceptsCod && !acceptsUpi;

  useEffect(() => {
    if (!acceptsCod && acceptsUpi) setPaymentMethod('upi');
    else if (acceptsCod && !acceptsUpi) setPaymentMethod('cod');
  }, [acceptsCod, acceptsUpi]);

  useEffect(() => {
    if (sellerGroups.length === 0) return;
    const firstMode = (firstSeller as any)?.fulfillment_mode;
    if (firstMode === 'seller_delivery' || firstMode === 'platform_delivery') setFulfillmentType('delivery');
    else if (firstMode?.startsWith('pickup_and_')) setFulfillmentType('delivery');
    else setFulfillmentType('self_pickup');
  }, [sellerGroups.length, firstSeller]);

  // Clear coupon when seller composition changes (multi-vendor or different seller)
  const currentSellerId = sellerGroups.length === 1 ? sellerGroups[0].sellerId : null;
  useEffect(() => {
    if (sellerGroups.length > 1 && appliedCoupon) setAppliedCoupon(null);
  }, [sellerGroups.length]);
  const prevSellerIdRef = useRef(currentSellerId);
  useEffect(() => {
    // Only clear coupon when seller genuinely changes (not on initial mount or same-seller re-derive)
    if (prevSellerIdRef.current && currentSellerId && prevSellerIdRef.current !== currentSellerId && appliedCoupon) {
      setAppliedCoupon(null);
    }
    prevSellerIdRef.current = currentSellerId;
  }, [currentSellerId]);

  // Auto-select default delivery address
  useEffect(() => {
    if (!selectedDeliveryAddress && defaultAddress) {
      setSelectedDeliveryAddress(defaultAddress);
    }
  }, [defaultAddress, selectedDeliveryAddress]);

  const hasUrgentItem = items.some((item) => (item.product as any)?.is_urgent);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const maxPrepTime = items.reduce((max, item) => {
    const pt = (item.product as any)?.prep_time_minutes;
    return pt && pt > max ? pt : max;
  }, 0);

  const createOrdersForAllSellers = async (paymentStatus: 'pending' | 'paid', transactionRef?: string) => {
    if (!user || !profile || sellerGroups.length === 0) return [];

    const sellerGroupsPayload = sellerGroups.map((group) => ({
      seller_id: group.sellerId, subtotal: group.subtotal,
      items: group.items.map((item) => ({ product_id: item.product_id, product_name: item.product?.name || 'Unknown', quantity: item.quantity, unit_price: item.product?.price || 0 })),
    }));

    const { data: freshPrices } = await supabase.from('products').select('id, price').in('id', items.map(i => i.product_id));
    const priceMismatch = items.find(item => {
      const fresh = freshPrices?.find(p => p.id === item.product_id);
      return fresh && Math.abs(fresh.price - (item.product?.price || 0)) > 0.01;
    });
    if (priceMismatch) { toast.error('Some item prices have changed. Refreshing your cart...', { id: 'checkout-price-mismatch' }); await refresh(); throw new Error('Price mismatch detected'); }

    const deliveryAddressText = fulfillmentType === 'delivery' && selectedDeliveryAddress
      ? [selectedDeliveryAddress.flat_number && `Flat ${selectedDeliveryAddress.flat_number}`, selectedDeliveryAddress.block && `Block ${selectedDeliveryAddress.block}`, selectedDeliveryAddress.building_name, selectedDeliveryAddress.landmark].filter(Boolean).join(', ')
      : [profile.block, profile.flat_number].filter(Boolean).join(', ');

    // Generate idempotency key if not already set for this attempt
    if (!idempotencyKeyRef.current) {
      const cartHash = items.map(i => `${i.product_id}:${i.quantity}`).sort().join('|');
      idempotencyKeyRef.current = `${user.id}_${Date.now()}_${simpleHash(cartHash)}`;
    }

    const { data, error } = await supabase.rpc('create_multi_vendor_orders', {
      _buyer_id: user.id, _delivery_address: deliveryAddressText,
      _notes: notes || null, _payment_method: paymentMethod, _payment_status: paymentStatus,
      _coupon_id: appliedCoupon?.id || null, _coupon_code: appliedCoupon?.code || null,
      _coupon_discount: effectiveCouponDiscount, _cart_total: totalAmount, _has_urgent: hasUrgentItem,
      _seller_groups: sellerGroupsPayload, _fulfillment_type: fulfillmentType, _delivery_fee: effectiveDeliveryFee,
      _delivery_address_id: selectedDeliveryAddress?.id || null,
      _delivery_lat: selectedDeliveryAddress?.latitude || null,
      _delivery_lng: selectedDeliveryAddress?.longitude || null,
      _idempotency_key: idempotencyKeyRef.current,
    } as any);
    if (error) {
      // Do NOT reset idempotency key — retry must use the same key
      // so the DB advisory lock + dedup check can detect the duplicate.
      // Key is only reset on confirmed success or business-logic rejection.
      throw error;
    }

    const result = data as { success: boolean; order_ids?: string[]; order_count?: number; error?: string; unavailable_items?: string[]; closed_sellers?: string[]; out_of_range_sellers?: string[]; deduplicated?: boolean };
    if (!result?.success) {
      idempotencyKeyRef.current = null;
      if (result?.error === 'stock_validation_failed' && result?.unavailable_items) throw new Error(`Some items are unavailable:\n• ${result.unavailable_items.join('\n• ')}`);
      if (result?.error === 'store_closed') { const sellers = result.closed_sellers?.join(', '); throw new Error(sellers ? `Store closed: ${sellers}` : 'Store is currently closed. Please try again later.'); }
      if (result?.error === 'delivery_out_of_range') { const sellers = result.out_of_range_sellers?.join('\n• '); throw new Error(sellers ? `Delivery not possible:\n• ${sellers}` : 'Delivery address is out of range for one or more sellers.'); }
      throw new Error('Failed to create orders');
    }
    // Reset idempotency key after successful (non-deduplicated) creation
    if (!result.deduplicated) idempotencyKeyRef.current = null;
    return result.order_ids || [];
  };

  /** Force-clear cart from both DB and query cache */
  const clearCartAndCache = useCallback(async () => {
    await clearCart();
    if (user) {
      queryClient.setQueryData(['cart-items', user.id], []);
      queryClient.setQueryData(['cart-count', user.id], 0);
    }
  }, [clearCart, queryClient, user]);

  const handlePlaceOrderInner = async () => {
    if (!user || !profile || sellerGroups.length === 0) return;

    // GUARD: Check for existing pending unpaid orders to prevent duplicates
    const existingSession = loadPaymentSession();
    const pendingIds = pendingOrderIdsRef.current.length > 0 ? pendingOrderIdsRef.current : (existingSession?.orderIds || []);

    if (pendingIds.length > 0) {
      const { data: existingOrders } = await supabase
        .from('orders')
        .select('id, status, payment_status')
        .in('id', pendingIds)
        .eq('buyer_id', user.id);

      const stillPending = existingOrders?.filter(o => o.status !== 'cancelled' && o.payment_status !== 'paid' && o.payment_status !== 'buyer_confirmed');
      if (stillPending && stillPending.length > 0) {
        toast.error('You have a pending payment. Please complete or cancel it first.', { id: 'checkout-pending' });
        // Re-open the UPI payment sheet
        setPendingOrderIds(stillPending.map(o => o.id));
        if (paymentMethod === 'upi' && paymentMode.isUpiDeepLink) {
          setShowUpiDeepLink(true);
        }
        return;
      }
      // All pending orders were cancelled or paid — clear session
      setPendingOrderIds([]);
      clearPaymentSession();
    }

    const selfSellerGroup = sellerGroups.find(g => { const sellerUserId = (g.items[0]?.product?.seller as any)?.user_id; return sellerUserId && sellerUserId === user.id; });
    if (selfSellerGroup) { toast.error("You cannot place an order from your own store.", { id: 'checkout-self-order' }); return; }
    if (!navigator.onLine) { toast.error("You're offline. Please check your connection and try again.", { id: 'checkout-offline' }); return; }
    if (fulfillmentType === 'delivery' && !selectedDeliveryAddress) { toast.error('Please select a delivery address before placing your order.', { id: 'checkout-no-address' }); return; }
    if (fulfillmentType === 'delivery' && selectedDeliveryAddress && !selectedDeliveryAddress.latitude) { toast.error('Your selected address has no location coordinates. Please update it with a precise location.', { id: 'checkout-no-coords' }); return; }

    for (const group of sellerGroups) {
      const minOrder = (group.items[0]?.product?.seller as any)?.minimum_order_amount;
      if (minOrder && group.subtotal < minOrder) { toast.error(`${group.sellerName} requires a minimum order of ${formatPrice(minOrder)}. Your current total is ${formatPrice(group.subtotal)}.`, { id: 'checkout-min-order' }); return; }
    }

    setIsPlacingOrder(true);
    setOrderStep('validating');
    hapticImpact('medium');
    try {
      const productIds = items.map(i => i.product_id);
      const { data: freshProducts, error: freshError } = await supabase.from('products').select('id, is_available, approval_status, seller_id').in('id', productIds);
      if (freshError) throw freshError;

      const unavailable = items.filter(item => { const fresh = freshProducts?.find(p => p.id === item.product_id); return !fresh || !fresh.is_available || fresh.approval_status !== 'approved'; });
      if (unavailable.length > 0) { toast.error(`Some items are no longer available: ${unavailable.map(i => i.product?.name || 'Unknown').join(', ')}. Please remove them and try again.`, { id: 'checkout-unavailable' }); await refresh(); setIsPlacingOrder(false); return; }

      const closedSellers: string[] = [];
      for (const group of sellerGroups) {
        const seller = group.items[0]?.product?.seller as any;
        if (seller) {
          const availability = computeStoreStatus(seller.availability_start, seller.availability_end, seller.operating_days, seller.is_available ?? true);
          if (availability.status !== 'open') closedSellers.push(`${group.sellerName} (${formatStoreClosedMessage(availability) || 'closed'})`);
        }
      }
      if (closedSellers.length > 0) { toast.error(`Cannot place order — ${closedSellers.join(', ')} ${closedSellers.length === 1 ? 'is' : 'are'} currently closed. Please remove those items or try again later.`, { id: 'checkout-closed' }); setIsPlacingOrder(false); return; }
    } catch (err) { console.error('Pre-checkout validation failed:', err); toast.error('Could not verify item availability. Please try again.', { id: 'checkout-validation' }); setIsPlacingOrder(false); return; }

    if (paymentMethod === 'cod' && !acceptsCod) { toast.error('This seller does not accept Cash on Delivery. Please select UPI.', { id: 'checkout-no-cod' }); setIsPlacingOrder(false); return; }

    if (paymentMethod === 'upi') {
      if (!acceptsUpi) { toast.error('Online payment not available', { id: 'upi-unavailable' }); setIsPlacingOrder(false); return; }
      // Pre-validate seller UPI ID only for direct UPI mode (not Razorpay)
      if (!paymentMode.isRazorpay) {
        const firstSeller = sellerGroups[0]?.items[0]?.product?.seller as any;
        if (!firstSeller?.upi_id) { toast.error('This seller is not accepting UPI payments right now', { id: 'upi-no-id' }); setIsPlacingOrder(false); return; }
      }
      setOrderStep('creating');
      try {
        const orderIds = await createOrdersForAllSellers('pending');
        if (orderIds.length === 0) throw new Error('Failed to create orders');
        setPendingOrderIds(orderIds);
        // CRITICAL: Persist payment session so it survives app-switch
        const sellerForSession = sellerGroups[0]?.items[0]?.product?.seller as any;
        savePaymentSession({
          orderIds,
          paymentMethod: 'upi',
          amount: finalAmount,
          createdAt: Date.now(),
          sellerUpiId: sellerForSession?.upi_id || undefined,
          sellerName: sellerGroups[0]?.sellerName || undefined,
        });
        // Do NOT clear cart — cart stays until payment is confirmed
        upiCompletionRef.current = false; // Reset guard for new payment session
        if (paymentMode.isUpiDeepLink) {
          setShowUpiDeepLink(true);
        } else {
          setShowRazorpayCheckout(true);
        }
      } catch (error: any) { console.error('Error creating orders:', error); toast.error(friendlyError(error), { id: 'checkout-create-error' }); }
      finally { setIsPlacingOrder(false); }
      return;
    }

    // COD flow — order is confirmed immediately
    setOrderStep('creating');
    try {
      const orderIds = await createOrdersForAllSellers('pending');
      if (orderIds.length === 0) throw new Error('Failed to create orders');
      // COD: await cart clear to ensure DB delete completes before navigating
      await clearCartAndCache(); hapticNotification('success');
      requestFullPermission().catch(() => {});
      supabase.functions.invoke('process-notification-queue').catch(() => {});
      if (orderIds.length === 1) { toast.success('Order placed successfully!', { id: 'order-placed' }); navigate(`/orders/${orderIds[0]}`); }
      else { toast.success(`${orderIds.length} orders placed successfully!`, { id: 'order-placed' }); navigate('/orders'); }
    } catch (error: any) { console.error('Error placing order:', error); toast.error(friendlyError(error), { id: 'checkout-error' }); }
    finally { setIsPlacingOrder(false); }
  };

  const handlePlaceOrder = useSubmitGuard(handlePlaceOrderInner, 3000, 0);

  const handleRazorpaySuccess = async (_paymentId: string) => {
    setShowRazorpayCheckout(false);
    const targetOrderId = pendingOrderIds[0];
    if (targetOrderId) {
      let confirmed = false;
      for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 1500)); const { data } = await supabase.from('orders').select('payment_status').eq('id', targetOrderId).single(); if (data?.payment_status === 'paid') { confirmed = true; break; } }
      if (!confirmed) {
        toast.info('Payment is being verified. Your order will update shortly.', { id: 'razorpay-verifying' });
        // Do NOT clear cart — payment unconfirmed. Navigate to order detail so buyer can track status.
        clearPaymentSession();
        navigate(pendingOrderIds.length === 1 ? `/orders/${pendingOrderIds[0]}` : '/orders');
        setPendingOrderIds([]);
        return;
      }
      toast.success('Payment successful! Order placed.', { id: 'razorpay-success' });
    }
    supabase.functions.invoke('process-notification-queue').catch(() => {});
    // Clear cart ONLY after confirmed payment
    await clearCartAndCache();
    clearPaymentSession();
    navigate(pendingOrderIds.length === 1 ? `/orders/${pendingOrderIds[0]}` : '/orders');
    setPendingOrderIds([]);
  };

  const handleRazorpayFailed = async () => {
    setShowRazorpayCheckout(false);
    if (!user?.id) { toast.error('Session expired. Please sign in again.', { id: 'checkout-session' }); setPendingOrderIds([]); clearPaymentSession(); return; }
    if (pendingOrderIds.length > 0) {
      // Poll multiple times before cancelling — webhook may be delayed
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: recheckOrder } = await supabase.from('orders').select('payment_status').eq('id', pendingOrderIds[0]).single();
        if (recheckOrder?.payment_status === 'paid') { toast.success('Payment verified! Your order is confirmed.', { id: 'razorpay-verified' }); await clearCartAndCache(); clearPaymentSession(); navigate(`/orders/${pendingOrderIds[0]}`); setPendingOrderIds([]); return; }
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
      }
      // Cancel only orders that are still unpaid — check each individually to avoid killing webhook-paid ones
      for (const oid of pendingOrderIds) {
        try {
          const { data: check } = await supabase.from('orders').select('payment_status').eq('id', oid).single();
          if (check?.payment_status === 'paid') continue; // Already paid via webhook
          await supabase.from('orders').update({ status: 'cancelled' } as any).eq('id', oid).eq('payment_status', 'pending').eq('buyer_id', user.id);
        } catch (err) { console.error('Failed to cancel order', oid, err); }
      }
    }
    setPendingOrderIds([]);
    clearPaymentSession();
    // Do NOT clear cart on payment failure — user can retry
    toast.error('Payment was not completed. Your order has been cancelled. You can try again.', { id: 'razorpay-failed' });
  };

  // ── UPI completion guard: only ONE of success/failed can execute per session ──
  const upiCompletionRef = useRef(false);

  const handleUpiDeepLinkSuccess = async () => {
    if (upiCompletionRef.current) return;
    upiCompletionRef.current = true;
    setShowUpiDeepLink(false);
    toast.success('Payment submitted! Seller will verify shortly.', { id: 'upi-confirmed' });
    // Clear cart and payment session ONLY after payment confirmation submitted
    await clearCartAndCache();
    clearPaymentSession();
    navigate(pendingOrderIds.length === 1 ? `/orders/${pendingOrderIds[0]}` : '/orders');
    setPendingOrderIds([]);
  };

  const handleUpiDeepLinkFailed = async () => {
    if (upiCompletionRef.current) return;
    upiCompletionRef.current = true;
    setShowUpiDeepLink(false);
    if (!user?.id) { toast.error('Session expired.', { id: 'checkout-session' }); setPendingOrderIds([]); clearPaymentSession(); return; }
    if (pendingOrderIds.length > 0) {
      // Check if payment was actually completed before cancelling
      const { data: recheckOrder } = await supabase.from('orders').select('payment_status').eq('id', pendingOrderIds[0]).single();
      if (recheckOrder?.payment_status === 'paid' || recheckOrder?.payment_status === 'buyer_confirmed') {
        toast.success('Payment was already confirmed! Your order is active.', { id: 'upi-confirmed' });
        await clearCartAndCache();
        clearPaymentSession();
        navigate(`/orders/${pendingOrderIds[0]}`);
        setPendingOrderIds([]);
        return;
      }
      try { await supabase.from('orders').update({ status: 'cancelled' } as any).in('id', pendingOrderIds).eq('payment_status', 'pending').eq('buyer_id', user.id); } catch (err) { console.error('Failed to cancel unpaid orders:', err); }
    }
    setPendingOrderIds([]);
    clearPaymentSession();
    // Do NOT clear cart on payment failure — user can retry with the same items
    toast.error('Payment was not completed. Your order has been cancelled. You can try again.', { id: 'upi-failed' });
  };

  // Compute whether we have an active payment session (for rendering payment UI even if cart is empty)
  const activeSession = loadPaymentSession();
  const hasActivePaymentSession = pendingOrderIds.length > 0 || !!activeSession;
  // Fallback seller details from session for app-resume when cart is empty
  const sessionSellerUpiId = activeSession?.sellerUpiId || '';
  const sessionSellerName = activeSession?.sellerName || 'Seller';
  const sessionAmount = activeSession?.amount || 0;

  return {
    user, profile, society, items, totalAmount, sellerGroups, updateQuantity, removeItem, clearCart, addItem, isLoading, hasHydrated, pendingMutations,
    notes, setNotes, paymentMethod, setPaymentMethod,
    isPlacingOrder, showRazorpayCheckout, showUpiDeepLink, setShowUpiDeepLink, pendingOrderIds, paymentMode,
    appliedCoupon, setAppliedCoupon, showConfirmDialog, setShowConfirmDialog,
    fulfillmentType, setFulfillmentType, orderStep,
    settings, formatPrice, currencySymbol,
    effectiveDeliveryFee, finalAmount, acceptsCod, acceptsUpi,
    hasUrgentItem, itemCount, maxPrepTime,
    effectiveCouponDiscount, firstSellerFulfillmentMode,
    hasFulfillmentConflict, hasBelowMinimumOrder, noPaymentMethodAvailable,
    selectedDeliveryAddress, setSelectedDeliveryAddress, addresses, addressesLoading,
    handlePlaceOrder, handleRazorpaySuccess, handleRazorpayFailed,
    handleUpiDeepLinkSuccess, handleUpiDeepLinkFailed,
    hasActivePaymentSession, sessionSellerUpiId, sessionSellerName, sessionAmount,
    cancelPlacingOrder: () => { setIsPlacingOrder(false); setOrderStep('validating'); },
  };
}
