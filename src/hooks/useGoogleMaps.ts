/// <reference types="@types/google.maps" />
import { useState, useEffect, useCallback } from 'react';

const GOOGLE_MAPS_API_KEY = 'AIzaSyD0jI5Bm3ETEDxO42nDSMaKHltM1inw8vU';
const SCRIPT_ID = 'google-maps-script';

let loadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  if ((window as any).google?.maps?.places) return Promise.resolve();

  loadPromise = new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) {
      // Script tag exists but not loaded yet — wait for it
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
  const [isLoaded, setIsLoaded] = useState(!!(window as any).google?.maps?.places);
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

  const searchPlaces = useCallback((input: string) => {
    if (!isLoaded || !input.trim() || input.length < 3) {
      setPredictions([]);
      return;
    }
    setIsSearching(true);
    const service = new google.maps.places.AutocompleteService();
    service.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: 'in' },
        types: ['establishment', 'geocode'],
      },
      (results, status) => {
        setIsSearching(false);
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(
            results.map((r) => ({
              placeId: r.place_id,
              description: r.description,
              mainText: r.structured_formatting.main_text,
              secondaryText: r.structured_formatting.secondary_text,
            }))
          );
        } else {
          setPredictions([]);
        }
      }
    );
  }, [isLoaded]);

  const getPlaceDetails = useCallback((placeId: string): Promise<PlaceDetails | null> => {
    if (!isLoaded) return Promise.resolve(null);
    return new Promise((resolve) => {
      const div = document.createElement('div');
      const service = new google.maps.places.PlacesService(div);
      service.getDetails(
        { placeId, fields: ['name', 'formatted_address', 'address_components', 'geometry'] },
        (place, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            resolve(null);
            return;
          }
          const components = place.address_components || [];
          const get = (type: string) => components.find((c) => c.types.includes(type))?.long_name || '';

          resolve({
            name: place.name || '',
            formattedAddress: place.formatted_address || '',
            city: get('locality') || get('administrative_area_level_2'),
            state: get('administrative_area_level_1'),
            pincode: get('postal_code'),
            latitude: place.geometry?.location?.lat() || 0,
            longitude: place.geometry?.location?.lng() || 0,
          });
        }
      );
    });
  }, [isLoaded]);

  const clearPredictions = useCallback(() => setPredictions([]), []);

  return { predictions, isSearching, searchPlaces, getPlaceDetails, clearPredictions, isLoaded, error };
}
