import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Check, X, Loader2, Store, Package, FileText, Eye, Clock, Shield,
  ChevronDown, ChevronUp, MapPin, Phone, Calendar, CreditCard, Truck, User,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSellerApplicationReview } from '@/hooks/useSellerApplicationReview';

function statusBadge(status: string) {
  switch (status) {
    case 'pending': return <Badge variant="outline" className="text-warning border-warning"><Clock size={10} className="mr-1" /> Pending</Badge>;
    case 'approved': return <Badge variant="outline" className="text-success border-success"><Check size={10} className="mr-1" /> Approved</Badge>;
    case 'rejected': return <Badge variant="outline" className="text-destructive border-destructive"><X size={10} className="mr-1" /> Rejected</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export function SellerApplicationReview() {
  const s = useSellerApplicationReview();

  if (s.isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Store size={14} />
          {s.statusFilter === 'pending' ? `Pending Applications (${s.pendingCount})` : `All Sellers (${s.applications.length})`}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Show all</span>
          <Switch checked={s.statusFilter === 'all'} onCheckedChange={(c) => s.setStatusFilter(c ? 'all' : 'pending')} />
        </div>
      </div>

      {/* License Requirements Config */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full text-xs gap-2">
            <Shield size={14} /> License Requirements Config <ChevronDown size={14} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Card><CardContent className="p-3 space-y-2">
            <p className="text-[10px] text-muted-foreground">Configure which categories require sellers to upload a license.</p>
            {s.groups.map((group) => (
              <div key={group.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">{group.icon}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-xs">{group.name}</p>
                    {group.requires_license && group.license_type_name && (
                      <p className="text-[10px] text-muted-foreground truncate">{group.license_type_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {group.requires_license && (
                    <>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
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
          </CardContent></Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Seller Applications */}
      {s.applications.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">No {s.statusFilter === 'pending' ? 'pending applications' : 'sellers found'}</p>
      ) : (
        s.applications.map((seller) => {
          const isExpanded = s.expandedId === seller.id;
          const pendingLicenses = seller.licenses.filter(l => l.status === 'pending').length;
          const totalProducts = seller.products.length;
          const approvedProducts = seller.products.filter(p => p.approval_status === 'approved').length;
          const isPending = seller.verification_status === 'pending';

          return (
            <Card key={seller.id} className={isPending ? 'border-warning/40' : ''}>
              <CardContent className="p-0">
                <div className="p-4 cursor-pointer" onClick={() => s.setExpandedId(isExpanded ? null : seller.id)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {seller.profile_image_url ? (
                        <img src={seller.profile_image_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0"><Store size={16} className="text-muted-foreground" /></div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{seller.business_name}</p>
                        <p className="text-xs text-muted-foreground">{seller.profile?.name}{seller.profile?.flat_number && ` • Flat ${seller.profile.flat_number}`}{seller.profile?.block && `, Block ${seller.profile.block}`}</p>
                        {seller.society?.name && <p className="text-[10px] text-primary">{seller.society.name}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {statusBadge(seller.verification_status)}
                          {seller.primary_group && <Badge variant="secondary" className="text-[10px]">{seller.primary_group.replace(/_/g, ' ')}</Badge>}
                          {pendingLicenses > 0 && <Badge variant="outline" className="text-[10px] text-warning border-warning"><FileText size={8} className="mr-1" />{pendingLicenses} license pending</Badge>}
                          <Badge variant="outline" className="text-[10px]"><Package size={8} className="mr-1" />{approvedProducts}/{totalProducts} products</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">{isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}</div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t pt-4">
                    {/* Store Details */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Store Details</h4>
                      {seller.description && <p className="text-xs text-muted-foreground">{seller.description}</p>}
                      {seller.cover_image_url && <img src={seller.cover_image_url} alt="Cover" className="w-full h-24 rounded-lg object-cover" />}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {seller.profile?.phone && <div className="flex items-center gap-1"><Phone size={10} className="text-muted-foreground" /> {seller.profile.phone}</div>}
                        {seller.society?.address && <div className="flex items-center gap-1 col-span-2"><MapPin size={10} className="text-muted-foreground" /> {seller.society.address}</div>}
                        {(seller.availability_start || seller.availability_end) && <div className="flex items-center gap-1"><Calendar size={10} className="text-muted-foreground" /> {seller.availability_start || '—'} – {seller.availability_end || '—'}</div>}
                        {seller.operating_days?.length > 0 && <div className="text-[10px] text-muted-foreground">{seller.operating_days.join(', ')}</div>}
                        <div className="flex items-center gap-1"><CreditCard size={10} className="text-muted-foreground" /> COD: {seller.accepts_cod ? '✓' : '✗'} | UPI: {seller.accepts_upi ? '✓' : '✗'}</div>
                        {seller.upi_id && <div className="text-[10px] text-muted-foreground">UPI: {seller.upi_id}</div>}
                        {seller.fulfillment_mode && <div className="flex items-center gap-1"><Truck size={10} className="text-muted-foreground" /> {seller.fulfillment_mode.replace(/_/g, ' ')}</div>}
                        {seller.categories?.length > 0 && <div className="col-span-2 text-[10px] text-muted-foreground">Sub-categories: {seller.categories.map(c => c.replace(/_/g, ' ')).join(', ')}</div>}
                        <div className="text-[10px] text-muted-foreground">Cross-society: {seller.sell_beyond_community ? `Yes (${seller.delivery_radius_km || 5}km)` : 'No'}</div>
                        <div className="text-[10px] text-muted-foreground">Applied: {format(new Date(seller.created_at), 'dd MMM yyyy')}</div>
                      </div>
                    </div>

                    {/* Licenses */}
                    {seller.licenses.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><FileText size={12} /> Licenses ({seller.licenses.length})</h4>
                        {seller.licenses.map((lic) => (
                          <div key={lic.id} className="bg-muted rounded-lg p-3 space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-1"><span className="text-xs">{(lic as any).group?.icon}</span><span className="text-xs font-medium">{lic.license_type}</span></div>
                                {lic.license_number && <p className="text-[10px] text-muted-foreground">#{lic.license_number}</p>}
                                <p className="text-[10px] text-muted-foreground">Submitted {format(new Date(lic.submitted_at), 'dd MMM yyyy')}</p>
                                <div className="mt-1">{statusBadge(lic.status)}</div>
                              </div>
                              <div className="flex gap-1">
                                {lic.document_url && <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); s.setPreviewUrl(lic.document_url); }}><Eye size={12} /></Button>}
                              </div>
                            </div>
                            {lic.status === 'pending' && (
                              <div className="space-y-2 pt-2 border-t border-border/50">
                                <Textarea placeholder="Admin notes (optional)" value={s.licenseAdminNotes} onChange={(e) => s.setLicenseAdminNotes(e.target.value)} rows={2} className="text-xs" onClick={(e) => e.stopPropagation()} />
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" className="text-destructive flex-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); s.updateLicenseStatus(lic.id, 'rejected'); }}><X size={12} className="mr-1" /> Reject</Button>
                                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); s.updateLicenseStatus(lic.id, 'approved'); }}><Check size={12} className="mr-1" /> Approve</Button>
                                </div>
                              </div>
                            )}
                            {lic.admin_notes && lic.status !== 'pending' && <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">Note: {lic.admin_notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Products */}
                    {seller.products.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Package size={12} /> Products ({seller.products.length})</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {seller.products.slice(0, 6).map((prod) => (
                            <div key={prod.id} className="flex items-center gap-2 bg-muted rounded-lg p-2">
                              {prod.image_url ? <img src={prod.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" /> : <div className="w-8 h-8 rounded bg-background flex items-center justify-center shrink-0"><Package size={12} className="text-muted-foreground" /></div>}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{prod.name}</p>
                                <div className="flex items-center gap-1">
                                  {prod.price > 0 && <span className="text-[10px] text-primary font-semibold">{s.formatPrice(prod.price)}</span>}
                                  <Badge variant="outline" className="text-[8px] px-1 py-0">{prod.category.replace(/_/g, ' ')}</Badge>
                                </div>
                              </div>
                              {statusBadge(prod.approval_status)}
                            </div>
                          ))}
                          {seller.products.length > 6 && <p className="text-[10px] text-muted-foreground text-center">+{seller.products.length - 6} more products</p>}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {isPending && (
                      <div className="pt-2 border-t space-y-2">
                        {s.rejectingId === seller.id ? (
                          <div className="space-y-2">
                            <Textarea placeholder="Rejection reason (will be shared with seller)..." value={s.rejectionNote} onChange={(e) => s.setRejectionNote(e.target.value)} rows={2} />
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => { s.setRejectingId(null); s.setRejectionNote(''); }}>Cancel</Button>
                              <Button size="sm" variant="destructive" className="flex-1" disabled={s.actionId === seller.id} onClick={() => s.updateSellerStatus(seller, 'rejected')}>
                                {s.actionId === seller.id && <Loader2 size={14} className="animate-spin mr-1" />}Confirm Reject
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-destructive flex-1" onClick={() => s.setRejectingId(seller.id)} disabled={!!s.actionId}><X size={14} className="mr-1" /> Reject Seller</Button>
                            <Button size="sm" className="flex-1" onClick={() => s.updateSellerStatus(seller, 'approved')} disabled={!!s.actionId}>
                              {s.actionId === seller.id && <Loader2 size={14} className="animate-spin mr-1" />}<Check size={14} className="mr-1" /> Approve Seller
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Document Preview Dialog */}
      <Dialog open={!!s.previewUrl} onOpenChange={() => s.setPreviewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>License Document</DialogTitle></DialogHeader>
          {s.previewUrl && (
            s.previewUrl.match(/\.(jpg|jpeg|png|webp)$/i)
              ? <img src={s.previewUrl} alt="License" className="w-full rounded-lg" />
              : <div className="text-center py-8"><FileText size={48} className="mx-auto text-muted-foreground mb-4" /><a href={s.previewUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open Document</a></div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Group License Config Dialog */}
      <Dialog open={!!s.editingGroup} onOpenChange={() => s.setEditingGroup(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configure License for {s.editingGroup?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">License Type Name</label>
              <Input placeholder="e.g., FSSAI Certificate" value={s.editForm.license_type_name} onChange={(e) => s.setEditForm({ ...s.editForm, license_type_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description for Sellers</label>
              <Textarea placeholder="Instructions for sellers..." value={s.editForm.license_description} onChange={(e) => s.setEditForm({ ...s.editForm, license_description: e.target.value })} rows={3} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => s.setEditingGroup(null)}>Cancel</Button>
              <Button className="flex-1" onClick={s.saveGroupConfig}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
