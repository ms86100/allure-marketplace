import { createContext, useContext, useCallback, useEffect, useMemo, useRef, ReactNode, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CartItem, Product } from '@/types/database';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/query-utils';
import { computeStoreStatus, formatStoreClosedMessage, type StoreStatus } from '@/lib/store-availability';
import {
  feedbackAddItem,
  feedbackAddItemFailed,
  feedbackRemoveItem,
  feedbackRemoveItemFailed,
  feedbackQuantityChanged,
  feedbackQuantityFailed,
  feedbackCartCleared,
} from '@/lib/feedbackEngine';

const hasOwn = (obj: unknown, key: string) => Object.prototype.hasOwnProperty.call(obj ?? {}, key);

/**
 * CART INTEGRITY CONTRACT
 * -----------------------
 * The cart badge (useCartCount / BottomNav) and the cart page (useCart / CartPage)
 * MUST always agree. The following multi-layer defenses ensure that the cart page
 * can NEVER show "Your cart is empty" while the badge shows a non-zero count:
 *
 * Layer 1 — queryFn self-heal: If fetchCartItems returns [], we do a cheap COUNT
 *           check. If rows exist, we retry once with a delay. This catches transient
 *           PostgREST/network glitches at the data layer.
 *
 * Layer 2 — reconcile guard: After mutations, reconcile() double-checks before
 *           accepting an empty result. If the count query disagrees, it invalidates
 *           instead of clobbering the cache.
 *
 * Layer 3 — mismatch recovery: A useEffect detects when items=[] but the count
 *           cache says >0. It triggers up to 3 aggressive refetches with staggered
 *           delays (0ms, 500ms, 1500ms). isRecoveringCart stays true throughout.
 *
 * Layer 4 — CartPage veto: The empty-state UI is gated on BOTH items.length===0
 *           AND !isRecoveringCart AND !isFetching AND pendingMutations===0.
 *           This is the last line of defense — even if all other layers fail,
 *           the user sees "Loading your cart…" instead of a false empty state.
 */

function parseStoreAvailabilityError(error: unknown): string | null {
  const msg = String((error as any)?.message || '');
  const statusMatch = msg.match(/STORE_CLOSED:([a-z_]+)/i);
  if (statusMatch?.[1]) {
    const status = statusMatch[1].toLowerCase() as StoreStatus;
    return formatStoreClosedMessage({ status, nextOpenAt: null, minutesUntilOpen: null }) || 'This store is currently closed.';
  }
  if (msg.includes('PRODUCT_NOT_ORDERABLE')) return 'This item is no longer available.';
  if (msg.includes('SELLER_NOT_FOUND')) return 'Seller is unavailable right now.';
  return null;
}

function getInlineSellerAvailability(product: Product) {
  const p = product as any;
  const seller = p?.seller as any;
  const hasProductAvailabilityFields =
    hasOwn(p, 'seller_availability_start') || hasOwn(p, 'seller_availability_end') ||
    hasOwn(p, 'seller_operating_days') || hasOwn(p, 'seller_is_available');
  const hasSellerAvailabilityFields = !!seller && (
    hasOwn(seller, 'availability_start') || hasOwn(seller, 'availability_end') ||
    hasOwn(seller, 'operating_days') || hasOwn(seller, 'is_available'));
  return {
    hasInlineAvailability: hasProductAvailabilityFields || hasSellerAvailabilityFields,
    availabilityStart: p.seller_availability_start ?? seller?.availability_start ?? null,
    availabilityEnd: p.seller_availability_end ?? seller?.availability_end ?? null,
    operatingDays: p.seller_operating_days ?? seller?.operating_days ?? null,
    isAvailable: p.seller_is_available ?? seller?.is_available ?? true,
  };
}

interface SellerGroup {
  sellerId: string;
  sellerName: string;
  items: (CartItem & { product: Product })[];
  subtotal: number;
}

