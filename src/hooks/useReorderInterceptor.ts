import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Intercepts `?reorder=<suggestion_id>` query param (set by push notification deep-link)
 * and auto-triggers the quick-reorder flow without touching frozen push files.
 */
export function useReorderInterceptor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const processing = useRef(false);

  useEffect(() => {
    const suggestionId = searchParams.get('reorder');
    if (!suggestionId || processing.current) return;

    processing.current = true;

    (async () => {
      try {
        // Fetch the suggestion to get product_id
        const { data: suggestion } = await supabase
          .from('order_suggestions')
          .select('id, product_id, seller_id')
          .eq('id', suggestionId)
          .maybeSingle();

        if (!suggestion) {
          // Clear param and bail
          searchParams.delete('reorder');
          setSearchParams(searchParams, { replace: true });
          processing.current = false;
          return;
        }

        // Find most recent order with this product
        const { data: recentOrders } = await supabase
          .from('order_items')
          .select('order_id')
          .eq('product_id', suggestion.product_id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (recentOrders && recentOrders.length > 0) {
          const { data, error } = await supabase.functions.invoke('quick-reorder', {
            body: { order_id: recentOrders[0].order_id },
          });

          if (!error && !data?.error && data?.orders?.[0]) {
            // Mark suggestion as acted on
            await supabase
              .from('order_suggestions')
              .update({ acted_on: true })
              .eq('id', suggestionId);

            toast({ title: '✅ Order placed!', description: 'Your reorder has been created successfully.' });
            navigate(`/orders/${data.orders[0]}`, { replace: true });
            processing.current = false;
            return;
          }
        }

        // Fallback: navigate to product page
        navigate(`/product/${suggestion.product_id}`, { replace: true });
      } catch {
        // Silent fail — clear param
      } finally {
        searchParams.delete('reorder');
        setSearchParams(searchParams, { replace: true });
        processing.current = false;
      }
    })();
  }, [searchParams, setSearchParams, navigate, toast]);
}
