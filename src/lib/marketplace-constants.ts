/** Shared sort options used across CategoryPage, CategoryGroupPage, and SearchPage */
export const SORT_OPTIONS = [
  { key: 'relevance' as const, label: 'Relevance' },
  { key: 'price_low' as const, label: 'Price: Low' },
  { key: 'price_high' as const, label: 'Price: High' },
  { key: 'popular' as const, label: 'Popular' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['key'];