interface CartContextType {
  items: (CartItem & { product: Product })[];
  itemCount: number;
  totalAmount: number;
  sellerGroups: SellerGroup[];
  isLoading: boolean;
  isFetching: boolean;
  hasHydrated: boolean;
  isRecoveringCart: boolean;
  /** Number of cart mutations currently in-flight */
  pendingMutations: number;
  addItem: (product: Product, quantity?: number, silent?: boolean) => Promise<void>;
  replaceCart: (inserts: { product_id: string; quantity: number }[]) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_QUERY_KEY = ['cart-items'] as const;

// ── Shared authoritative fetch ──
async function fetchCartItems(userId: string) {
  const { data, error } = await supabase
    .from('cart_items')
    .select(`*, product:products(*, seller:seller_profiles(*))`)
    .eq('user_id', userId);
  if (error) throw error;
  const items = (data as any as (CartItem & { product: Product })[]) || [];
  const filtered = items.filter(item => item.product != null && item.product.is_available !== false);

  // Layer 1: Self-heal — if we got zero items, verify with a cheap count query.
  // This catches transient PostgREST issues where the JOIN returns empty but rows exist.
  if (filtered.length === 0 && items.length === 0) {
    const { count } = await supabase
      .from('cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (count && count > 0) {
      // Rows exist but the full query missed them — wait briefly and retry once
      await new Promise(r => setTimeout(r, 300));
      const { data: retryData, error: retryError } = await supabase
        .from('cart_items')
        .select(`*, product:products(*, seller:seller_profiles(*))`)
        .eq('user_id', userId);
      if (!retryError && retryData) {
        const retryFiltered = (retryData as any as (CartItem & { product: Product })[])
          .filter(item => item.product != null && item.product.is_available !== false);
        if (retryFiltered.length > 0) return retryFiltered;
      }
    }
  }

  return filtered;
}

async function fetchCartItemCount(userId: string) {
  const { data, error } = await supabase
    .from('cart_items')
    .select('quantity, product:products!inner(is_available)')
    .eq('user_id', userId)
    .eq('product.is_available', true);
  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + (row.quantity || 0), 0);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isSessionRestored } = useAuth();
  const queryClient = useQueryClient();

  // Global mutation counter — prevents stale reads from overwriting optimistic state
  const mutationSeqRef = useRef(0);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [recoveryAttempts, setRecoveryAttempts] = useState(0);
  const MAX_RECOVERY_ATTEMPTS = 3;
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: items = [], isLoading, isFetching, isFetched } = useQuery({
    queryKey: [...CART_QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];
      return fetchCartItems(user.id);
    },
    enabled: isSessionRestored && !!user,
    staleTime: 5 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: fallbackItemCount = 0 } = useQuery({
    queryKey: ['cart-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      return fetchCartItemCount(user.id);
    },
    enabled: isSessionRestored && !!user,
    staleTime: 5 * 1000,
    refetchOnWindowFocus: true,
  });

  // ── Mutation helpers ──
  const cartKey = useCallback(() => [...CART_QUERY_KEY, user?.id], [user?.id]);
  const countKey = useCallback(() => ['cart-count', user?.id], [user?.id]);

  /** Cancel in-flight cart queries so stale responses can't overwrite optimistic state */
  const cancelCartQueries = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY, exact: false });
    await queryClient.cancelQueries({ queryKey: ['cart-count'], exact: false });
  }, [queryClient]);

  /** Snapshot current cart state for rollback */
  const snapshot = useCallback(() => ({
    items: queryClient.getQueryData(cartKey()) as (CartItem & { product: Product })[] | undefined,
    count: queryClient.getQueryData(countKey()) as number | undefined,
  }), [queryClient, cartKey, countKey]);

  /** Restore snapshot on error */
  const rollback = useCallback((snap: ReturnType<typeof snapshot>) => {
    if (snap.items !== undefined) queryClient.setQueryData(cartKey(), snap.items);
    if (snap.count !== undefined) queryClient.setQueryData(countKey(), snap.count);
  }, [queryClient, cartKey, countKey]);

  /** After a successful mutation, do an authoritative fetch and seed both caches */
  const reconcile = useCallback(async () => {
    if (!user) return;
    const seq = ++mutationSeqRef.current;
    try {
      const freshItems = await fetchCartItems(user.id);
      // Only apply if no newer mutation has started
      if (mutationSeqRef.current === seq) {
        // Guard: don't replace non-empty cache with empty result (likely transient failure)
        const currentItems = queryClient.getQueryData(cartKey()) as any[] | undefined;
        if (freshItems.length === 0 && currentItems && currentItems.length > 0) {
          // Layer 2: Double-check with count before deciding
          try {
            const verifyCount = await fetchCartItemCount(user.id);
            if (verifyCount > 0) {
              // Items exist server-side — don't trust the empty result, force refetch
              queryClient.refetchQueries({ queryKey: cartKey(), exact: true });
              queryClient.refetchQueries({ queryKey: countKey(), exact: true });
              return;
            }
            // Count is genuinely 0 — cart was actually cleared (e.g. by another tab)
            queryClient.setQueryData(cartKey(), []);
            queryClient.setQueryData(countKey(), 0);
          } catch {
            // Count check failed — be safe, invalidate
            queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY, exact: false });
          }
          return;
        }
        queryClient.setQueryData(cartKey(), freshItems);
        queryClient.setQueryData(countKey(), freshItems.reduce((s, i) => s + i.quantity, 0));
      }
    } catch {
      // If reconcile fails, just invalidate — react-query will retry
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY, exact: false });
    }
  }, [user, queryClient, cartKey, countKey]);

  const setOptimistic = useCallback((updater: (prev: (CartItem & { product: Product })[]) => (CartItem & { product: Product })[]) => {
    queryClient.setQueryData(cartKey(), (old: any) => updater(old || []));
  }, [queryClient, cartKey]);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0), [items]);
  // Layer 3: Detect mismatch — items array is empty but count cache says otherwise
  const hasCartCountMismatch = !!user && isFetched && !isFetching && pendingMutations === 0
    && items.length === 0 && fallbackItemCount > 0;
  const isRecoveringCart = hasCartCountMismatch && recoveryAttempts < MAX_RECOVERY_ATTEMPTS;

  const sellerGroups: SellerGroup[] = useMemo(() =>
    Object.values(
      items.reduce<Record<string, SellerGroup>>((groups, item) => {
        const sellerId = item.product?.seller_id || 'unknown';
        if (!groups[sellerId]) {
          groups[sellerId] = { sellerId, sellerName: (item.product as any)?.seller?.business_name || '', items: [], subtotal: 0 };
        }
        groups[sellerId].items.push(item);
        groups[sellerId].subtotal += (item.product?.price || 0) * item.quantity;
        return groups;
      }, {})
    ), [items]);

  // Per-product mutex to prevent race conditions on rapid taps
  const addItemLocksRef = useRef<Set<string>>(new Set());

  const addItem = useCallback(async (product: Product, quantity = 1, silent = false) => {
    if (!user) { toast.error('Please sign in to add items to cart', { id: 'cart-sign-in' }); return; }
    if (addItemLocksRef.current.has(product.id)) return;
    addItemLocksRef.current.add(product.id);

    try {
      const pActionType = (product as any).action_type;
      if (pActionType && !['add_to_cart', 'buy_now'].includes(pActionType)) { toast.error('This item cannot be added to cart', { id: 'cart-not-allowed' }); return; }

      const inlineAvailability = getInlineSellerAvailability(product);
      let availability = computeStoreStatus(inlineAvailability.availabilityStart, inlineAvailability.availabilityEnd, inlineAvailability.operatingDays, inlineAvailability.isAvailable);
      if (!inlineAvailability.hasInlineAvailability) {
        if (!product.seller_id) { toast.error('Unable to verify store availability right now. Please try again.', { id: 'cart-availability' }); return; }
        const { data: sellerSnapshot, error: sellerError } = await supabase.from('seller_profiles').select('availability_start, availability_end, operating_days, is_available').eq('id', product.seller_id).maybeSingle();
        if (sellerError || !sellerSnapshot) { toast.error('Unable to verify store availability right now. Please try again.', { id: 'cart-availability' }); return; }
        availability = computeStoreStatus(sellerSnapshot.availability_start, sellerSnapshot.availability_end, sellerSnapshot.operating_days, sellerSnapshot.is_available ?? true);
      }
      if (availability.status !== 'open') { const msg = formatStoreClosedMessage(availability); toast.error(msg || 'This store is currently closed. Please try again later.', { id: 'cart-store-closed' }); return; }

      // Committed to mutation — track it
      setPendingMutations(c => c + 1);

      // Cancel + snapshot + optimistic
      await cancelCartQueries();
      const snap = snapshot();

      setOptimistic(prev => {
        const existing = prev.find(item => item.product_id === product.id);
        if (existing) return prev.map(item => item.product_id === product.id ? { ...item, quantity: Math.min(item.quantity + quantity, 99) } : item);
        return [...prev, { id: `temp-${crypto.randomUUID()}`, user_id: user.id, product_id: product.id, quantity, created_at: new Date().toISOString(), product, society_id: null } as CartItem & { product: Product }];
      });
      queryClient.setQueryData(countKey(), (old: number | undefined) => (old || 0) + quantity);

      try {
        const { data: existing } = await supabase.from('cart_items').select('quantity').eq('user_id', user.id).eq('product_id', product.id).maybeSingle();
        if (existing) {
          const { error } = await supabase.from('cart_items').update({ quantity: Math.min(existing.quantity + quantity, 99) }).eq('user_id', user.id).eq('product_id', product.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('cart_items').insert({ user_id: user.id, product_id: product.id, quantity });
          if (error) throw error;
        }
        if (!silent) feedbackAddItem(product.name || 'Item');
        // Authoritative reconcile after success
        await reconcile();
      } catch (error) {
        rollback(snap);
        const availabilityError = parseStoreAvailabilityError(error);
        if (availabilityError) toast.error(availabilityError, { id: 'cart-availability-error' });
        else feedbackAddItemFailed(product.name || 'Item');
      }
    } finally {
      addItemLocksRef.current.delete(product.id);
      setPendingMutations(c => Math.max(0, c - 1));
    }
  }, [user, setOptimistic, cancelCartQueries, snapshot, rollback, reconcile, queryClient, countKey]);

  const removeItem = useCallback(async (productId: string) => {
    if (!user) return;
    setPendingMutations(c => c + 1);
    await cancelCartQueries();
    const snap = snapshot();
    const removedItem = (snap.items || []).find(item => item.product_id === productId);
    const removedQty = removedItem?.quantity || 0;

    setOptimistic(old => old.filter(item => item.product_id !== productId));
    queryClient.setQueryData(countKey(), (old: number | undefined) => Math.max(0, (old || 0) - removedQty));

    try {
      const { error } = await supabase.from('cart_items').delete().eq('user_id', user.id).eq('product_id', productId);
      if (error) throw error;
      feedbackRemoveItem(removedItem?.product?.name || 'Item', removedItem ? () => {
        addItem(removedItem.product, removedQty, true);
      } : undefined);
      await reconcile();
    } catch (error) {
      rollback(snap);
      feedbackRemoveItemFailed();
    } finally {
      setPendingMutations(c => Math.max(0, c - 1));
    }
  }, [user, setOptimistic, cancelCartQueries, snapshot, rollback, reconcile, queryClient, countKey]);

  const updateQuantity = useCallback(async (productId: string, quantity: number) => {
    if (!user) return;
    if (quantity <= 0) { await removeItem(productId); return; }
    const cappedQuantity = Math.min(quantity, 99);
    setPendingMutations(c => c + 1);
    await cancelCartQueries();
    const snap = snapshot();
    const oldItem = (snap.items || []).find(item => item.product_id === productId);
    const qtyDelta = cappedQuantity - (oldItem?.quantity || 0);

    setOptimistic(old => old.map(item => item.product_id === productId ? { ...item, quantity: cappedQuantity } : item));
    if (qtyDelta !== 0) queryClient.setQueryData(countKey(), (old: number | undefined) => Math.max(0, (old || 0) + qtyDelta));

    try {
      const { error } = await supabase.from('cart_items').update({ quantity: cappedQuantity }).eq('user_id', user.id).eq('product_id', productId);
      if (error) throw error;
      feedbackQuantityChanged();
      await reconcile();
    } catch (error) {
      rollback(snap);
      const availabilityError = parseStoreAvailabilityError(error);
      if (availabilityError) toast.error(availabilityError, { id: 'cart-qty-availability' });
      else feedbackQuantityFailed();
    } finally {
      setPendingMutations(c => Math.max(0, c - 1));
    }
  }, [user, setOptimistic, removeItem, cancelCartQueries, snapshot, rollback, reconcile, queryClient, countKey]);

  const clearCart = useCallback(async () => {
    if (!user) return;
    setPendingMutations(c => c + 1);
    await cancelCartQueries();
    const snap = snapshot();
    setOptimistic(() => []);
    queryClient.setQueryData(countKey(), 0);
    try {
      const { error } = await supabase.from('cart_items').delete().eq('user_id', user.id);
      if (error) throw error;
      feedbackCartCleared();
    } catch (error) {
      rollback(snap);
      console.error('Error clearing cart:', error);
    } finally {
      setPendingMutations(c => Math.max(0, c - 1));
    }
  }, [user, setOptimistic, cancelCartQueries, snapshot, rollback, queryClient, countKey]);

  // Bug 3 fix: Snapshot cart before delete so we can restore on insert failure
  const replaceCart = useCallback(async (inserts: { product_id: string; quantity: number }[]) => {
    if (!user || inserts.length === 0) return;
    setPendingMutations(c => c + 1);
    await cancelCartQueries();
    const snap = snapshot();
    const totalQty = inserts.reduce((s, i) => s + i.quantity, 0);
    queryClient.setQueryData(countKey(), totalQty);

    try {
      // Snapshot existing cart items for rollback
      const { data: existingItems } = await supabase
        .from('cart_items')
        .select('product_id, quantity')
        .eq('user_id', user.id);

      await supabase.from('cart_items').delete().eq('user_id', user.id);

      const { error } = await supabase
        .from('cart_items')
        .insert(inserts.map(i => ({ user_id: user.id, product_id: i.product_id, quantity: i.quantity })));

      if (error) {
        // Restore original cart items
        if (existingItems && existingItems.length > 0) {
          await supabase.from('cart_items').insert(
            existingItems.map(i => ({ user_id: user.id, product_id: i.product_id, quantity: i.quantity }))
          );
        }
        rollback(snap);
        throw error;
      }
      await reconcile();
    } catch (error) {
      await reconcile();
      throw error;
    } finally {
      setPendingMutations(c => Math.max(0, c - 1));
    }
  }, [user, queryClient, cancelCartQueries, countKey, reconcile, snapshot, rollback]);

  const hasHydrated = isFetched;

  // Reset recovery counter when items arrive or count drops to 0
  useEffect(() => {
    if (!user || items.length > 0 || fallbackItemCount === 0) {
      if (recoveryTimerRef.current) { clearTimeout(recoveryTimerRef.current); recoveryTimerRef.current = null; }
      setRecoveryAttempts(0);
    }
  }, [user, items.length, fallbackItemCount]);

  // Layer 3: Aggressive staggered recovery refetches
  useEffect(() => {
    if (!hasCartCountMismatch || recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) return;
    // Staggered delays: immediate, 500ms, 1500ms
    const delays = [0, 500, 1500];
    const delay = delays[recoveryAttempts] ?? 1500;
    recoveryTimerRef.current = setTimeout(() => {
      recoveryTimerRef.current = null;
      setRecoveryAttempts(prev => prev + 1);
      // Force refetch (not just invalidate) for immediate execution
      queryClient.refetchQueries({ queryKey: cartKey(), exact: true });
      // Also refetch count to keep them in sync
      queryClient.refetchQueries({ queryKey: countKey(), exact: true });
    }, delay);
    return () => { if (recoveryTimerRef.current) { clearTimeout(recoveryTimerRef.current); recoveryTimerRef.current = null; } };
  }, [hasCartCountMismatch, recoveryAttempts, queryClient, cartKey, countKey]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current); };
  }, []);

  // Keep cart-count cache in sync with items (eliminates split-brain)
  useEffect(() => {
    if (hasHydrated && user && !hasCartCountMismatch) {
      queryClient.setQueryData(['cart-count', user.id], itemCount);
    }
  }, [hasHydrated, user, itemCount, queryClient, hasCartCountMismatch]);

  const contextValue = useMemo<CartContextType>(() => ({
    items, itemCount, totalAmount, sellerGroups, isLoading, isFetching, hasHydrated, isRecoveringCart, pendingMutations, addItem, replaceCart, updateQuantity, removeItem, clearCart,
    refresh: async () => { if (user) await reconcile(); },
  }), [items, itemCount, totalAmount, sellerGroups, isLoading, isFetching, hasHydrated, isRecoveringCart, pendingMutations, addItem, replaceCart, updateQuantity, removeItem, clearCart, user, reconcile]);

  return <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) throw new Error('useCart must be used within a CartProvider');
  return context;
}
