/// <reference types="@types/google.maps" />
import { useState, useEffect, useCallback } from 'react';

const GOOGLE_MAPS_API_KEY = 'AIzaSyC96Rzpof_eGJc-QycAw1aHXZ6rMx4bRvU';
const SCRIPT_ID = 'google-maps-script';

let loadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  if ((window as any).google?.maps) return Promise.resolve();

  loadPromise = new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement;
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps')));
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function useGoogleMaps() {
  const [isLoaded, setIsLoaded] = useState(!!(window as any).google?.maps);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded) return;
    loadGoogleMapsScript()
      .then(() => setIsLoaded(true))
      .catch((err) => setError(err.message));
  }, [isLoaded]);

  return { isLoaded, error };
}

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  name: string;
  formattedAddress: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
}

export function useAutocomplete() {
  const { isLoaded, error } = useGoogleMaps();
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchPlaces = useCallback(async (input: string) => {
    if (!isLoaded || !input.trim() || input.length < 3) {
      setPredictions([]);
      return;
    }
    setIsSearching(true);
    try {
      // Use the new AutocompleteSuggestion API (replaces deprecated AutocompleteService)
      const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedRegionCodes: ['in'],
      });

      setPredictions(
        suggestions
          .filter((s): s is google.maps.places.AutocompleteSuggestion & { placePrediction: google.maps.places.PlacePrediction } => !!s.placePrediction)
          .map((s) => ({
            placeId: s.placePrediction.placeId,
            description: s.placePrediction.text.toString(),
            mainText: s.placePrediction.mainText?.toString() || s.placePrediction.text.toString(),
            secondaryText: s.placePrediction.secondaryText?.toString() || '',
          }))
      );
    } catch (err) {
      console.error('AutocompleteSuggestion error:', err);
      setPredictions([]);
    } finally {
      setIsSearching(false);
    }
  }, [isLoaded]);

  const getPlaceDetails = useCallback(async (placeId: string): Promise<PlaceDetails | null> => {
    if (!isLoaded) return null;
    try {
      // Use the new Place class (replaces deprecated PlacesService)
      const { Place } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'addressComponents', 'location'] });

      const components = place.addressComponents || [];
      const get = (type: string) => components.find((c) => c.types.includes(type))?.longText || '';

      return {
        name: place.displayName || '',
        formattedAddress: place.formattedAddress || '',
        city: get('locality') || get('administrative_area_level_2'),
        state: get('administrative_area_level_1'),
        pincode: get('postal_code'),
        latitude: place.location?.lat() || 0,
        longitude: place.location?.lng() || 0,
      };
    } catch (err) {
      console.error('Place fetchFields error:', err);
      return null;
    }
  }, [isLoaded]);

  const clearPredictions = useCallback(() => setPredictions([]), []);

  return { predictions, isSearching, searchPlaces, getPlaceDetails, clearPredictions, isLoaded, error };
}
