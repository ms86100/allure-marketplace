import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useParentGroups } from '@/hooks/useParentGroups';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { ServiceCategory } from '@/types/categories';
import { DAYS_OF_WEEK } from '@/types/database';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/utils';
import { notifyAdminsNewStoreApplication } from '@/lib/admin-notifications';

export interface SellerFormData {
  business_name: string;
  description: string;
  categories: string[];
  availability_start: string;
  availability_end: string;
  accepts_cod: boolean;
  sell_beyond_community: boolean;
  delivery_radius_km: number;
  fulfillment_mode: string;
  delivery_note: string;
  accepts_upi: boolean;
  upi_id: string;
  operating_days: string[];
  profile_image_url: string | null;
  cover_image_url: string | null;
  latitude: number | null;
  longitude: number | null;
}

const INITIAL_FORM: SellerFormData = {
  business_name: '',
  description: '',
  categories: [],
  availability_start: '09:00',
  availability_end: '21:00',
  accepts_cod: true,
  sell_beyond_community: false,
  delivery_radius_km: 5,
  fulfillment_mode: 'self_pickup',
  delivery_note: '',
  accepts_upi: false,
  upi_id: '',
  operating_days: [...DAYS_OF_WEEK],
  profile_image_url: null,
  cover_image_url: null,
  latitude: null,
  longitude: null,
};

