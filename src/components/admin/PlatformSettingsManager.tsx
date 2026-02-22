import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Settings, Save, Loader2, RefreshCw, IndianRupee, Mail, Type, Percent } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface SettingField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email';
  icon: React.ElementType;
  group: string;
  description: string;
}

const SETTING_FIELDS: SettingField[] = [
  { key: 'base_delivery_fee', label: 'Base Delivery Fee (₹)', type: 'number', icon: IndianRupee, group: 'Financial', description: 'Charged when order is below free delivery threshold' },
  { key: 'free_delivery_threshold', label: 'Free Delivery Threshold (₹)', type: 'number', icon: IndianRupee, group: 'Financial', description: 'Orders above this amount get free delivery' },
  { key: 'platform_fee_percent', label: 'Platform Fee (%)', type: 'number', icon: Percent, group: 'Financial', description: 'Commission deducted from seller earnings' },
  { key: 'support_email', label: 'Support Email', type: 'email', icon: Mail, group: 'Contact', description: 'Shown on Terms & Pricing pages' },
  { key: 'grievance_email', label: 'Grievance Email', type: 'email', icon: Mail, group: 'Contact', description: 'Shown on Help & Grievance Officer section' },
  { key: 'dpo_email', label: 'DPO Email', type: 'email', icon: Mail, group: 'Contact', description: 'Data Protection Officer email on Privacy Policy' },
  { key: 'grievance_officer_name', label: 'Grievance Officer Name', type: 'text', icon: Type, group: 'Contact', description: 'Displayed in the Grievance Officer card' },
  { key: 'header_tagline', label: 'Header Tagline', type: 'text', icon: Type, group: 'Branding', description: 'Shown below the logo in the app header' },
  { key: 'app_version', label: 'App Version', type: 'text', icon: Settings, group: 'Branding', description: 'Displayed on the Profile page' },
  { key: 'address_block_label', label: 'Address Block Label', type: 'text', icon: Type, group: 'Address', description: 'Label for block/tower field (e.g., Block / Tower, Wing)' },
  { key: 'address_flat_label', label: 'Address Flat Label', type: 'text', icon: Type, group: 'Address', description: 'Label for flat/unit field (e.g., Flat Number, Unit)' },
  { key: 'terms_last_updated', label: 'Terms Last Updated', type: 'text', icon: Type, group: 'Legal', description: 'Date shown on Terms & Conditions page' },
  { key: 'privacy_last_updated', label: 'Privacy Last Updated', type: 'text', icon: Type, group: 'Legal', description: 'Date shown on Privacy Policy page' },
];

export function PlatformSettingsManager() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', SETTING_FIELDS.map(f => f.key));

    const map: Record<string, string> = {};
    for (const row of data || []) {
      if (row.key && row.value) map[row.key] = row.value;
    }
    setValues(map);
    setOriginal(map);
    setLoading(false);
  };

  const changedKeys = Object.keys(values).filter(k => values[k] !== original[k]);
  const hasChanges = changedKeys.length > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      for (const key of changedKeys) {
        // Upsert: update if exists, insert if not
        const { data: existing } = await supabase
          .from('system_settings')
          .select('key')
          .eq('key', key)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('system_settings')
            .update({ value: values[key], updated_at: new Date().toISOString() })
            .eq('key', key);
        } else {
          await supabase
            .from('system_settings')
            .insert({ key, value: values[key] });
        }
      }
      setOriginal({ ...values });
      queryClient.invalidateQueries({ queryKey: ['system-settings-core'] });
      toast.success(`${changedKeys.length} setting(s) updated`);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const groups = [...new Set(SETTING_FIELDS.map(f => f.group))];

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Loading settings...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Settings size={16} className="text-primary" /> Platform Settings
          </h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchSettings}>
              <RefreshCw size={12} className="mr-1" /> Refresh
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!hasChanges || saving}
              onClick={handleSave}
            >
              {saving ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Save size={12} className="mr-1" />}
              Save {hasChanges ? `(${changedKeys.length})` : ''}
            </Button>
          </div>
        </div>

        {groups.map((group, gi) => (
          <div key={group}>
            {gi > 0 && <Separator className="my-3" />}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group}</p>
            <div className="space-y-3">
              {SETTING_FIELDS.filter(f => f.group === group).map(field => {
                const Icon = field.icon;
                const isChanged = values[field.key] !== original[field.key];
                return (
                  <div key={field.key}>
                    <Label className="text-xs flex items-center gap-1.5 mb-1">
                      <Icon size={12} className="text-muted-foreground" />
                      {field.label}
                      {isChanged && <span className="text-[9px] text-warning font-medium ml-1">• modified</span>}
                    </Label>
                    <Input
                      type={field.type}
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="h-8 text-sm"
                      placeholder={field.description}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{field.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
