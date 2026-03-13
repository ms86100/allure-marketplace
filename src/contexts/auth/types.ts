import { User, Session } from '@supabase/supabase-js';
import { Profile, UserRole, SellerProfile, Society, SocietyAdmin } from '@/types/database';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  society: Society | null;
  roles: UserRole[];
  sellerProfiles: SellerProfile[];
  currentSellerId: string | null;
  isLoading: boolean;
  isApproved: boolean;
  isSeller: boolean;
  hasSellerProfile: boolean;
  isAdmin: boolean;
  isSocietyAdmin: boolean;
  isBuilderMember: boolean;
  isSecurityOfficer: boolean;
  isWorker: boolean;
  societyAdminRole: SocietyAdmin | null;
  managedBuilderIds: string[];
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setCurrentSellerId: (id: string | null) => void;
  viewAsSocietyId: string | null;
  setViewAsSociety: (id: string | null) => void;
  effectiveSocietyId: string | null;
  effectiveSociety: Society | null;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  society: Society | null;
  roles: UserRole[];
  sellerProfiles: SellerProfile[];
  currentSellerId: string | null;
  isLoading: boolean;
  isSecurityOfficer: boolean;
  isWorker: boolean;
  societyAdminRole: SocietyAdmin | null;
  managedBuilderIds: string[];
  viewAsSocietyId: string | null;
  viewAsSociety: Society | null;
}

export const initialAuthState: AuthState = {
  user: null,
  session: null,
  profile: null,
  society: null,
  roles: [],
  sellerProfiles: [],
  currentSellerId: null,
  isLoading: true,
  isSecurityOfficer: false,
  isWorker: false,
  societyAdminRole: null,
  managedBuilderIds: [],
  viewAsSocietyId: null,
  viewAsSociety: null,
};
