import { useState, useEffect, useMemo } from 'react';
import { useProductsByCategory } from '@/hooks/queries/useProductsByCategory';

/**
 * Returns a rotating search placeholder based on categories
 * that have actual active product listings visible to the user.
 */
export function useSearchPlaceholder(intervalMs = 3000) {
  const { data: categories = [] } = useProductsByCategory(200);
  const [index, setIndex] = useState(0);

  const categoryNames = useMemo(() => {
    // Only categories with at least one product
    return categories
      .filter(c => c.products.length > 0)
      .map(c => c.displayName);
  }, [categories]);

  useEffect(() => {
    if (categoryNames.length <= 1) return;
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % categoryNames.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [categoryNames.length, intervalMs]);

  if (categoryNames.length === 0) return 'Search products...';
  return `Search "${categoryNames[index % categoryNames.length]}"`;
}
