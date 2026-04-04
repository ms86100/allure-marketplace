import React, { useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { AuthContextType } from './types';
import { useAuthState } from './useAuthState';
import {
  IdentityContext, IdentityContextType,
  RoleContext, RoleContextType,
  SocietyContext, SocietyContextType,
  SellerContext, SellerContextType,
} from './contexts';
import { createContext, useContext } from 'react';

// Legacy combined context — kept for backward compatibility
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { state, setPartial, refreshProfile, setViewAsSociety, signOut } = useAuthState();
  const queryClient = useQueryClient();

  const {
    user, session, profile, society, roles, sellerProfiles,
    currentSellerId, isLoading, societyAdminRole, managedBuilderIds,
    viewAsSocietyId, viewAsSociety, isSecurityOfficer, isWorker,
    isSessionRestored, profileLoadFailed,
  } = state;

  const isApproved = profile?.verification_status === 'approved';
  const isSeller = roles.includes('seller') && sellerProfiles.some(s => (s as any).verification_status === 'approved');
  const hasSellerProfile = roles.includes('seller') && sellerProfiles.length > 0;
  const isAdmin = roles.includes('admin');
  const isSocietyAdmin = !!societyAdminRole || isAdmin;
  const isBuilderMember = managedBuilderIds.length > 0;

  const effectiveSocietyId = viewAsSocietyId || profile?.society_id || null;
  const effectiveSociety = viewAsSocietyId ? viewAsSociety : society;

  // Perf: Prefetch critical data once auth context is established
  // Includes marketplace data using society coords to break the BrowsingLocation waterfall
  const societyLat = society?.latitude;
  const societyLng = society?.longitude;
  const searchRadius = profile?.search_radius_km ?? 50;

  useEffect(() => {
    if (!effectiveSocietyId || !profile) return;
    const LONG_STALE = 30 * 60 * 1000; // 30 min for near-static config
    // Fire all prefetches in parallel — these populate cache for downstream consumers
    queryClient.prefetchQuery({
      queryKey: ['category-configs'],
      queryFn: fetchCategoryConfigs,
      staleTime: LONG_STALE,
    });
    queryClient.prefetchQuery({
      queryKey: ['badge-config'],
      queryFn: async () => {
        const { data } = await supabase.from('badge_config').select('*').eq('is_active', true).order('priority', { ascending: true });
        return data || [];
      },
      staleTime: LONG_STALE,
    });
    queryClient.prefetchQuery({
      queryKey: ['parent-groups'],
      queryFn: async () => {
        const { data } = await supabase.from('parent_groups').select('*').order('sort_order');
        return data || [];
      },
      staleTime: LONG_STALE,
    });
    queryClient.prefetchQuery({
      queryKey: ['effective-features', effectiveSocietyId],
      queryFn: async () => {
        const { data } = await supabase.rpc('get_effective_society_features', {
          _society_id: effectiveSocietyId,
        });
        return data || [];
      },
      staleTime: 15 * 60 * 1000,
    });

    // Perf: Prefetch sellers (lightweight) using society coords immediately
    // This runs in parallel with BrowsingLocationContext resolution
    // The query key matches what useMarketplaceSellers uses, so it populates the same cache
    if (societyLat && societyLng) {
      queryClient.prefetchInfiniteQuery({
        queryKey: ['marketplace-sellers', societyLat, societyLng, searchRadius],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('search_sellers_paginated' as any, {
            _lat: societyLat,
            _lng: societyLng,
            _radius_km: searchRadius,
            _limit: 50,
            _offset: 0,
          });
          if (error) {
            console.error('Marketplace sellers prefetch error:', error);
            return [];
          }
          return data || [];
        },
        initialPageParam: 0,
        staleTime: 10 * 60 * 1000,
      });
    }
  }, [effectiveSocietyId, !!profile, societyLat, societyLng, searchRadius]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Memoized sub-context values ───────────────────────
  // Perf: use primitive deps to prevent re-renders from object reference changes
  const identityValue = useMemo<IdentityContextType>(() => {
    return { user, session, isLoading, isSessionRestored, signOut, refreshProfile };
  }, [user?.id, !!session, isLoading, isSessionRestored, signOut, refreshProfile]);

  const roleValue = useMemo<RoleContextType>(() => ({
    profile, roles, isApproved, isAdmin, isSocietyAdmin,
    isBuilderMember, societyAdminRole, managedBuilderIds,
  }), [profile, roles, isApproved, isAdmin, isSocietyAdmin, isBuilderMember, societyAdminRole, managedBuilderIds]);

  const societyValue = useMemo<SocietyContextType>(() => ({
    society, viewAsSocietyId, setViewAsSociety,
    effectiveSocietyId, effectiveSociety,
  }), [society, viewAsSocietyId, setViewAsSociety, effectiveSocietyId, effectiveSociety]);

  const sellerValue = useMemo<SellerContextType>(() => ({
    sellerProfiles, currentSellerId, isSeller,
    setCurrentSellerId: (id: string | null) => setPartial({ currentSellerId: id }),
  }), [sellerProfiles, currentSellerId, isSeller, setPartial]);

  // Fix #9: Memoize legacy value to prevent entire app tree re-renders
  const setCurrentSellerId = useMemo(() => (id: string | null) => setPartial({ currentSellerId: id }), [setPartial]);

  const legacyValue = useMemo<AuthContextType>(() => ({
    user, session, profile, society, roles, sellerProfiles,
    currentSellerId, isLoading, isSessionRestored, isApproved, isSeller, hasSellerProfile, isAdmin,
    isSocietyAdmin, isBuilderMember, isSecurityOfficer, isWorker,
    societyAdminRole, managedBuilderIds,
    signOut, refreshProfile,
    setCurrentSellerId,
    viewAsSocietyId, setViewAsSociety,
    effectiveSocietyId, effectiveSociety,
  }), [
    user, session, profile, society, roles, sellerProfiles,
    currentSellerId, isLoading, isSessionRestored, isApproved, isSeller, hasSellerProfile, isAdmin,
    isSocietyAdmin, isBuilderMember, isSecurityOfficer, isWorker,
    societyAdminRole, managedBuilderIds,
    signOut, refreshProfile, setCurrentSellerId,
    viewAsSocietyId, setViewAsSociety, effectiveSocietyId, effectiveSociety,
  ]);

  return (
    <IdentityContext.Provider value={identityValue}>
      <RoleContext.Provider value={roleValue}>
        <SocietyContext.Provider value={societyValue}>
          <SellerContext.Provider value={sellerValue}>
            <AuthContext.Provider value={legacyValue}>
              {children}
            </AuthContext.Provider>
          </SellerContext.Provider>
        </SocietyContext.Provider>
      </RoleContext.Provider>
    </IdentityContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
