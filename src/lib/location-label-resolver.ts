/// <reference types="@types/google.maps" />

const PLUS_CODE_REGEX = /^[23456789CFGHJMPQRVWX]+\+/;

/** Labels considered too generic to be useful */
const GENERIC_LABELS = [
  'unnamed road', 'unnamed', 'unknown', 'unknown road',
  'service road', 'main road', 'road',
];

/** Quality tiers – higher is better */
export enum LabelQuality {
  Coords = 0,
  Route = 1,
  Sublocality = 2,
  Neighborhood = 3,
  Premise = 4,
  POI = 5, // point_of_interest / establishment / places result
}

export interface ResolvedLabel {
  name: string;
  quality: LabelQuality;
  formattedAddress?: string;
}

function isGeneric(label: string): boolean {
  return GENERIC_LABELS.includes(label.toLowerCase().trim());
}

function isPlusCode(text: string): boolean {
  return PLUS_CODE_REGEX.test(text);
}

/**
 * Score a single geocoder result and return the best candidate from it.
 */
function scoreGeocoderResult(result: google.maps.GeocoderResult): ResolvedLabel | null {
  if (isPlusCode(result.formatted_address)) return null;
  if (result.types.includes('plus_code' as any)) return null;

  const components = result.address_components || [];
  const get = (type: string) => components.find(c => c.types.includes(type))?.long_name;

  // POI-level
  const poi = get('point_of_interest') || get('establishment');
  if (poi && !isGeneric(poi)) return { name: poi, quality: LabelQuality.POI, formattedAddress: result.formatted_address };

  const premise = get('premise');
  if (premise && !isGeneric(premise)) return { name: premise, quality: LabelQuality.Premise, formattedAddress: result.formatted_address };

  const neighborhood = get('neighborhood');
  if (neighborhood && !isGeneric(neighborhood)) return { name: neighborhood, quality: LabelQuality.Neighborhood, formattedAddress: result.formatted_address };

  const sublocality = get('sublocality_level_1') || get('sublocality');
  if (sublocality && !isGeneric(sublocality)) return { name: sublocality, quality: LabelQuality.Sublocality, formattedAddress: result.formatted_address };

  const route = get('route');
  if (route && !isGeneric(route)) return { name: route, quality: LabelQuality.Route, formattedAddress: result.formatted_address };

  // Fallback to first segment of formatted address
  const firstSeg = result.formatted_address.split(',')[0]?.trim();
  if (firstSeg && !isPlusCode(firstSeg) && !isGeneric(firstSeg)) {
    return { name: firstSeg, quality: LabelQuality.Route, formattedAddress: result.formatted_address };
  }

  return null;
}

/**
 * Extract the best label from an array of geocoder results.
 */
export function extractBestLabel(results: google.maps.GeocoderResult[]): ResolvedLabel | null {
  let best: ResolvedLabel | null = null;
  for (const result of results) {
    const candidate = scoreGeocoderResult(result);
    if (candidate && (!best || candidate.quality > best.quality)) {
      best = candidate;
    }
    // Short-circuit if we already found a POI
    if (best?.quality === LabelQuality.POI) break;
  }
  return best;
}

/**
 * Use the modern Places API to find a nearby POI name.
 */
export async function findNearbyPlaceName(
  map: google.maps.Map,
  lat: number,
  lng: number
): Promise<ResolvedLabel | null> {
  try {
    const service = new google.maps.places.PlacesService(map);
    return new Promise((resolve) => {
      service.nearbySearch(
        { location: { lat, lng }, radius: 50, rankBy: google.maps.places.RankBy.PROMINENCE },
        (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results?.[0]) {
            const name = results[0].name || results[0].vicinity;
            if (name && !isGeneric(name) && !isPlusCode(name)) {
              resolve({ name, quality: LabelQuality.POI });
              return;
            }
          }
          resolve(null);
        }
      );
    });
  } catch {
    return null;
  }
}

/**
 * Pick the better of two resolved labels. Returns the higher quality one.
 * If existingLabel is provided and is higher quality, it wins.
 */
export function pickBetterLabel(
  a: ResolvedLabel | null,
  b: ResolvedLabel | null
): ResolvedLabel | null {
  if (!a) return b;
  if (!b) return a;
  return b.quality >= a.quality ? b : a;
}

/**
 * Check if a label quality is too generic to display alone
 * (i.e. we should try a Places fallback).
 */
export function isLowQualityLabel(label: ResolvedLabel | null): boolean {
  if (!label) return true;
  return label.quality <= LabelQuality.Route || isGeneric(label.name);
}

/**
 * Format coordinates as a display string (last resort).
 */
export function formatCoords(lat: number, lng: number): ResolvedLabel {
  return { name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, quality: LabelQuality.Coords };
}
