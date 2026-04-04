import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Product, SellerProfile, ProductActionType } from '@/types/database';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useActionTypeMap } from '@/hooks/useActionTypeMap';
import { ParentGroup } from '@/types/categories';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/utils';

export interface ProductFormData {
  name: string;
  description: string;
  price: string;
  mrp: string;
  prep_time_minutes: string;
  category: string;
  is_veg: boolean;
  is_available: boolean;
  is_bestseller: boolean;
  is_recommended: boolean;
  is_urgent: boolean;
  image_url: string | null;
  action_type: string;
  contact_phone: string;
  stock_quantity: string;
  low_stock_threshold: string;
  subcategory_id: string;
  lead_time_hours: string;
  accepts_preorders: boolean;
}

export function useSellerProducts() {
  const { user, sellerProfiles, currentSellerId } = useAuth();
  const { groupedConfigs, configs } = useCategoryConfigs();
  const { data: allActions = [] } = useActionTypeMap();

  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [primaryGroup, setPrimaryGroup] = useState<ParentGroup | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [licenseBlocked, setLicenseBlocked] = useState<{ blocked: boolean; status: string; licenseName: string } | null>(null);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const allowedCategories = useMemo(() => {
    if (!primaryGroup || !groupedConfigs[primaryGroup]) return [];
    return groupedConfigs[primaryGroup];
  }, [primaryGroup, groupedConfigs]);

  const storeDefaultActionType = (sellerProfile as any)?.default_action_type as ProductActionType | null;

  useEffect(() => {
    if (user && currentSellerId) fetchData(currentSellerId);
    else if (user && sellerProfiles.length > 0) fetchData(sellerProfiles[0].id);
  }, [user, currentSellerId, sellerProfiles]);

  const fetchData = async (sellerId: string) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data: profile } = await supabase.from('seller_profiles').select('*').eq('id', sellerId).single();
      if (!profile) { setIsLoading(false); setSellerProfile(null); return; }
      setSellerProfile(profile as SellerProfile);
      setPrimaryGroup((profile as any).primary_group as ParentGroup | null);
      const { data: productData } = await supabase.from('products').select('*').eq('seller_id', profile.id).order('is_bestseller', { ascending: false }).order('created_at', { ascending: false });
      setProducts((productData || []) as Product[]);

      if ((profile as any).primary_group) {
        const { data: groupData } = await supabase.from('parent_groups').select('id, requires_license, license_mandatory, license_type_name').eq('slug', (profile as any).primary_group).eq('requires_license', true).eq('license_mandatory', true).maybeSingle();
        if (groupData) {
          const { data: licenseData } = await supabase.from('seller_licenses').select('status').eq('seller_id', profile.id).eq('group_id', groupData.id).maybeSingle();
          const status = licenseData?.status || 'none';
          setLicenseBlocked(status !== 'approved' ? { blocked: true, status, licenseName: groupData.license_type_name || 'License' } : null);
        } else { setLicenseBlocked(null); }
      }
    } catch (error) { console.error('Error fetching data:', error); }
    finally { setIsLoading(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { data: activeBookings } = await supabase.from('service_bookings').select('id').eq('product_id', deleteTarget.id).not('status', 'in', '(cancelled,completed,no_show)').limit(1);
      if (activeBookings && activeBookings.length > 0) { toast.error('Cannot delete: this product has active bookings. Cancel or complete them first.', { id: 'product-delete-blocked' }); setDeleteTarget(null); return; }
      const { error } = await supabase.from('products').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Product deleted', { id: 'product-deleted' });
      if (sellerProfile) fetchData(sellerProfile.id);
    } catch (error) { console.error('Error deleting product:', error); toast.error(friendlyError(error), { id: 'product-delete-error' }); }
    finally { setDeleteTarget(null); }
  };

  const toggleAvailability = async (product: Product) => {
    const status = (product as any).approval_status || 'draft';
    if (status !== 'approved') { toast.error('Submit for review first — only approved products can be toggled.', { id: 'product-toggle-blocked' }); return; }
    try {
      const { error } = await supabase.from('products').update({ is_available: !product.is_available }).eq('id', product.id);
      if (error) throw error;
      if (sellerProfile) fetchData(sellerProfile.id);
    } catch (error) { console.error('Error updating availability:', error); toast.error('Failed to update', { id: 'product-toggle-error' }); }
  };

  return {
    user, sellerProfile, primaryGroup, products, isLoading,
    licenseBlocked, isBulkOpen, setIsBulkOpen,
    deleteTarget, setDeleteTarget,
    allowedCategories, configs, sellerProfiles,
    confirmDelete, toggleAvailability, fetchData,
    storeDefaultActionType, allActions,
  };
}
