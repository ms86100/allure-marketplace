/**
 * Slightly saturated pastel backgrounds for category cards.
 * Always light — designed to work on any theme as card backgrounds.
 * "Darker" pastels = more saturation than pure white tints.
 */
export const CATEGORY_PASTELS: Record<string, string> = {
  home_food: '#C8E6C9',
  bakery: '#FFE0B2',
  snacks: '#FFF0B3',
  groceries: '#BBDEFB',
  beverages: '#B2DFDB',
  dairy: '#FFF0B3',
  fruits: '#C8E6C9',
  vegetables: '#C8E6C9',
  sweets: '#FFE0B2',
  meat: '#FFCDD2',
  seafood: '#B2EBF2',
  pet_supplies: '#E1BEE7',
  stationery: '#C5CAE9',
  electronics: '#BBDEFB',
  clothing: '#F8BBD0',
  beauty: '#F8BBD0',
  health: '#B2DFDB',
  home_services: '#C8E6C9',
  cleaning: '#B2EBF2',
  repairs: '#FFF0B3',
  puja: '#FFE0B2',
  gifting: '#F8BBD0',
  pharmacy: '#B2DFDB',
  laundry: '#B2EBF2',
  fitness: '#C8E6C9',
  tutoring: '#C5CAE9',
  salon: '#F8BBD0',
  catering: '#FFE0B2',
};

export const DEFAULT_PASTEL = '#E0E0E0';

export function getCategoryPastel(category: string, fallbackColor?: string | null): string {
  if (CATEGORY_PASTELS[category]) return CATEGORY_PASTELS[category];
  // If we have a hex color from DB, lighten it
  if (fallbackColor && fallbackColor.startsWith('#')) {
    return `${fallbackColor}40`;
  }
  return DEFAULT_PASTEL;
}
