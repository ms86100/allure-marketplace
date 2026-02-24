import React, { useMemo } from 'react';
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

  const {
    user, session, profile, society, roles, sellerProfiles,
    currentSellerId, isLoading, societyAdminRole, managedBuilderIds,
    viewAsSocietyId, viewAsSociety,
  } = state;

  const isApproved = profile?.verification_status === 'approved';
  const isSeller = roles.includes('seller') && sellerProfiles.some(s => (s as any).verification_status === 'approved');
  const isAdmin = roles.includes('admin');
  const isSocietyAdmin = !!societyAdminRole || isAdmin;
  const isBuilderMember = managedBuilderIds.length > 0;

  const effectiveSocietyId = viewAsSocietyId || profile?.society_id || null;
  const effectiveSociety = viewAsSocietyId ? viewAsSociety : society;

  // ── Memoized sub-context values ───────────────────────
  const identityValue = useMemo<IdentityContextType>(() => ({
    user, session, isLoading, signOut, refreshProfile,
  }), [user, session, isLoading, signOut, refreshProfile]);

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
    currentSellerId, isLoading, isApproved, isSeller, isAdmin,
    isSocietyAdmin, isBuilderMember, societyAdminRole, managedBuilderIds,
    signOut, refreshProfile,
    setCurrentSellerId,
    viewAsSocietyId, setViewAsSociety,
    effectiveSocietyId, effectiveSociety,
  }), [
    user, session, profile, society, roles, sellerProfiles,
    currentSellerId, isLoading, isApproved, isSeller, isAdmin,
    isSocietyAdmin, isBuilderMember, societyAdminRole, managedBuilderIds,
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
