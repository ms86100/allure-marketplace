// @ts-nocheck
/// <reference types="@types/google.maps" />
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SCRIPT_ID = 'google-maps-script';

// Global auth failure flag — set by Google's gm_authFailure callback
let gmAuthFailed = false;
const authFailureListeners = new Set<() => void>();

// Google calls window.gm_authFailure when the API key is invalid/over quota
if (typeof window !== 'undefined') {
  (window as any).gm_authFailure = () => {
    console.error('useGoogleMaps: Google Maps authentication failure (invalid/restricted API key)');
    gmAuthFailed = true;
    authFailureListeners.forEach(fn => fn());
  };
}

async function fetchGoogleMapsApiKey(): Promise<string | null> {
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
    console.warn('Failed to fetch Google Maps key from DB:', e);
  }
  console.warn('useGoogleMaps: No valid API key found in DB');
  return null;
}

export async function loadGoogleMapsScript(): Promise<void> {
  const apiKey = await fetchGoogleMapsApiKey();

  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  // Check if script already exists with the SAME key
  const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    const existingSrc = existingScript.getAttribute('src') || '';
    if (existingSrc.includes(apiKey) && (window as any).google?.maps) {
      if (gmAuthFailed) throw new Error('AUTH_FAILED');
      return; // Already loaded with correct key
    }
    // Wrong key or not loaded — nuke it
    existingScript.remove();
    delete (window as any).google;
  } else if ((window as any).google?.maps) {
    if (gmAuthFailed) throw new Error('AUTH_FAILED');
    return; // Loaded externally, assume OK
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // After script loads, wait briefly for gm_authFailure callback
      setTimeout(() => {
        if (gmAuthFailed) {
          reject(new Error('AUTH_FAILED'));
        } else {
          resolve();
        }
      }, 500);
    };
    script.onerror = () => reject(new Error('SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  });
}

export function useGoogleMaps() {
  const [isLoaded, setIsLoaded] = useState(!!(window as any).google?.maps && !gmAuthFailed);
  const [error, setError] = useState<string | null>(gmAuthFailed ? 'AUTH_FAILED' : null);

  useEffect(() => {
    if (isLoaded) return;
    if (gmAuthFailed) {
      setError('AUTH_FAILED');
      return;
    }

    loadGoogleMapsScript()
      .then(() => setIsLoaded(true))
      .catch((err) => setError(err.message));

    // Listen for auth failures that happen after initial load
    const listener = () => {
      setError('AUTH_FAILED');
      setIsLoaded(false);
    };
    authFailureListeners.add(listener);
    return () => { authFailureListeners.delete(listener); };
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
