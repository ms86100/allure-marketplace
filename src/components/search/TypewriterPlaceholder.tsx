import { memo } from 'react';
import { useTypewriterPlaceholder } from '@/hooks/useTypewriterPlaceholder';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { jitteredStaleTime } from '@/lib/query-utils';
import { SearchContext } from '@/hooks/useSearchPlaceholder';

const CONTEXT_WORDS: Record<string, string[]> = {
  society: ['visitors', 'parking', 'finances', 'snags', 'disputes', 'workers', 'notices'],
  visitors: ['guest name', 'flat number', 'OTP code'],
  finances: ['expense', 'income', 'budget', 'receipt'],
  construction: ['milestone', 'tower', 'progress', 'document'],
  disputes: ['complaint', 'ticket', 'resolution'],
  workforce: ['maid', 'driver', 'plumber', 'electrician'],
  parking: ['vehicle number', 'slot', 'sticker'],
  bulletin: ['announcement', 'discussion', 'event', 'poll'],
  deliveries: ['order', 'rider', 'tracking'],
  maintenance: ['dues', 'payment', 'receipt'],
};

/**
 * Fix #10: Isolated typewriter component — only THIS component re-renders
 * on each tick (every 40-80ms), not the parent Header or page tree.
 */
function TypewriterPlaceholderInner({ context = 'home' }: { context?: SearchContext }) {
  // Fix #4: Lightweight category-only query instead of useProductsByCategory(200)
  const { data: categoryNames = [] } = useQuery({
    queryKey: ['category-display-names'],
    queryFn: async () => {
      const { data } = await supabase
        .from('category_config')
        .select('display_name')
        .eq('is_active', true)
        .order('display_order');
      return (data || []).map((c: any) => c.display_name);
    },
    staleTime: jitteredStaleTime(15 * 60 * 1000),
  });

  const words = ['home', 'marketplace', 'search'].includes(context)
    ? (categoryNames.length > 0 ? categoryNames : ['products'])
    : (CONTEXT_WORDS[context] || ['items']);

  const placeholder = useTypewriterPlaceholder(words, { prefix: 'Search "', suffix: '"' });

  return <span className="text-sm text-muted-foreground flex-1 transition-opacity duration-300 truncate">{placeholder}</span>;
}

export const TypewriterPlaceholder = memo(TypewriterPlaceholderInner);
