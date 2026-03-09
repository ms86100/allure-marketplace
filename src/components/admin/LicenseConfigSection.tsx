import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield } from 'lucide-react';
import { useSellerApplicationReview } from '@/hooks/useSellerApplicationReview';
import { DynamicIcon } from '@/components/ui/DynamicIcon';

export function LicenseConfigSection() {
  const s = useSellerApplicationReview();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <Shield size={15} className="text-violet-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">License Requirements</h3>
          <p className="text-[10px] text-muted-foreground">Configure which categories require sellers to upload a license.</p>
        </div>
      </div>

      <Card className="border-0 shadow-[var(--shadow-card)] rounded-2xl">
        <CardContent className="p-4 space-y-2.5">
          {s.groups.map((group) => (
            <div key={group.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <DynamicIcon name={group.icon} size={14} />
                <div className="min-w-0">
                  <p className="font-semibold text-xs">{group.name}</p>
                  {group.requires_license && group.license_type_name && (
                    <p className="text-[10px] text-muted-foreground truncate">{group.license_type_name}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {group.requires_license && (
                  <>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 rounded-lg"
                      onClick={() => { s.setEditingGroup(group); s.setEditForm({ license_type_name: group.license_type_name || '', license_description: group.license_description || '' }); }}>
                      Edit
                    </Button>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Mandatory</span>
                      <Switch checked={group.license_mandatory} onCheckedChange={(c) => s.toggleMandatory(group, c)} />
                    </div>
                  </>
                )}
                <Switch checked={group.requires_license} onCheckedChange={(c) => s.toggleRequiresLicense(group, c)} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Edit Group License Config Dialog */}
      <Dialog open={!!s.editingGroup} onOpenChange={() => s.setEditingGroup(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle className="font-bold">Configure License for {s.editingGroup?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">License Type Name</label>
              <Input placeholder="e.g., FSSAI Certificate" value={s.editForm.license_type_name} onChange={(e) => s.setEditForm({ ...s.editForm, license_type_name: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Description for Sellers</label>
              <Textarea placeholder="Instructions for sellers..." value={s.editForm.license_description} onChange={(e) => s.setEditForm({ ...s.editForm, license_description: e.target.value })} rows={3} className="rounded-xl" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl h-10" onClick={() => s.setEditingGroup(null)}>Cancel</Button>
              <Button className="flex-1 rounded-xl h-10 font-semibold" onClick={s.saveGroupConfig}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
