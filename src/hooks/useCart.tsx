import { createContext, useContext, useCallback, useMemo, useRef, ReactNode, useState } from 'react';
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
} from '@/lib/feedbackEngine';

const hasOwn = (obj: unknown, key: string) => Object.prototype.hasOwnProperty.call(obj ?? {}, key);

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
  hasHydrated: boolean;
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
  return items.filter(item => item.product != null && item.product.is_available !== false);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isSessionRestored } = useAuth();
  const queryClient = useQueryClient();

  // Global mutation counter — prevents stale reads from overwriting optimistic state
  const mutationSeqRef = useRef(0);
  const [pendingMutations, setPendingMutations] = useState(0);

  const { data: items = [], isLoading, isFetched } = useQuery({
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

  const sellerGroups: SellerGroup[] = useMemo(() =>
    Object.values(
      items.reduce<Record<string, SellerGroup>>((groups, item) => {
        const sellerId = item.product?.seller_id || 'unknown';
        if (!groups[sellerId]) {
          groups[sellerId] = { sellerId, sellerName: (item.product as any)?.seller?.business_name || 'Seller', items: [], subtotal: 0 };
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
    setPendingMutations(c => c + 1);

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
      feedbackRemoveItem(removedItem?.product?.name || 'Item');
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
      await reconcile();
    } catch (error) {
      rollback(snap);
      const availabilityError = parseStoreAvailabilityError(error);
      if (availabilityError) toast.error(availabilityError, { id: 'cart-qty-availability' });
      else handleApiError(error, 'Failed to update quantity');
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
    } catch (error) {
      rollback(snap);
      console.error('Error clearing cart:', error);
    } finally {
      setPendingMutations(c => Math.max(0, c - 1));
    }
  }, [user, setOptimistic, cancelCartQueries, snapshot, rollback, queryClient, countKey]);

  const replaceCart = useCallback(async (inserts: { product_id: string; quantity: number }[]) => {
    if (!user || inserts.length === 0) return;
    setPendingMutations(c => c + 1);
    await cancelCartQueries();
    const totalQty = inserts.reduce((s, i) => s + i.quantity, 0);
    queryClient.setQueryData(countKey(), totalQty);

    try {
      await supabase.from('cart_items').delete().eq('user_id', user.id);
      const { error } = await supabase
        .from('cart_items')
        .insert(inserts.map(i => ({ user_id: user.id, product_id: i.product_id, quantity: i.quantity })));
      if (error) throw error;
      await reconcile();
    } catch (error) {
      // Reconcile will fix state
      await reconcile();
      throw error;
    } finally {
      setPendingMutations(c => Math.max(0, c - 1));
    }
  }, [user, queryClient, cancelCartQueries, countKey, reconcile]);

  const hasHydrated = isFetched;

  // Keep cart-count cache in sync with items (eliminates split-brain)
  useMemo(() => {
    if (hasHydrated && user) {
      queryClient.setQueryData(['cart-count', user.id], itemCount);
    }
  }, [hasHydrated, user, itemCount, queryClient]);

  const contextValue = useMemo<CartContextType>(() => ({
    items, itemCount, totalAmount, sellerGroups, isLoading, hasHydrated, pendingMutations, addItem, replaceCart, updateQuantity, removeItem, clearCart,
    refresh: async () => { if (user) await reconcile(); },
  }), [items, itemCount, totalAmount, sellerGroups, isLoading, hasHydrated, pendingMutations, addItem, replaceCart, updateQuantity, removeItem, clearCart, user, reconcile]);

  return <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) throw new Error('useCart must be used within a CartProvider');
  return context;
}
