import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { VegBadge } from '@/components/ui/veg-badge';
import { Badge } from '@/components/ui/badge';
import { ProductImageUpload } from '@/components/ui/product-image-upload';
import { ProductActionType, ProductCategory } from '@/types/database';
import { SellerSwitcher } from '@/components/seller/SellerSwitcher';
import { ArrowLeft, Plus, Edit, Trash2, Loader2, Star, Award, Bell, AlertTriangle, Store, ShieldAlert, Upload, Send, CheckCircle2, Clock, XCircle, FileText, X, Eye } from 'lucide-react';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { toast } from 'sonner';
import { BulkProductUpload } from '@/components/seller/BulkProductUpload';
import { useCurrency } from '@/hooks/useCurrency';
import { AttributeBlockBuilder } from '@/components/seller/AttributeBlockBuilder';
import { useSellerProducts } from '@/hooks/useSellerProducts';
import { ProductFormPreviewPanel, ProductFormPreviewMobile } from '@/components/seller/ProductFormPreview';
import { ServiceFieldsSection } from '@/components/seller/ServiceFieldsSection';

export default function SellerProductsPage() {
  const sp = useSellerProducts();
  const { formatPrice, currencySymbol } = useCurrency();
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});

  // Fetch 7-day view counts
  useEffect(() => {
    if (!sp.sellerProfile?.id || sp.products.length === 0) return;
    const productIds = sp.products.map(p => p.id);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('product_views' as any)
      .select('product_id')
      .in('product_id', productIds)
      .gte('viewed_at', sevenDaysAgo)
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        (data as any[]).forEach(row => { counts[row.product_id] = (counts[row.product_id] || 0) + 1; });
        setViewCounts(counts);
      });
  }, [sp.sellerProfile?.id, sp.products.length]);
  if (sp.isLoading) {
    return <AppLayout showHeader={false}><div className="p-4"><Skeleton className="h-8 w-32 mb-4" /><Skeleton className="h-12 w-full mb-4" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl mb-3" />)}</div></AppLayout>;
  }

  return (
    <AppLayout showHeader={false}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <Link to="/seller" className="flex items-center gap-2 text-muted-foreground"><span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0"><ArrowLeft size={18} /></span><span>Back</span></Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => sp.setIsBulkOpen(true)}><Upload size={16} className="mr-1" />Bulk Add</Button>
            <Dialog open={sp.isDialogOpen} onOpenChange={(open) => { sp.setIsDialogOpen(open); if (!open) sp.resetForm(); }}>
              <DialogTrigger asChild><Button><Plus size={16} className="mr-1" />Add Product</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl lg:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>{sp.editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                  {sp.sellerProfile && <div className="flex items-center gap-2 mt-2 p-2 bg-primary/5 border border-primary/20 rounded-lg"><Store size={14} className="text-primary" /><span className="text-xs text-primary font-medium">Adding to: {sp.sellerProfile.business_name}</span></div>}
                </DialogHeader>
                <div className="flex gap-6 mt-4">
                  <div className="space-y-4 flex-1 min-w-0">
                    <div className="space-y-2" id="edit-prod-image_url"><Label>Product Image</Label>{sp.user && <div className={sp.fieldErrors.image_url ? 'rounded-md ring-2 ring-destructive' : ''}><ProductImageUpload value={sp.formData.image_url} onChange={(url) => { sp.setFormData({ ...sp.formData, image_url: url }); if (sp.fieldErrors.image_url) sp.setFieldErrors((prev: Record<string, string>) => { const { image_url, ...rest } = prev; return rest; }); }} userId={sp.user.id} productName={sp.formData.name} categoryName={sp.activeCategoryConfig?.displayName || sp.formData.category || undefined} description={sp.formData.description || undefined} /></div>}{sp.fieldErrors.image_url && <p className="text-xs text-destructive">{sp.fieldErrors.image_url}</p>}</div>
                    <div className="space-y-2" id="edit-prod-name"><Label htmlFor="name">Product Name *</Label><Input id="name" placeholder={sp.activeCategoryConfig?.formHints.namePlaceholder || "e.g., Product Name"} value={sp.formData.name} onChange={(e) => { sp.setFormData({ ...sp.formData, name: e.target.value }); if (sp.fieldErrors.name) sp.setFieldErrors((prev: Record<string, string>) => { const { name, ...rest } = prev; return rest; }); }} className={sp.fieldErrors.name ? 'border-destructive' : ''} />{sp.fieldErrors.name && <p className="text-xs text-destructive">{sp.fieldErrors.name}</p>}</div>
                    <div className="space-y-2"><Label htmlFor="description">Description</Label><Textarea id="description" placeholder={sp.activeCategoryConfig?.formHints.descriptionPlaceholder || "Describe your product..."} value={sp.formData.description} onChange={(e) => sp.setFormData({ ...sp.formData, description: e.target.value })} rows={2} maxLength={300} /><p className="text-[10px] text-muted-foreground text-right">{(sp.formData.description || '').length}/300</p></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2" id="edit-prod-price"><Label htmlFor="price">{sp.activeCategoryConfig?.formHints.priceLabel || 'Price'} ({currencySymbol}) *</Label><Input id="price" type="number" placeholder="0" value={sp.formData.price} onChange={(e) => { sp.setFormData({ ...sp.formData, price: e.target.value }); if (sp.fieldErrors.price) sp.setFieldErrors((prev: Record<string, string>) => { const { price, ...rest } = prev; return rest; }); }} className={sp.fieldErrors.price ? 'border-destructive' : ''} />{sp.fieldErrors.price && <p className="text-xs text-destructive">{sp.fieldErrors.price}</p>}</div>
                      <div className="space-y-2"><Label htmlFor="mrp">MRP ({currencySymbol})</Label><Input id="mrp" type="number" placeholder="Original price" value={sp.formData.mrp} onChange={(e) => sp.setFormData({ ...sp.formData, mrp: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">{sp.formData.mrp && sp.formData.price && parseFloat(sp.formData.mrp) > parseFloat(sp.formData.price) && <p className="text-[10px] text-success font-medium">{Math.round(((parseFloat(sp.formData.mrp) - parseFloat(sp.formData.price)) / parseFloat(sp.formData.mrp)) * 100)}% OFF</p>}</div>
                      {sp.showDurationField && <div className="space-y-2"><Label htmlFor="prep_time">{sp.activeCategoryConfig?.formHints.durationLabel || 'Prep Time (min)'}</Label><Input id="prep_time" type="number" placeholder="e.g. 30" value={sp.formData.prep_time_minutes} onChange={(e) => sp.setFormData({ ...sp.formData, prep_time_minutes: e.target.value })} /><p className="text-[10px] text-muted-foreground">How long it takes to prepare once ordered</p></div>}
                      {sp.allowedCategories.length > 1 ? <div className="space-y-2"><Label htmlFor="category">Category *</Label><Select value={sp.formData.category} onValueChange={(value) => { sp.setFormData({ ...sp.formData, category: value as ProductCategory, subcategory_id: '' }); sp.setAttributeBlocks([]); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{sp.allowedCategories.map((config) => <SelectItem key={config.category} value={config.category}><span className="flex items-center gap-1.5"><DynamicIcon name={config.icon} size={14} /> {config.displayName}</span></SelectItem>)}</SelectContent></Select></div> : sp.allowedCategories.length === 1 ? <div className="space-y-2"><Label>Category</Label><div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm"><DynamicIcon name={sp.allowedCategories[0].icon} size={16} /><span>{sp.allowedCategories[0].displayName}</span></div></div> : null}
                    </div>
                    {sp.subcategories.length > 0 && <div className="space-y-2"><Label>Subcategory</Label><Select value={sp.formData.subcategory_id || 'none'} onValueChange={(v) => sp.setFormData({ ...sp.formData, subcategory_id: v === 'none' ? '' : v })}><SelectTrigger><SelectValue placeholder="Select subcategory (optional)" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{sp.subcategories.map(sub => <SelectItem key={sub.id} value={sub.id}><span className="inline-flex items-center gap-1.5"><DynamicIcon name={sub.icon || 'FolderOpen'} size={14} /> {sub.display_name}</span></SelectItem>)}</SelectContent></Select></div>}
                    {/* Bug 2 & 5: Action type selector + contact phone */}
                    {sp.activeCategoryConfig && (sp.activeCategoryConfig.behavior?.enquiryOnly || sp.formData.action_type !== 'add_to_cart') && (
                      <div className="space-y-2">
                        <Label>Action Type</Label>
                        <Select value={sp.formData.action_type} onValueChange={(v) => sp.setFormData({ ...sp.formData, action_type: v as ProductActionType })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="add_to_cart">Add to Cart</SelectItem>
                            <SelectItem value="contact_seller">Contact Seller</SelectItem>
                            <SelectItem value="request_quote">Request Quote</SelectItem>
                            <SelectItem value="make_offer">Make Offer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {sp.formData.action_type === 'contact_seller' && (
                      <div className="space-y-2" id="edit-prod-contact_phone">
                        <Label>Contact Phone *</Label>
                        <Input placeholder="e.g., +91 98765 43210" value={sp.formData.contact_phone} onChange={(e) => { sp.setFormData({ ...sp.formData, contact_phone: e.target.value }); if (sp.fieldErrors.contact_phone) sp.setFieldErrors((prev: Record<string, string>) => { const { contact_phone, ...rest } = prev; return rest; }); }} className={sp.fieldErrors.contact_phone ? 'border-destructive' : ''} />
                        {sp.fieldErrors.contact_phone && <p className="text-xs text-destructive">{sp.fieldErrors.contact_phone}</p>}
                      </div>
                    )}
                    <div className="p-3 bg-muted rounded-lg space-y-3"><p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">⏱ Preparation & Ordering</p><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-xs">Order Lead Time (hours)</Label><Input type="number" min="0" placeholder="e.g. 2" value={sp.formData.lead_time_hours} onChange={(e) => sp.setFormData({ ...sp.formData, lead_time_hours: e.target.value })} /><p className="text-[10px] text-muted-foreground">Minimum advance notice buyers need to place an order</p></div></div><div className="flex items-center justify-between pt-2 border-t"><div><span className="text-sm font-medium block">Accept Pre-orders</span><span className="text-xs text-muted-foreground">Allow buyers to order for future dates</span></div><Switch checked={sp.formData.accepts_preorders} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, accepts_preorders: checked })} /></div></div>
                    {sp.showVegToggle && <div className="flex items-center justify-between p-3 bg-muted rounded-lg"><div className="flex items-center gap-2"><VegBadge isVeg={sp.formData.is_veg} /><span className="text-sm font-medium">{sp.formData.is_veg ? 'Vegetarian' : 'Non-Vegetarian'}</span></div><Switch checked={sp.formData.is_veg} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_veg: checked })} /></div>}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg"><div className="flex items-center gap-2"><Star size={16} className="text-warning" /><span className="text-sm font-medium">Mark as Bestseller</span></div><Switch checked={sp.formData.is_bestseller} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_bestseller: checked })} /></div>
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg"><div className="flex items-center gap-2"><Award size={16} className="text-success" /><span className="text-sm font-medium">Recommended</span></div><Switch checked={sp.formData.is_recommended} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_recommended: checked })} /></div>
                    <div className="flex items-center justify-between p-3 bg-warning/10 border border-warning/30 rounded-lg"><div className="flex items-center gap-2"><Bell size={16} className="text-warning" /><div><span className="text-sm font-medium block">Urgent Order Alert</span><span className="text-xs text-muted-foreground">3-min timer, auto-cancel if not responded</span></div></div><Switch checked={sp.formData.is_urgent} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_urgent: checked })} /></div>
                    <div className="p-3 bg-muted rounded-lg space-y-3"><div className="flex items-center justify-between"><div><span className="text-sm font-medium block">Track Stock Quantity</span><span className="text-xs text-muted-foreground">Auto-marks unavailable when stock hits zero</span></div><Switch checked={sp.formData.stock_quantity !== ''} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, stock_quantity: checked ? '10' : '' })} /></div>{sp.formData.stock_quantity !== '' && <div className="grid grid-cols-2 gap-3 pt-2 border-t"><div className="space-y-1"><Label className="text-xs">Current Stock</Label><Input type="number" min="0" value={sp.formData.stock_quantity} onChange={(e) => sp.setFormData({ ...sp.formData, stock_quantity: e.target.value })} /></div><div className="space-y-1"><Label className="text-xs">Low Stock Alert</Label><Input type="number" min="1" value={sp.formData.low_stock_threshold} onChange={(e) => sp.setFormData({ ...sp.formData, low_stock_threshold: e.target.value })} /></div></div>}</div>
                    <AttributeBlockBuilder category={sp.formData.category || null} value={sp.attributeBlocks} onChange={sp.setAttributeBlocks} />
                    {/* Bug 1: Service config section */}
                    {sp.isCurrentCategoryService && (
                      <ServiceFieldsSection data={sp.serviceFields} onChange={sp.setServiceFields} />
                    )}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg"><span className="text-sm font-medium">Available for order</span><Switch checked={sp.formData.is_available} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_available: checked })} /></div>
                    <Button className="w-full" onClick={sp.handleSave} disabled={sp.isSaving}>{sp.isSaving && <Loader2 className="animate-spin mr-2" size={18} />}{sp.editingProduct ? 'Save Changes' : 'Add Product'}</Button>
                  </div>
                  <ProductFormPreviewPanel formData={sp.formData} sellerProfile={sp.sellerProfile} attributeBlocks={sp.attributeBlocks} />
                </div>
                <ProductFormPreviewMobile formData={sp.formData} sellerProfile={sp.sellerProfile} attributeBlocks={sp.attributeBlocks} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {sp.sellerProfile && <BulkProductUpload isOpen={sp.isBulkOpen} onClose={() => sp.setIsBulkOpen(false)} sellerId={sp.sellerProfile.id} allowedCategories={sp.allowedCategories} onSuccess={() => sp.sellerProfile && sp.fetchData(sp.sellerProfile.id)} />}

        {sp.sellerProfile && (
          <div className="mb-4 p-3 bg-card rounded-xl shadow-sm border"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Store size={18} className="text-primary" /></div><div><h2 className="font-semibold text-sm">{sp.sellerProfile.business_name}</h2><p className="text-xs text-muted-foreground capitalize">{sp.primaryGroup?.replace('_', ' ')} • {sp.products.length} products</p></div></div>{sp.sellerProfiles.length > 1 && <SellerSwitcher />}</div></div>
        )}

        {sp.licenseBlocked?.blocked && (
          <div className={`mb-4 p-3 rounded-xl border flex items-start gap-3 ${sp.licenseBlocked.status === 'rejected' ? 'bg-destructive/10 border-destructive/30' : 'bg-warning/10 border-warning/30'}`}>
            <ShieldAlert size={20} className={sp.licenseBlocked.status === 'rejected' ? 'text-destructive mt-0.5' : 'text-warning mt-0.5'} />
            <div><p className={`text-sm font-semibold ${sp.licenseBlocked.status === 'rejected' ? 'text-destructive' : 'text-warning'}`}>{sp.licenseBlocked.status === 'rejected' ? `${sp.licenseBlocked.licenseName} Rejected` : sp.licenseBlocked.status === 'pending' ? `${sp.licenseBlocked.licenseName} Pending Verification` : `${sp.licenseBlocked.licenseName} Required`}</p><p className="text-xs text-muted-foreground mt-0.5">{sp.licenseBlocked.status === 'rejected' ? 'Your license was rejected. Please re-upload from Seller Settings.' : sp.licenseBlocked.status === 'pending' ? 'Your license is being reviewed.' : 'You need to upload your license from Seller Settings.'}</p></div>
          </div>
        )}

        {/* Draft recovery banner */}
        {sp.draftRestored && sp.isDialogOpen && sp.formData.name.trim() !== '' && (
          <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              <div>
                <p className="text-sm font-medium">Unsaved draft recovered</p>
                <p className="text-xs text-muted-foreground">Your previous work has been restored</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => { sp.resetForm(); sp.setIsDialogOpen(false); }}>
              <X size={14} className="mr-1" /> Discard
            </Button>
          </div>
        )}

        <h1 className="text-xl font-bold mb-4">Your Products ({sp.products.length})</h1>

        {sp.products.some(p => (p as any).approval_status === 'draft') && (
          <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between">
            <div><p className="text-sm font-medium">{sp.products.filter(p => (p as any).approval_status === 'draft').length} draft product(s) ready</p><p className="text-xs text-muted-foreground">Submit for admin review to make them visible to buyers</p></div>
            <Button size="sm" onClick={async () => { const allDrafts = sp.products.filter(p => (p as any).approval_status === 'draft'); const readyDrafts = allDrafts.filter(p => p.image_url); const skipped = allDrafts.length - readyDrafts.length; if (readyDrafts.length === 0) { toast.error('All drafts are missing images. Add images before submitting.'); return; } const draftIds = readyDrafts.map(p => p.id); const { error } = await supabase.from('products').update({ approval_status: 'pending' } as any).in('id', draftIds); if (error) { toast.error('Failed to submit'); return; } toast.success(`${draftIds.length} product(s) submitted for approval`); if (skipped > 0) toast.warning(`${skipped} draft(s) skipped — add images first`); if (sp.sellerProfile) sp.fetchData(sp.sellerProfile.id); }}><Send size={14} className="mr-1" />Submit All for Approval</Button>
          </div>
        )}

        {sp.products.length > 0 ? (
          <div className="space-y-3">
            {sp.products.map((product) => {
              const approvalStatus = (product as any).approval_status || 'approved';
              const showPendingHint = approvalStatus === 'pending';
              return (
                <div key={product.id} className={`bg-card rounded-xl p-4 shadow-sm transition-opacity ${!product.is_available ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 relative">
                      {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-muted flex items-center justify-center"><DynamicIcon name={sp.configs.find(c => c.category === product.category)?.icon || 'Package'} size={24} /></div>}
                      {!product.is_available && <div className="absolute inset-0 bg-background/70 flex items-center justify-center"><span className="text-[10px] font-medium text-destructive">Out of Stock</span></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        {(() => { const c = sp.configs.find(c => c.category === product.category); return (c?.formHints.showVegToggle ?? false) && <VegBadge isVeg={product.is_veg} size="sm" />; })()}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium truncate">{product.name}</h3>
                            {approvalStatus === 'draft' && <Badge variant="outline" className="text-[10px] px-1 gap-0.5 border-muted-foreground/30"><Clock size={10} /> Draft</Badge>}
                            {approvalStatus === 'pending' && <Badge className="bg-warning/20 text-warning-foreground text-[10px] px-1 gap-0.5"><Clock size={10} /> Pending</Badge>}
                            {approvalStatus === 'rejected' && <Badge variant="destructive" className="text-[10px] px-1 gap-0.5"><XCircle size={10} /> Rejected</Badge>}
                            {approvalStatus === 'rejected' && (product as any).rejection_note && (
                              <p className="w-full text-xs text-destructive mt-1 bg-destructive/10 rounded-lg px-2.5 py-1.5">
                                <span className="font-semibold">Reason:</span> {(product as any).rejection_note}
                              </p>
                            )}
                            {approvalStatus === 'approved' && <Badge className="bg-success/20 text-success text-[10px] px-1 gap-0.5"><CheckCircle2 size={10} /> Live</Badge>}
                            {product.is_bestseller && <Badge className="bg-warning/20 text-warning-foreground text-[10px] px-1"><Star size={10} className="mr-0.5 fill-warning text-warning" />Bestseller</Badge>}
                          </div>
                          <p className="text-sm font-semibold text-primary">{formatPrice(product.price)}</p>
                          {viewCounts[product.id] > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                              <Eye size={10} /> {viewCounts[product.id]} views this week
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => sp.openEditDialog(product)}><Edit size={14} className="mr-1" />Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => sp.setDeleteTarget(product)}><Trash2 size={14} /></Button>
                        {approvalStatus === 'draft' && <Button size="sm" variant="secondary" onClick={async () => { if (!product.image_url) { toast.error('Add an image before submitting for approval'); return; } const { error } = await supabase.from('products').update({ approval_status: 'pending' } as any).eq('id', product.id); if (error) { toast.error('Failed to submit'); return; } toast.success('Submitted for approval'); if (sp.sellerProfile) sp.fetchData(sp.sellerProfile.id); }}><Send size={14} className="mr-1" />Submit</Button>}
                        {showPendingHint && <span className="text-xs text-muted-foreground italic">Under review — edits are still allowed</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {approvalStatus === 'approved' ? (
                        <><Switch checked={product.is_available} onCheckedChange={() => sp.toggleAvailability(product)} /><span className="text-[10px] text-muted-foreground">{product.is_available ? 'In Stock' : 'Out'}</span></>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic px-1 text-center">Pending Review</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-muted rounded-xl"><p className="text-muted-foreground mb-4">No products yet</p><Button onClick={() => sp.setIsDialogOpen(true)}><Plus size={16} className="mr-1" />Add Your First Product</Button></div>
        )}
      </div>

      <AlertDialog open={!!sp.deleteTarget} onOpenChange={(open) => !open && sp.setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete "{sp.deleteTarget?.name}"?</AlertDialogTitle><AlertDialogDescription>This product will be permanently removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep Product</AlertDialogCancel><AlertDialogAction onClick={sp.confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
