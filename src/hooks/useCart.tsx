import { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CartItem, Product } from '@/types/database';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/query-utils';
import { computeStoreStatus, formatStoreClosedMessage, type StoreStatus } from '@/lib/store-availability';

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
    hasOwn(p, 'seller_availability_start') ||
    hasOwn(p, 'seller_availability_end') ||
    hasOwn(p, 'seller_operating_days') ||
    hasOwn(p, 'seller_is_available');

  const hasSellerAvailabilityFields = !!seller && (
    hasOwn(seller, 'availability_start') ||
    hasOwn(seller, 'availability_end') ||
    hasOwn(seller, 'operating_days') ||
    hasOwn(seller, 'is_available')
  );

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
  addItem: (product: Product, quantity?: number, silent?: boolean) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_QUERY_KEY = ['cart-items'] as const;

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: [...CART_QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('cart_items')
        .select(`*, product:products(*, seller:seller_profiles(*))`)
        .eq('user_id', user.id);
      if (error) throw error;
      const items = (data as any as (CartItem & { product: Product })[]) || [];
      return items.filter(item => item.product != null && item.product.is_available !== false);
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const setOptimistic = useCallback((updater: (prev: (CartItem & { product: Product })[]) => (CartItem & { product: Product })[]) => {
    queryClient.setQueryData([...CART_QUERY_KEY, user?.id], (old: any) => updater(old || []));
  }, [queryClient, user?.id]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY, exact: false });
    queryClient.invalidateQueries({ queryKey: ['cart-count'], exact: false });
  }, [queryClient]);

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

  const addItem = useCallback(async (product: Product, quantity = 1, silent = false) => {
    if (!user) { toast.error('Please sign in to add items to cart'); return; }

    const pActionType = (product as any).action_type;
    if (pActionType && !['add_to_cart', 'buy_now'].includes(pActionType)) { toast.error('This item cannot be added to cart'); return; }

    const inlineAvailability = getInlineSellerAvailability(product);
    let availability = computeStoreStatus(inlineAvailability.availabilityStart, inlineAvailability.availabilityEnd, inlineAvailability.operatingDays, inlineAvailability.isAvailable);

    if (!inlineAvailability.hasInlineAvailability) {
      if (!product.seller_id) { toast.error('Unable to verify store availability right now. Please try again.'); return; }
      const { data: sellerSnapshot, error: sellerError } = await supabase.from('seller_profiles').select('availability_start, availability_end, operating_days, is_available').eq('id', product.seller_id).maybeSingle();
      if (sellerError || !sellerSnapshot) { toast.error('Unable to verify store availability right now. Please try again.'); return; }
      availability = computeStoreStatus(sellerSnapshot.availability_start, sellerSnapshot.availability_end, sellerSnapshot.operating_days, sellerSnapshot.is_available ?? true);
    }

    if (availability.status !== 'open') { const msg = formatStoreClosedMessage(availability); toast.error(msg || 'This store is currently closed. Please try again later.'); return; }

    setOptimistic(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) return prev.map(item => item.product_id === product.id ? { ...item, quantity: Math.min(item.quantity + quantity, 99) } : item);
      return [...prev, { id: `temp-${crypto.randomUUID()}`, user_id: user.id, product_id: product.id, quantity, created_at: new Date().toISOString(), product, society_id: null } as CartItem & { product: Product }];
    });

    const prevCount = queryClient.getQueryData(['cart-count', user?.id]);
    try {
      const { data: existing } = await supabase.from('cart_items').select('quantity').eq('user_id', user.id).eq('product_id', product.id).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('cart_items').update({ quantity: Math.min(existing.quantity + quantity, 99) }).eq('user_id', user.id).eq('product_id', product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cart_items').insert({ user_id: user.id, product_id: product.id, quantity });
        if (error) throw error;
      }
      if (!silent) toast.success('Added to cart');
      queryClient.setQueryData(['cart-count', user?.id], (old: number | undefined) => (old || 0) + quantity);
      invalidate();
    } catch (error) {
      queryClient.setQueryData(['cart-count', user?.id], prevCount);
      invalidate();
      const availabilityError = parseStoreAvailabilityError(error);
      if (availabilityError) toast.error(availabilityError);
      else handleApiError(error, 'Failed to add item');
    }
  }, [user, setOptimistic, invalidate, queryClient]);

  const removeItem = useCallback(async (productId: string) => {
    if (!user) return;
    const prev = queryClient.getQueryData([...CART_QUERY_KEY, user?.id]) as any[] || [];
    const removedItem = prev.find((item: any) => item.product_id === productId);
    const removedQty = removedItem?.quantity || 0;
    setOptimistic(old => old.filter(item => item.product_id !== productId));
    queryClient.setQueryData(['cart-count', user?.id], (old: number | undefined) => Math.max(0, (old || 0) - removedQty));
    try {
      const { error } = await supabase.from('cart_items').delete().eq('user_id', user.id).eq('product_id', productId);
      if (error) throw error;
      // Toast removed — callers provide their own contextual feedback
      invalidate();
    } catch (error) {
      queryClient.setQueryData([...CART_QUERY_KEY, user?.id], prev);
      queryClient.setQueryData(['cart-count', user?.id], (old: number | undefined) => (old || 0) + removedQty);
      handleApiError(error, 'Failed to remove item');
    }
  }, [user, setOptimistic, queryClient, invalidate]);

  const updateQuantity = useCallback(async (productId: string, quantity: number) => {
    if (!user) return;
    if (quantity <= 0) { await removeItem(productId); return; }
    const cappedQuantity = Math.min(quantity, 99);
    const prev = queryClient.getQueryData([...CART_QUERY_KEY, user?.id]) as any[] || [];
    const oldItem = prev.find((item: any) => item.product_id === productId);
    const qtyDelta = cappedQuantity - (oldItem?.quantity || 0);
    setOptimistic(old => old.map(item => item.product_id === productId ? { ...item, quantity: cappedQuantity } : item));
    if (qtyDelta !== 0) queryClient.setQueryData(['cart-count', user?.id], (old: number | undefined) => Math.max(0, (old || 0) + qtyDelta));
    try {
      const { error } = await supabase.from('cart_items').update({ quantity: cappedQuantity }).eq('user_id', user.id).eq('product_id', productId);
      if (error) throw error;
    } catch (error) {
      queryClient.setQueryData([...CART_QUERY_KEY, user?.id], prev);
      if (qtyDelta !== 0) queryClient.setQueryData(['cart-count', user?.id], (old: number | undefined) => Math.max(0, (old || 0) - qtyDelta));
      const availabilityError = parseStoreAvailabilityError(error);
      if (availabilityError) toast.error(availabilityError);
      else handleApiError(error, 'Failed to update quantity');
    }
  }, [user, setOptimistic, removeItem, queryClient]);

  const clearCart = useCallback(async () => {
    if (!user) return;
    const prev = queryClient.getQueryData([...CART_QUERY_KEY, user?.id]) as any[] || [];
    setOptimistic(() => []);
    try {
      const { error } = await supabase.from('cart_items').delete().eq('user_id', user.id);
      if (error) throw error;
      queryClient.setQueryData(['cart-count', user?.id], 0);
    } catch (error) {
      queryClient.setQueryData([...CART_QUERY_KEY, user?.id], prev);
      console.error('Error clearing cart:', error);
    }
  }, [user, setOptimistic, queryClient]);

  const contextValue = useMemo<CartContextType>(() => ({
    items, itemCount, totalAmount, sellerGroups, isLoading, addItem, updateQuantity, removeItem, clearCart,
    refresh: async () => { invalidate(); },
  }), [items, itemCount, totalAmount, sellerGroups, isLoading, addItem, updateQuantity, removeItem, clearCart, invalidate]);

  return <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) throw new Error('useCart must be used within a CartProvider');
  return context;
}
