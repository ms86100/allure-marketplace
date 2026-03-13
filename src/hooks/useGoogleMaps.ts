/// <reference types="@types/google.maps" />
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const HARDCODED_FALLBACK_KEY = 'AIzaSyC96Rzpof_eGJc-QycAw1aHltM1inw8vU';
const SCRIPT_ID = 'google-maps-script';

let loadPromise: Promise<void> | null = null;

async function fetchGoogleMapsApiKey(): Promise<string> {
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value, is_active')
      .eq('key', 'google_maps_api_key')
      .maybeSingle();
    if (data?.value && data.is_active !== false) {
      console.info('useGoogleMaps: API key loaded from database (admin_settings)');
      return data.value;
    }
  } catch (e) {
    console.warn('Failed to fetch Google Maps key from DB, using fallback:', e);
  }
  console.warn('useGoogleMaps: Using HARDCODED FALLBACK API key — DB key not found or inactive');
  return HARDCODED_FALLBACK_KEY;
}

export async function loadGoogleMapsScript(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const apiKey = await fetchGoogleMapsApiKey();

    // If script already exists but was loaded with a different key, remove it and reload
    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      const existingSrc = existingScript.getAttribute('src') || '';
      if (existingSrc.includes(apiKey) && (window as any).google?.maps) {
        // Same key, already loaded
        return;
      }
      // Different key or not yet loaded — remove old script and google object
      existingScript.remove();
      delete (window as any).google;
      loadPromise = null;
    } else if ((window as any).google?.maps) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps'));
      document.head.appendChild(script);
    });
  })();

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
