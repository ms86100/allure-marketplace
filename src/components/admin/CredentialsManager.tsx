import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Check, X, CreditCard, MessageSquare, Bell, MapPin, KeyRound } from 'lucide-react';

interface CredentialConfig {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  multiline?: boolean;
}

interface CredentialSetting {
  id: string;
  key: string;
  value: string | null;
  is_active: boolean;
  description: string | null;
}

const CREDENTIAL_TABS = [
  {
    id: 'payment',
    label: 'Payment',
    icon: CreditCard,
    credentials: [
      { key: 'razorpay_key_id', label: 'Razorpay Key ID', description: 'Public key for UPI/card payments via Razorpay', placeholder: 'rzp_live_...' },
      { key: 'razorpay_key_secret', label: 'Razorpay Key Secret', description: 'Secret key for payment verification (keep private)', placeholder: 'Your secret key' },
    ] as CredentialConfig[],
  },
  {
    id: 'sms',
    label: 'SMS / OTP',
    icon: MessageSquare,
    credentials: [
      { key: 'msg91_auth_key', label: 'MSG91 Auth Key', description: 'Authentication key for MSG91 OTP service', placeholder: 'Your MSG91 auth key' },
      { key: 'msg91_widget_id', label: 'MSG91 Widget ID', description: 'Widget ID for OTP widget integration', placeholder: 'Widget ID' },
      { key: 'msg91_token_auth', label: 'MSG91 Token Auth', description: 'Token for widget authentication', placeholder: 'Token auth value' },
      { key: 'msg91_otp_template_id', label: 'MSG91 OTP Template ID', description: 'Template ID for OTP messages', placeholder: 'Template ID' },
    ] as CredentialConfig[],
  },
  {
    id: 'push',
    label: 'Push',
    icon: Bell,
    credentials: [
      { key: 'firebase_service_account', label: 'Firebase Service Account JSON', description: 'Full service account JSON for FCM push notifications', placeholder: '{"type":"service_account",...}', multiline: true },
      { key: 'apns_key_p8', label: 'APNs Key (.p8)', description: 'Apple Push Notification Service private key content', placeholder: '-----BEGIN PRIVATE KEY-----...', multiline: true },
      { key: 'apns_key_id', label: 'APNs Key ID', description: '10-character key identifier from Apple Developer portal', placeholder: 'ABC123DEF4' },
      { key: 'apns_team_id', label: 'APNs Team ID', description: 'Apple Developer Team ID', placeholder: 'TEAM123456' },
      { key: 'apns_bundle_id', label: 'APNs Bundle ID', description: 'iOS app bundle identifier', placeholder: 'com.yourapp.bundle' },
    ] as CredentialConfig[],
  },
  {
    id: 'maps',
    label: 'Maps',
    icon: MapPin,
    credentials: [
      { key: 'google_maps_api_key', label: 'Google Maps API Key', description: 'Required for location features and address autocomplete', placeholder: 'AIza...' },
    ] as CredentialConfig[],
  },
];

const ALL_KEYS = CREDENTIAL_TABS.flatMap(t => t.credentials.map(c => c.key));

export function CredentialsManager() {
  const [settings, setSettings] = useState<CredentialSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .in('key', ALL_KEYS);
      if (error) throw error;
      setSettings(data || []);
      const values: Record<string, string> = {};
      (data || []).forEach((s: CredentialSetting) => { values[s.key] = s.value || ''; });
      setEditValues(values);
    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast.error('Failed to load credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (key: string) => {
    setIsSaving(key);
    try {
      const existingSetting = settings.find(s => s.key === key);
      const value = editValues[key] || null;
      const config = CREDENTIAL_TABS.flatMap(t => t.credentials).find(c => c.key === key);

      if (existingSetting) {
        const { error } = await supabase
          .from('admin_settings')
          .update({ value, is_active: !!value, updated_at: new Date().toISOString() })
          .eq('key', key);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_settings')
          .insert({ key, value, is_active: !!value, description: config?.description || null });
        if (error) throw error;
      }
      toast.success('Credential saved');
      await fetchSettings();
    } catch (error) {
      console.error('Error saving credential:', error);
      toast.error('Failed to save credential');
    } finally {
      setIsSaving(null);
    }
  };

  const toggleActive = async (key: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('admin_settings')
        .update({ is_active: isActive })
        .eq('key', key);
      if (error) throw error;
      await fetchSettings();
      toast.success(isActive ? 'Enabled' : 'Disabled');
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  const renderCredentialField = (config: CredentialConfig) => {
    const setting = settings.find(s => s.key === config.key);
    const hasValue = !!setting?.value;
    const isActive = setting?.is_active ?? false;

    return (
      <div key={config.key} className="space-y-2.5 p-3.5 rounded-xl bg-muted/30 border border-border/40">
        <div className="flex items-center justify-between">
          <Label htmlFor={config.key} className="font-semibold text-sm">{config.label}</Label>
          {hasValue && (
            <div className="flex items-center gap-2">
              {isActive ? (
                <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-0.5">
                  <Check size={10} /> Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-0.5"><X size={10} /> Inactive</Badge>
              )}
              <Switch checked={isActive} onCheckedChange={checked => toggleActive(config.key, checked)} />
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">{config.description}</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            {config.multiline ? (
              <Textarea
                id={config.key}
                placeholder={config.placeholder}
                value={editValues[config.key] || ''}
                onChange={e => setEditValues({ ...editValues, [config.key]: e.target.value })}
                className="rounded-lg text-xs font-mono min-h-[80px]"
              />
            ) : (
              <>
                <Input
                  id={config.key}
                  type={showValues[config.key] ? 'text' : 'password'}
                  placeholder={config.placeholder}
                  value={editValues[config.key] || ''}
                  onChange={e => setEditValues({ ...editValues, [config.key]: e.target.value })}
                  className="rounded-lg pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowValues({ ...showValues, [config.key]: !showValues[config.key] })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showValues[config.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </>
            )}
          </div>
          <Button onClick={() => handleSave(config.key)} disabled={isSaving === config.key} size="sm" className="rounded-lg shrink-0">
            {isSaving === config.key ? <Loader2 className="animate-spin" size={14} /> : 'Save'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <KeyRound size={16} className="text-amber-600" />
            </div>
            Credentials Manager
          </CardTitle>
          <CardDescription className="text-xs">
            Manage API keys and secrets for all third-party integrations. Changes take effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="payment" className="w-full">
            <TabsList className="w-full grid grid-cols-4 rounded-xl h-9 mb-4">
              {CREDENTIAL_TABS.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className="text-[11px] rounded-lg font-semibold gap-1">
                  <tab.icon size={13} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {CREDENTIAL_TABS.map(tab => (
              <TabsContent key={tab.id} value={tab.id} className="space-y-4">
                {tab.credentials.map(renderCredentialField)}
              </TabsContent>
            ))}
          </Tabs>

          <div className="pt-4 mt-4 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              🔒 Credentials are stored securely in the database. Edge functions read from here with environment secret fallback.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
