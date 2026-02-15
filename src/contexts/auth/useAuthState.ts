import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Profile, UserRole, SellerProfile, Society, SocietyAdmin } from '@/types/database';
import { AuthState, initialAuthState } from './types';

export function useAuthState() {
  const [state, setState] = useState<AuthState>(initialAuthState);

  const setPartial = useCallback((partial: Partial<AuthState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_user_auth_context', {
        _user_id: userId,
      });

      if (error || !data) {
        console.error('Error fetching auth context:', error);
        return;
      }

      const ctx = data as any;
      const sellers = (ctx.seller_profiles as SellerProfile[]) || [];

      setState(prev => {
        const newSellerId =
          sellers.length > 0 && !prev.currentSellerId
            ? sellers[0].id
            : sellers.length === 0
            ? null
            : prev.currentSellerId;

        return {
          ...prev,
          profile: ctx.profile as Profile | null,
          society: ctx.society as Society | null,
          societyAdminRole: ctx.society_admin_role as SocietyAdmin | null,
          roles: (ctx.roles as UserRole[]) || [],
          sellerProfiles: sellers,
          currentSellerId: newSellerId,
          managedBuilderIds: (ctx.builder_ids as string[]) || [],
        };
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (state.user) {
      await fetchProfile(state.user.id);
    }
  }, [state.user, fetchProfile]);

  const setViewAsSociety = useCallback(async (id: string | null) => {
    if (!id) {
      setPartial({ viewAsSocietyId: null, viewAsSociety: null });
      return;
    }
    setPartial({ viewAsSocietyId: id });
    const { data } = await supabase
      .from('societies')
      .select('*')
      .eq('id', id)
      .single();
    setPartial({ viewAsSociety: data as Society | null });
  }, [setPartial]);

  const clearAuthState = useCallback(() => {
    setState({ ...initialAuthState, isLoading: false });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearAuthState();
  }, [clearAuthState]);

  // Auth state listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setPartial({ session, user: session?.user ?? null, isLoading: false });

        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          clearAuthState();
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setPartial({ session, user: session?.user ?? null, isLoading: false });
      if (session?.user) {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state,
    setPartial,
    refreshProfile,
    setViewAsSociety,
    signOut,
  };
}
