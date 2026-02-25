import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Bell, MessageCircle, Tag, Volume2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface NotificationPreferences {
  orders: boolean;
  chat: boolean;
  promotions: boolean;
  sounds: boolean;
}

const defaultPreferences: NotificationPreferences = {
  orders: true,
  chat: true,
  promotions: true,
  sounds: true,
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: preferences = defaultPreferences, isLoading } = useQuery({
    queryKey: ['notification-preferences', user?.id],
    queryFn: async () => {
      if (!user?.id) return defaultPreferences;
      const { data, error } = await (supabase.from('notification_preferences') as any)
        .select('orders, chat, promotions, sounds')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.warn('[Notifications] Failed to fetch preferences:', error);
        return defaultPreferences;
      }
      return data ? { orders: data.orders, chat: data.chat, promotions: data.promotions, sounds: data.sounds } : defaultPreferences;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (newPrefs: NotificationPreferences) => {
      if (!user?.id) return;
      const { error } = await (supabase.from('notification_preferences') as any)
        .upsert({
          user_id: user.id,
          ...newPrefs,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences', user?.id] });
    },
    onError: (error: any) => {
      toast.error('Failed to save preference. Please try again.');
      console.error('[Notifications] Save error:', error);
    },
  });

  const updatePreference = (key: keyof NotificationPreferences, value: boolean) => {
    const newPrefs = { ...preferences, [key]: value };
    mutation.mutate(newPrefs);
  };

  const notificationItems = [
    {
      key: 'orders' as const,
      icon: Bell,
      title: 'Order Updates',
      description: 'Get notified about order status changes',
    },
    {
      key: 'chat' as const,
      icon: MessageCircle,
      title: 'Chat Messages',
      description: 'Receive notifications for new messages',
    },
    {
      key: 'promotions' as const,
      icon: Tag,
      title: 'Promotions',
      description: 'Special offers and featured sellers',
    },
    {
      key: 'sounds' as const,
      icon: Volume2,
      title: 'Notification Sounds',
      description: 'Play sounds for notifications',
    },
  ];

  return (
    <AppLayout showHeader={false}>
      <div className="safe-top">
        {/* Sticky header */}
        <div className="sticky top-0 z-30 bg-background border-b border-border px-4 py-3.5 flex items-center gap-3">
          <Link to="/profile" className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg font-bold">Notification Settings</h1>
            <p className="text-xs text-muted-foreground">Choose what notifications you want to receive</p>
          </div>
        </div>

        <div className="p-4">

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : (
          <div className="space-y-3">
            {notificationItems.map(({ key, icon: Icon, title, description }) => (
              <Card key={key}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon size={20} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label htmlFor={key} className="font-medium cursor-pointer">
                      {title}
                    </Label>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <Switch
                    id={key}
                    checked={preferences[key]}
                    onCheckedChange={(checked) => updatePreference(key, checked)}
                    disabled={mutation.isPending}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">
          Your preferences are synced across all your devices.
        </p>
        </div>
      </div>
    </AppLayout>
  );
}