export function useSellerApplication() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { parentGroupInfos, groups, isLoading: groupsLoading } = useParentGroups();
  const { groupedConfigs } = useCategoryConfigs();

  const [isLoading, setIsLoading] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);
  const [existingSeller, setExistingSeller] = useState<{ id: string; business_name: string; verification_status?: string; rejection_note?: string | null } | null>(null);
  const [rejectionFeedback, setRejectionFeedback] = useState<string | null>(null);
  const [draftSellerId, setDraftSellerId] = useState<string | null>(null);
  const [step, _setStep] = useState(1);

  // Wrap setStep to persist to localStorage
  const setStep = useCallback((s: number | ((prev: number) => number)) => {
    _setStep(prev => {
      const next = typeof s === 'function' ? s(prev) : s;
      if (next >= 3) {
        localStorage.setItem('seller_onboarding_step', String(next));
      }
      return next;
    });
  }, []);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [formData, setFormData] = useState<SellerFormData>(INITIAL_FORM);
  const [draftProducts, setDraftProducts] = useState<any[]>([]);
  const [acceptedDeclaration, setAcceptedDeclaration] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<string | null>(null);

  // Reload products from DB
  const reloadProducts = useCallback(async (sellerId: string) => {
    try {
      const { data: prods } = await supabase.from('products').select('*').eq('seller_id', sellerId);
      setDraftProducts(prods || []);
    } catch (err) {
      console.error('Error reloading products:', err);
    }
  }, []);

  // Check for existing seller profile or draft
  useEffect(() => {
    const checkExisting = async () => {
      if (!user) { setIsCheckingExisting(false); return; }
      try {
        const { data } = await supabase.from('seller_profiles').select('*').eq('user_id', user.id);
        if (data && data.length > 0) {
          // Look for draft to resume directly
          const draft = data.find((s: any) => s.verification_status === 'draft');
          if (draft) {
            setDraftSellerId(draft.id);
            setSelectedGroup((draft as any).primary_group);
            loadSellerDataIntoForm(draft);
            await reloadProducts(draft.id);
            // Restore persisted step (survives WebView reload during image picker)
            const savedStep = parseInt(localStorage.getItem('seller_onboarding_step') || '3', 10);
            const restoredStep = Math.max(3, Math.min(savedStep, 6));
            setStep(restoredStep);
          } else {
            // For rejected profiles, set existingSeller so the rejection screen shows first
            const rejected = data.find((s: any) => s.verification_status === 'rejected');
            if (rejected) {
              setSelectedGroup((rejected as any).primary_group);
              setExistingSeller({
                id: rejected.id,
                business_name: (rejected as any).business_name,
                verification_status: (rejected as any).verification_status,
                rejection_note: (rejected as any).rejection_note,
              });
            }
          }
        }
      } catch (error) {
        console.error('Error checking existing seller:', error);
      } finally {
        setIsCheckingExisting(false);
      }
    };
    checkExisting();
  }, [user, reloadProducts]);

  // Helper to populate formData from an existing seller profile
  const loadSellerDataIntoForm = useCallback((seller: any) => {
    setFormData(f => ({
      ...f,
      business_name: seller.business_name || '',
      description: seller.description || '',
      categories: seller.categories || [],
      availability_start: seller.availability_start || '09:00',
      availability_end: seller.availability_end || '21:00',
      accepts_cod: seller.accepts_cod ?? true,
      sell_beyond_community: seller.sell_beyond_community ?? false,
      delivery_radius_km: seller.delivery_radius_km ?? 5,
      fulfillment_mode: seller.fulfillment_mode || 'self_pickup',
      delivery_note: seller.delivery_note || '',
      accepts_upi: seller.accepts_upi ?? false,
      upi_id: seller.upi_id || '',
      operating_days: seller.operating_days || [...DAYS_OF_WEEK],
      profile_image_url: seller.profile_image_url || null,
      cover_image_url: seller.cover_image_url || null,
      latitude: seller.latitude ?? null,
      longitude: seller.longitude ?? null,
    }));
  }, []);

  // Check group conflict
  useEffect(() => {
    const checkGroupConflict = async () => {
      if (!user || !selectedGroup) return;
      const { data } = await supabase
        .from('seller_profiles')
        .select('id, business_name, verification_status, rejection_note')
        .eq('user_id', user.id)
        .eq('primary_group', selectedGroup)
        .neq('verification_status', 'draft')
        .maybeSingle();
      setExistingSeller(data ? data as any : null);
    };
    checkGroupConflict();
  }, [user, selectedGroup]);

  // Fetch license status
  const fetchLicenseStatus = useCallback(async () => {
    const groupRow = groups.find(g => g.slug === selectedGroup);
    if (!draftSellerId || !groupRow) { setLicenseStatus(null); return; }
    if (!(groupRow as any).requires_license) { setLicenseStatus(null); return; }
    try {
      const { data } = await supabase.from('seller_licenses').select('status').eq('seller_id', draftSellerId).eq('group_id', groupRow.id).maybeSingle();
      setLicenseStatus(data?.status || null);
    } catch { setLicenseStatus(null); }
  }, [draftSellerId, groups, selectedGroup]);

  useEffect(() => { fetchLicenseStatus(); }, [fetchLicenseStatus]);

  // Auto-save draft for license upload
  useEffect(() => {
    if (step !== 3 || draftSellerId || isCheckingExisting || !formData.business_name.trim() || !selectedGroup) return;
    const groupRow = groups.find(g => g.slug === selectedGroup);
    if (!groupRow || !(groupRow as any).requires_license) return;

    const timer = setTimeout(async () => {
      if (!user || draftSellerId) return;
      try {
        const { data: existing } = await supabase.from('seller_profiles').select('id').eq('user_id', user.id).eq('primary_group', selectedGroup).eq('verification_status', 'draft' as any).maybeSingle();
        if (existing) { setDraftSellerId(existing.id); return; }
        const { data, error } = await supabase.from('seller_profiles').insert({
          user_id: user.id, business_name: formData.business_name.trim(), description: formData.description.trim() || null,
          categories: formData.categories, primary_group: selectedGroup, availability_start: formData.availability_start,
          availability_end: formData.availability_end, accepts_cod: formData.accepts_cod,
          sell_beyond_community: formData.sell_beyond_community, delivery_radius_km: formData.delivery_radius_km,
          society_id: profile?.society_id || null, verification_status: 'draft' as any,
        } as any).select('id').single();
        if (!error && data) setDraftSellerId(data.id);
      } catch (err) { console.error('Auto-save draft failed:', err); }
    }, 800);
    return () => clearTimeout(timer);
  }, [step, formData.business_name, draftSellerId, selectedGroup, groups, user, profile]);

  const handleCategoryChange = (category: ServiceCategory, checked: boolean) => {
    setFormData(f => ({
      ...f,
      categories: checked ? [...f.categories, category] : f.categories.filter(c => c !== category),
    }));
  };

  const toggleOperatingDay = (day: string) => {
    setFormData(prev => ({
      ...prev,
      operating_days: prev.operating_days.includes(day) ? prev.operating_days.filter(d => d !== day) : [...prev.operating_days, day],
    }));
  };

  const saveDraft = async (): Promise<string | null> => {
    if (!user) return null;
    if (!formData.business_name.trim()) { toast.error('Please enter a business name', { id: 'seller-app-validation' }); return null; }
    setIsLoading(true);
    try {
      const draftPayload = {
        business_name: formData.business_name.trim(), description: formData.description.trim() || null,
        categories: formData.categories, primary_group: selectedGroup,
        availability_start: formData.availability_start, availability_end: formData.availability_end,
        accepts_cod: formData.accepts_cod, sell_beyond_community: formData.sell_beyond_community,
        delivery_radius_km: formData.delivery_radius_km, fulfillment_mode: formData.fulfillment_mode,
        delivery_note: formData.delivery_note.trim() || null, accepts_upi: formData.accepts_upi,
        upi_id: formData.accepts_upi ? formData.upi_id.trim() || null : null,
        operating_days: formData.operating_days, profile_image_url: formData.profile_image_url,
        cover_image_url: formData.cover_image_url,
        latitude: formData.latitude,
        longitude: formData.longitude,
      };
      if (draftSellerId) {
        const { error } = await supabase.from('seller_profiles').update(draftPayload as any).eq('id', draftSellerId);
        if (error) throw error;
        return draftSellerId;
      } else {
        const { data, error } = await supabase.from('seller_profiles').insert({
          ...draftPayload, user_id: user.id, society_id: profile?.society_id || null, verification_status: 'draft' as any,
        } as any).select('id').single();
        if (error) throw error;
        setDraftSellerId(data.id);
        return data.id;
      }
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast.error(friendlyError(error), { id: 'seller-app-draft-error' });
      return null;
    } finally { setIsLoading(false); }
  };

  const handleProceedToSettings = async () => { const id = await saveDraft(); if (id) setStep(4); };
  const handleProceedToProducts = async () => {
    const id = await saveDraft();
    if (id) {
      // Always reload products from DB when entering step 5
      await reloadProducts(id);
      setStep(5);
    }
  };

  // Navigate back with auto-save when a draft exists
  const handleStepBack = async (targetStep: number) => {
    // Auto-save draft if going back from steps where data may have changed
    if (draftSellerId && step >= 3) {
      await saveDraft();
    }
    setStep(targetStep);
  };

  const handleSaveDraftAndExit = async () => {
    if (step >= 3) await saveDraft();
    localStorage.removeItem('seller_onboarding_step');
    toast.success('Draft saved! You can resume later.', { id: 'seller-app-draft-saved' });
    navigate('/profile');
  };

  const handleSubmit = async () => {
    if (!user || !draftSellerId) return;
    if (draftProducts.length === 0) { toast.error('Please add at least one product', { id: 'seller-app-validation' }); return; }
    if (!acceptedDeclaration) { toast.error('Please accept the seller declaration', { id: 'seller-app-validation' }); return; }
    if (formData.operating_days.length === 0) { toast.error('Please select at least one operating day', { id: 'seller-app-validation' }); return; }
    if (formData.accepts_upi && !formData.upi_id.trim()) { toast.error('Please enter your UPI ID or disable UPI payments', { id: 'seller-app-validation' }); return; }
    // Check location: must have direct coords OR society with coords
    if (!formData.latitude) {
      if (!profile?.society_id) {
        toast.error('Please set your store location before submitting', { id: 'seller-app-validation' });
        setIsLoading(false);
        return;
      }
      // Verify society actually has coordinates
      const { data: society } = await supabase.from('societies').select('latitude, longitude').eq('id', profile.society_id).single();
      if (!society?.latitude || !society?.longitude) {
        toast.error('Your society has no location set. Please set your store location manually.');
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('seller_profiles').update({
        verification_status: 'pending' as any, business_name: formData.business_name.trim(),
        description: formData.description.trim() || null, categories: formData.categories,
        availability_start: formData.availability_start, availability_end: formData.availability_end,
        accepts_cod: formData.accepts_cod, sell_beyond_community: formData.sell_beyond_community,
        delivery_radius_km: formData.delivery_radius_km, fulfillment_mode: formData.fulfillment_mode,
        delivery_note: formData.delivery_note.trim() || null, accepts_upi: formData.accepts_upi,
        upi_id: formData.accepts_upi ? formData.upi_id.trim() || null : null,
        operating_days: formData.operating_days, profile_image_url: formData.profile_image_url,
        cover_image_url: formData.cover_image_url, rejection_note: null,
        latitude: formData.latitude, longitude: formData.longitude,
      } as any).eq('id', draftSellerId);
      if (error) throw error;
      const { error: prodError } = await supabase.from('products').update({ approval_status: 'pending' } as any).eq('seller_id', draftSellerId).eq('approval_status', 'draft');
      if (prodError) console.error('Failed to transition products:', prodError);
      await refreshProfile();
      localStorage.setItem('seller_onboarding_completed', 'true');
    localStorage.removeItem('seller_onboarding_step');
    toast.success('Application submitted! Awaiting admin approval.');
    // Notify admins about the new store application
      notifyAdminsNewStoreApplication(formData.business_name.trim(), user.id).catch(console.error);
      setSubmissionComplete(true);
    } catch (error: any) {
      console.error('Error submitting application:', error);
      toast.error(friendlyError(error));
    } finally { setIsLoading(false); }
  };

  // Safe group selection: only clear categories when changing to a different group
  const handleGroupSelect = (group: string) => {
    if (group !== selectedGroup) {
      setSelectedGroup(group);
      setFormData(f => ({ ...f, categories: [] }));
    }
    setTimeout(() => setStep(2), 350);
  };

  const selectedGroupInfo = parentGroupInfos.find(g => g.value === selectedGroup);
  const selectedGroupRow = groups.find(g => g.slug === selectedGroup);

  return {
    user, isLoading, isCheckingExisting, groupsLoading, existingSeller, draftSellerId,
    step, setStep, selectedGroup, setSelectedGroup, formData, setFormData,
    draftProducts, setDraftProducts, acceptedDeclaration, setAcceptedDeclaration,
    licenseStatus, setLicenseStatus, parentGroupInfos, groups, groupedConfigs,
    selectedGroupInfo, selectedGroupRow, handleCategoryChange, toggleOperatingDay,
    saveDraft, handleProceedToSettings, handleProceedToProducts, handleSaveDraftAndExit,
    handleSubmit, setExistingSeller, setDraftSellerId, handleStepBack, handleGroupSelect,
    reloadProducts, submissionComplete, loadSellerDataIntoForm, rejectionFeedback, setRejectionFeedback,
  };
}
