import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDeliveryAddresses } from '@/hooks/useDeliveryAddresses';

export interface BrowsingLocation {
  id: string; // 'gps' | 'society' | delivery_address.id
  label: string;
  lat: number;
  lng: number;
  source: 'gps' | 'address' | 'society';
}

interface BrowsingLocationContextType {
  /** The resolved location used for marketplace discovery */
  browsingLocation: BrowsingLocation | null;
  /** Set a specific browsing location (persisted to localStorage) */
  setBrowsingLocation: (loc: BrowsingLocation | null) => void;
  /** Clear override — falls back to default address → society */
  clearOverride: () => void;
  /** Whether a user override is active */
  hasOverride: boolean;
}

const BrowsingLocationContext = createContext<BrowsingLocationContextType | undefined>(undefined);

const STORAGE_KEY = 'sociva_browsing_location';

function loadFromStorage(): BrowsingLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.lat && parsed.lng && parsed.label) return parsed;
  } catch { /* ignore */ }
  return null;
}

function saveToStorage(loc: BrowsingLocation | null) {
  try {
    if (loc) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

export function BrowsingLocationProvider({ children }: { children: React.ReactNode }) {
  const { society } = useAuth();
  const { defaultAddress } = useDeliveryAddresses();

  // Session override (highest priority)
  const [override, setOverride] = useState<BrowsingLocation | null>(() => loadFromStorage());

  const setBrowsingLocation = useCallback((loc: BrowsingLocation | null) => {
    setOverride(loc);
    saveToStorage(loc);
  }, []);

  const clearOverride = useCallback(() => {
    setOverride(null);
    saveToStorage(null);
  }, []);

  // Fallback chain: override → default delivery address → society coordinates
  const browsingLocation = useMemo<BrowsingLocation | null>(() => {
    // 1. Session/localStorage override
    if (override) return override;

    // 2. Default delivery address
    if (defaultAddress?.latitude && defaultAddress?.longitude) {
      return {
        id: defaultAddress.id,
        label: defaultAddress.building_name || defaultAddress.label || 'Saved address',
        lat: defaultAddress.latitude,
        lng: defaultAddress.longitude,
        source: 'address',
      };
    }

    // 3. Society coordinates
    if (society?.latitude && society?.longitude) {
      return {
        id: 'society',
        label: society.name,
        lat: society.latitude,
        lng: society.longitude,
        source: 'society',
      };
    }

    return null;
  }, [override, defaultAddress, society]);

  const hasOverride = !!override;

  return (
    <BrowsingLocationContext.Provider value={{ browsingLocation, setBrowsingLocation, clearOverride, hasOverride }}>
      {children}
    </BrowsingLocationContext.Provider>
  );
}

export function useBrowsingLocation() {
  const ctx = useContext(BrowsingLocationContext);
  if (!ctx) throw new Error('useBrowsingLocation must be used within BrowsingLocationProvider');
  return ctx;
}
