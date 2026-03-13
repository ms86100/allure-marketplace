import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useDeliveryAddresses() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ['delivery-addresses', user?.id];

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_addresses')
        .select('*')
        .eq('user_id', user!.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (addr: any) => {
      const payload: Record<string, any> = {
        user_id: user!.id,
        label: addr.label,
        flat_number: addr.flat_number,
        block: addr.block ?? null,
        floor: addr.floor ?? null,
        building_name: addr.building_name ?? null,
        landmark: addr.landmark ?? null,
        phase: addr.phase ?? null,
        pincode: addr.pincode ?? null,
        full_address: addr.full_address ?? null,
        latitude: addr.latitude ?? null,
        longitude: addr.longitude ?? null,
        is_default: addr.is_default ?? false,
        society_id: addr.society_id ?? null,
      };

      // If setting as default, unset others first
      if (payload.is_default) {
        await supabase.from('delivery_addresses').update({ is_default: false }).eq('user_id', user!.id);
      }

      if (addr.id) {
        const { error } = await supabase.from('delivery_addresses').update(payload).eq('id', addr.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('delivery_addresses').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Address saved'); },
    onError: () => toast.error('Failed to save address'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_addresses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Address deleted'); },
    onError: () => toast.error('Failed to delete address'),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('delivery_addresses').update({ is_default: false }).eq('user_id', user!.id);
      const { error } = await supabase.from('delivery_addresses').update({ is_default: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Default address updated'); },
    onError: () => toast.error('Failed to update default'),
  });

  const defaultAddress = addresses.find(a => a.is_default) || addresses[0] || null;

  return {
    addresses,
    isLoading,
    defaultAddress,
    saveAddress: saveMutation.mutateAsync,
    deleteAddress: deleteMutation.mutateAsync,
    setDefault: setDefaultMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
