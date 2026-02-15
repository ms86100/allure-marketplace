import React, { createContext, useContext } from 'react';
import { AuthContextType } from './types';
import { useAuthState } from './useAuthState';

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

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, society, roles, sellerProfiles,
        currentSellerId, isLoading, isApproved, isSeller, isAdmin,
        isSocietyAdmin, isBuilderMember, societyAdminRole, managedBuilderIds,
        signOut, refreshProfile,
        setCurrentSellerId: (id) => setPartial({ currentSellerId: id }),
        viewAsSocietyId, setViewAsSociety,
        effectiveSocietyId, effectiveSociety,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
