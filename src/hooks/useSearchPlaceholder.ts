import { useMemo } from 'react';
import { useProductsByCategory } from '@/hooks/queries/useProductsByCategory';
import { useTypewriterPlaceholder } from '@/hooks/useTypewriterPlaceholder';

/**
 * Context-aware search placeholder with typewriter animation.
 * Accepts an optional `context` to adapt the words and prefix
 * based on which page/module the user is viewing.
 */
export type SearchContext =
  | 'home'
  | 'marketplace'
  | 'society'
  | 'visitors'
  | 'finances'
  | 'construction'
  | 'disputes'
  | 'workforce'
  | 'parking'
  | 'bulletin'
  | 'deliveries'
  | 'maintenance'
  | 'search';

const CONTEXT_WORDS: Record<SearchContext, string[]> = {
  home: [], // filled dynamically from categories
  marketplace: [], // filled dynamically from categories
  search: [], // filled dynamically from categories
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

const CONTEXT_PREFIX: Partial<Record<SearchContext, string>> = {
  society: 'Search "',
  visitors: 'Search "',
  finances: 'Search "',
  construction: 'Search "',
  disputes: 'Search "',
  workforce: 'Search "',
  parking: 'Search "',
  bulletin: 'Search "',
  deliveries: 'Search "',
  maintenance: 'Search "',
};

export function useSearchPlaceholder(context: SearchContext = 'home') {
  const { data: categories = [] } = useProductsByCategory(200);

  const categoryNames = useMemo(() => {
    return categories
      .filter(c => c.products.length > 0)
      .map(c => c.displayName);
  }, [categories]);

  const words = useMemo(() => {
    if (['home', 'marketplace', 'search'].includes(context)) {
      return categoryNames.length > 0 ? categoryNames : ['products'];
    }
    return CONTEXT_WORDS[context] || ['items'];
  }, [context, categoryNames]);

  const prefix = CONTEXT_PREFIX[context] || 'Search "';

  return useTypewriterPlaceholder(words, { prefix, suffix: '"' });
}
