// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PartyPopper } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  sellerId: string;
}

export function SellerFestivalParticipation({ sellerId }: Props) {
  const qc = useQueryClient();

  // Fetch active festival banners
  const { data: festivals = [], isLoading: loadingFestivals } = useQuery({
    queryKey: ['active-festivals-for-seller'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('featured_items')
        .select('id, title, theme_config, theme_preset, badge_text, schedule_start, schedule_end')
        .eq('banner_type', 'festival')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      // Filter to active schedule
      return (data || []).filter((f: any) => {
        if (f.schedule_end && new Date(f.schedule_end) < new Date()) return false;
        if (f.schedule_start && new Date(f.schedule_start) > new Date()) return false;
        return true;
      });
    },
    staleTime: 5 * 60_000,
  });

  // Fetch seller's participation records
  const { data: participations = [], isLoading: loadingPart } = useQuery({
    queryKey: ['seller-festival-participation', sellerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('festival_seller_participation')
        .select('*')
        .eq('seller_id', sellerId);
      return data || [];
    },
    enabled: !!sellerId,
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ bannerId, optIn }: { bannerId: string; optIn: boolean }) => {
      const existing = participations.find((p: any) => p.banner_id === bannerId);
      if (existing) {
        const { error } = await supabase
          .from('festival_seller_participation')
          .update({ opted_in: optIn, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('festival_seller_participation')
          .insert({ banner_id: bannerId, seller_id: sellerId, opted_in: optIn });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-festival-participation'] });
      toast.success('Festival participation updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (loadingFestivals || loadingPart) {
    return <Skeleton className="h-24 rounded-2xl" />;
  }

  if (festivals.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PartyPopper size={16} className="text-amber-500" />
        <p className="text-sm font-semibold">Festival Campaigns</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Opt in to show your products in active festival promotions
      </p>
      {festivals.map((festival: any) => {
        const participation = participations.find((p: any) => p.banner_id === festival.id);
        const isOptedIn = participation ? participation.opted_in : false;
        const gradient = festival.theme_config?.gradient || [];
        const bgPreview = gradient.length >= 2
          ? `linear-gradient(135deg, ${gradient.join(', ')})`
          : festival.theme_config?.bg || 'hsl(var(--primary))';

        return (
          <Card key={festival.id} className="border-0 shadow-[var(--shadow-card)] rounded-2xl">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-lg"
                style={{ background: bgPreview }}
              >
                {festival.badge_text ? '🎉' : '🎊'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{festival.title || 'Festival'}</p>
                {festival.schedule_end && (
                  <p className="text-[10px] text-muted-foreground">
                    Ends {new Date(festival.schedule_end).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Switch
                checked={isOptedIn}
                onCheckedChange={(checked) => toggleMutation.mutate({ bannerId: festival.id, optIn: checked })}
                disabled={toggleMutation.isPending}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
