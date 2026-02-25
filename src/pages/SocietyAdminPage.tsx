import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { SocietySwitcher } from '@/components/admin/SocietySwitcher';
import { SecurityStaffManager } from '@/components/admin/SecurityStaffManager';
import { SecurityModeSettings } from '@/components/admin/SecurityModeSettings';
import { CommitteeDashboard } from '@/components/admin/CommitteeDashboard';
import { AdminDisputesTab } from '@/components/admin/AdminDisputesTab';
import { AdminPaymentMilestones } from '@/components/admin/AdminPaymentMilestones';
import { useSocietyAdmin } from '@/hooks/useSocietyAdmin';
import { Check, X, Users, Store, Settings, Shield, UserPlus, Trash2, ToggleLeft, Lock, IndianRupee } from 'lucide-react';
import type { FeatureKey } from '@/hooks/useEffectiveFeatures';

export default function SocietyAdminPage() {
  const sa = useSocietyAdmin();

  if (!sa.isSocietyAdmin && !sa.isAdmin) {
    return <AppLayout headerTitle="Society Admin" showLocation={false}><div className="p-4 text-center text-muted-foreground py-20"><Shield size={48} className="mx-auto mb-4 text-muted-foreground/50" /><p className="font-medium">Access Denied</p><p className="text-sm">You need society admin privileges.</p></div></AppLayout>;
  }

  if (sa.isLoading) return <AppLayout headerTitle="Society Admin" showLocation={false}><div className="p-4 space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div></AppLayout>;

  return (
    <AppLayout headerTitle={`${sa.effectiveSociety?.name || 'Society'} Admin`} showLocation={false}>
      <div className="p-4 space-y-4">
        {sa.isAdmin && <SocietySwitcher />}

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3 text-center"><Users className="mx-auto text-primary mb-1" size={18} /><p className="text-lg font-bold">{sa.pendingUsers.length}</p><p className="text-[10px] text-muted-foreground">Pending Users</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><Store className="mx-auto text-warning mb-1" size={18} /><p className="text-lg font-bold">{sa.pendingSellers.length}</p><p className="text-[10px] text-muted-foreground">Pending Sellers</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><Shield className="mx-auto text-info mb-1" size={18} /><p className="text-lg font-bold">{sa.societyAdmins.length}</p><p className="text-[10px] text-muted-foreground">Admins</p></CardContent></Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="users" className="text-xs">Users</TabsTrigger>
            <TabsTrigger value="sellers" className="text-xs">Sellers</TabsTrigger>
            <TabsTrigger value="disputes" className="text-xs">Disputes</TabsTrigger>
            <TabsTrigger value="more" className="text-xs">More</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">{sa.societyId && <CommitteeDashboard societyId={sa.societyId} />}</TabsContent>

          <TabsContent value="users" className="space-y-2 mt-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Pending Users ({sa.pendingUsers.length})</h3>
            {sa.pendingUsers.length > 0 ? sa.pendingUsers.map(user => (
              <Card key={user.id}><CardContent className="p-3 flex items-center justify-between">
                <div><p className="font-medium text-sm">{user.name}</p><p className="text-xs text-muted-foreground">{user.phone}</p><p className="text-xs text-muted-foreground">{user.phase && `${user.phase}, `}Block {user.block}, Flat {user.flat_number}</p></div>
                <div className="flex gap-2"><Button size="sm" variant="outline" className="text-destructive h-8 w-8 p-0" onClick={() => sa.updateUserStatus(user.id, 'rejected')}><X size={14} /></Button><Button size="sm" className="h-8 w-8 p-0" onClick={() => sa.updateUserStatus(user.id, 'approved')}><Check size={14} /></Button></div>
              </CardContent></Card>
            )) : <p className="text-center text-muted-foreground py-8 text-sm">No pending users</p>}
          </TabsContent>

          <TabsContent value="sellers" className="space-y-2 mt-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Pending Sellers ({sa.pendingSellers.length})</h3>
            {sa.pendingSellers.length > 0 ? sa.pendingSellers.map(seller => (
              <Card key={seller.id}><CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div><p className="font-semibold text-sm">{seller.business_name}</p><p className="text-xs text-muted-foreground">{(seller as any).profile?.name} • Block {(seller as any).profile?.block}</p></div>
                  <div className="flex gap-2"><Button size="sm" variant="outline" className="text-destructive h-8 w-8 p-0" onClick={() => sa.updateSellerStatus(seller.id, 'rejected')}><X size={14} /></Button><Button size="sm" className="h-8 w-8 p-0" onClick={() => sa.updateSellerStatus(seller.id, 'approved')}><Check size={14} /></Button></div>
                </div>
                {seller.description && <p className="text-xs text-muted-foreground">{seller.description}</p>}
                {seller.primary_group && <p className="text-xs"><span className="text-muted-foreground">Category:</span> <span className="font-medium capitalize">{seller.primary_group.replace(/_/g, ' ')}</span></p>}
              </CardContent></Card>
            )) : <p className="text-center text-muted-foreground py-8 text-sm">No pending sellers</p>}
          </TabsContent>

          <TabsContent value="disputes" className="mt-4"><AdminDisputesTab /></TabsContent>

          <TabsContent value="more" className="mt-4 space-y-6">
            {/* Admins */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3"><Shield size={14} /> Admins ({sa.societyAdmins.length})</h3>
              {sa.societyAdmins.map(admin => (
                <Card key={admin.id} className="mb-2"><CardContent className="p-3 flex items-center justify-between">
                  <div><p className="font-medium text-sm">{(admin as any).user?.name || 'Unknown'}</p><p className="text-xs text-muted-foreground capitalize">{admin.role}</p></div>
                  {admin.user_id !== sa.profile?.id && <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => sa.removeAdmin(admin.id)}><Trash2 size={14} /></Button>}
                </CardContent></Card>
              ))}
              <Sheet open={sa.appointOpen} onOpenChange={sa.setAppointOpen}>
                <SheetTrigger asChild><Button size="sm" variant="outline" className="gap-1 mt-2"><UserPlus size={14} /> Appoint Admin</Button></SheetTrigger>
                <SheetContent><SheetHeader><SheetTitle>Appoint Society Admin</SheetTitle></SheetHeader>
                  <div className="mt-4 space-y-4">
                    <Input placeholder="Search residents by name..." value={sa.searchQuery} onChange={e => sa.searchResidents(e.target.value)} />
                    <div className="space-y-2 max-h-96 overflow-y-auto">{sa.searchResults.map(resident => (
                      <Card key={resident.id}><CardContent className="p-3 flex items-center justify-between">
                        <div><p className="font-medium text-sm">{resident.name}</p><p className="text-xs text-muted-foreground">Block {resident.block}, Flat {resident.flat_number}</p></div>
                        <div className="flex gap-1"><Button size="sm" variant="outline" className="text-xs" onClick={() => sa.appointAdmin(resident.id, 'moderator')}>Mod</Button><Button size="sm" className="text-xs" onClick={() => sa.appointAdmin(resident.id, 'admin')}>Admin</Button></div>
                      </CardContent></Card>
                    ))}</div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div><h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3"><IndianRupee size={14} /> Payment Milestones</h3><AdminPaymentMilestones /></div>

            <div><h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3"><Shield size={14} /> Security</h3><SecurityModeSettings /><SecurityStaffManager /></div>

            {/* Features */}
            <div>
              <div className="flex items-center gap-2 mb-3"><ToggleLeft size={16} className="text-primary" /><h3 className="text-sm font-semibold text-muted-foreground">Society Features</h3></div>
              <Card><CardContent className="p-4 space-y-4">
                {sa.features.map(f => {
                  const key = f.feature_key as FeatureKey;
                  const state = sa.getFeatureState(key);
                  const configurable = sa.isConfigurable(key);
                  const enabled = sa.isFeatureEnabled(key);
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-sm font-medium">{sa.getFeatureDisplayName(key)}</Label>
                          {state === 'locked' && <Badge variant="secondary" className="text-[8px] h-4 gap-0.5"><Lock size={8} /> Locked</Badge>}
                          {state === 'unavailable' && <Badge variant="outline" className="text-[8px] h-4 text-muted-foreground">Not in plan</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{sa.getFeatureDescription(key)}</p>
                      </div>
                      <Switch checked={enabled} disabled={!configurable} onCheckedChange={checked => sa.toggleFeature.mutate({ key, enabled: checked })} />
                    </div>
                  );
                })}
              </CardContent></Card>
            </div>

            {/* Settings */}
            <Card><CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Settings size={16} /> Society Settings</h3>
              <div className="flex items-center justify-between"><div><Label className="text-sm font-medium">Auto-approve residents</Label><p className="text-xs text-muted-foreground">Skip manual approval</p></div><Switch checked={sa.autoApprove} onCheckedChange={checked => { sa.setAutoApprove(checked); sa.updateSocietySettings('auto_approve_residents', checked); }} /></div>
              <div className="space-y-2"><Label className="text-sm font-medium">Approval Method</Label><Select value={sa.approvalMethod} onValueChange={value => { sa.setApprovalMethod(value); sa.updateSocietySettings('approval_method', value); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="invite_code">Invite Code</SelectItem><SelectItem value="auto">Auto (GPS match)</SelectItem></SelectContent></Select></div>
              {sa.effectiveSociety?.invite_code && <div className="p-3 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Society Invite Code</p><p className="font-mono font-bold text-lg">{sa.effectiveSociety.invite_code}</p></div>}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
