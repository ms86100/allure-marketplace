// @ts-nocheck
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { VegBadge } from '@/components/ui/veg-badge';
import { ProductImageUpload } from '@/components/ui/product-image-upload';
import { ProductCategory, ProductActionType } from '@/types/database';
import { ArrowLeft, Loader2, Star, Award, Bell, AlertTriangle, Package, Image, Tag, Settings2, Eye, BarChart3, Layers, Wrench } from 'lucide-react';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { AttributeBlockBuilder } from '@/components/seller/AttributeBlockBuilder';
import { useSellerProducts } from '@/hooks/useSellerProducts';
import { ProductFormPreviewPanel, ProductFormPreviewMobile } from '@/components/seller/ProductFormPreview';
import { ServiceFieldsSection } from '@/components/seller/ServiceFieldsSection';
import { useCurrency } from '@/hooks/useCurrency';
import { supabase } from '@/integrations/supabase/client';

function FormSection({ icon: Icon, title, description, children }: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/30">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

export default function SellerProductFormPage() {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId?: string }>();
  const isEditing = !!productId;
  const sp = useSellerProducts();
  const { formatPrice, currencySymbol } = useCurrency();

  // Load product data for editing
  useEffect(() => {
    if (isEditing && sp.products.length > 0 && !sp.editingProduct) {
      const product = sp.products.find(p => p.id === productId);
      if (product) {
        sp.openEditDialog(product);
      }
    }
  }, [isEditing, productId, sp.products.length]);

  // Set default category for new products
  useEffect(() => {
    if (!isEditing && sp.allowedCategories.length > 0 && !sp.formData.category) {
      sp.setFormData({ ...sp.formData, category: sp.allowedCategories[0].category as ProductCategory });
    }
  }, [isEditing, sp.allowedCategories.length]);

  const handleSaveAndGoBack = async () => {
    sp.handleSave();
  };

  // Navigate back after successful save (handleSave sets isDialogOpen=false on success)
  useEffect(() => {
    if (!sp.isLoading && sp.editingProduct === null && !sp.isSaving && !sp.isDialogOpen && isEditing) {
      // Only navigate if we were editing and form was reset (save succeeded)
    }
  }, [sp.isDialogOpen]);

  // Watch for successful save: handleSave closes dialog on success
  const prevDialogOpen = useRef(sp.isDialogOpen);
  useEffect(() => {
    if (prevDialogOpen.current && !sp.isDialogOpen && !sp.isSaving) {
      // Dialog was just closed by handleSave → save succeeded
      navigate('/seller/products');
    }
    prevDialogOpen.current = sp.isDialogOpen;
  }, [sp.isDialogOpen, sp.isSaving]);

  if (sp.isLoading) {
    return (
      <AppLayout showHeader={false}>
        <div className="p-4">
          <Skeleton className="h-8 w-48 mb-6" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl mb-4" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showHeader={false}>
      <div className="max-w-4xl mx-auto p-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => { sp.resetForm(); navigate('/seller/products'); }}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0 hover:bg-muted/80 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold">{isEditing ? 'Edit Product' : 'Add New Product'}</h1>
            {sp.sellerProfile && (
              <p className="text-xs text-muted-foreground">
                {sp.sellerProfile.business_name}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-6">
          {/* Form sections */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Section 1: Basics */}
            <FormSection icon={Package} title="Product Basics" description="Name, image, and description">
              <div id="edit-prod-image_url">
                <Label className="text-sm font-semibold">Product Image *</Label>
                {sp.user && (
                  <div className={`mt-1.5 ${sp.fieldErrors.image_url ? 'rounded-md ring-2 ring-destructive' : ''}`}>
                    <ProductImageUpload
                      value={sp.formData.image_url}
                      onChange={(url) => {
                        sp.setFormData({ ...sp.formData, image_url: url });
                        if (sp.fieldErrors.image_url) sp.setFieldErrors((prev) => { const { image_url, ...rest } = prev; return rest; });
                      }}
                      userId={sp.user.id}
                      productName={sp.formData.name}
                      categoryName={sp.activeCategoryConfig?.displayName || sp.formData.category || undefined}
                      description={sp.formData.description || undefined}
                    />
                  </div>
                )}
                {sp.fieldErrors.image_url && <p className="text-xs text-destructive mt-1">{sp.fieldErrors.image_url}</p>}
              </div>

              <div id="edit-prod-name">
                <Label className="text-sm font-semibold">Product Name *</Label>
                <Input
                  placeholder={sp.activeCategoryConfig?.formHints.namePlaceholder || "e.g., Product Name"}
                  value={sp.formData.name}
                  onChange={(e) => {
                    sp.setFormData({ ...sp.formData, name: e.target.value });
                    if (sp.fieldErrors.name) sp.setFieldErrors((prev) => { const { name, ...rest } = prev; return rest; });
                  }}
                  className={`mt-1.5 ${sp.fieldErrors.name ? 'border-destructive' : ''}`}
                />
                {sp.fieldErrors.name && <p className="text-xs text-destructive mt-1">{sp.fieldErrors.name}</p>}
              </div>

              <div>
                <Label className="text-sm font-semibold">Description</Label>
                <Textarea
                  placeholder={sp.activeCategoryConfig?.formHints.descriptionPlaceholder || "Describe your product..."}
                  value={sp.formData.description}
                  onChange={(e) => sp.setFormData({ ...sp.formData, description: e.target.value })}
                  rows={3}
                  maxLength={300}
                  className="mt-1.5"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-1">{(sp.formData.description || '').length}/300</p>
              </div>

              {/* Category */}
              {sp.allowedCategories.length > 1 ? (
                <div>
                  <Label className="text-sm font-semibold">Category *</Label>
                  <Select
                    value={sp.formData.category}
                    onValueChange={(value) => {
                      sp.setFormData({ ...sp.formData, category: value as ProductCategory, subcategory_id: '' });
                      sp.setAttributeBlocks([]);
                    }}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {sp.allowedCategories.map((config) => (
                        <SelectItem key={config.category} value={config.category}>
                          <span className="flex items-center gap-1.5"><DynamicIcon name={config.icon} size={14} /> {config.displayName}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : sp.allowedCategories.length === 1 ? (
                <div>
                  <Label className="text-sm font-semibold">Category</Label>
                  <div className="flex items-center gap-2 p-2.5 bg-muted rounded-xl text-sm mt-1.5">
                    <DynamicIcon name={sp.allowedCategories[0].icon} size={16} />
                    <span>{sp.allowedCategories[0].displayName}</span>
                  </div>
                </div>
              ) : null}

              {sp.subcategories.length > 0 && (
                <div>
                  <Label className="text-sm font-semibold">Subcategory</Label>
                  <Select value={sp.formData.subcategory_id || 'none'} onValueChange={(v) => sp.setFormData({ ...sp.formData, subcategory_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select subcategory (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {sp.subcategories.map(sub => (
                        <SelectItem key={sub.id} value={sub.id}>
                          <span className="inline-flex items-center gap-1.5"><DynamicIcon name={sub.icon || 'FolderOpen'} size={14} /> {sub.display_name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </FormSection>

            {/* Section 2: Pricing */}
            <FormSection icon={Tag} title="Pricing" description="Set your selling price and MRP">
              <div className="grid grid-cols-2 gap-4">
                <div id="edit-prod-price">
                  <Label className="text-sm font-semibold">{sp.activeCategoryConfig?.formHints.priceLabel || 'Price'} ({currencySymbol}) *</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={sp.formData.price}
                    onChange={(e) => {
                      sp.setFormData({ ...sp.formData, price: e.target.value });
                      if (sp.fieldErrors.price) sp.setFieldErrors((prev) => { const { price, ...rest } = prev; return rest; });
                    }}
                    className={`mt-1.5 ${sp.fieldErrors.price ? 'border-destructive' : ''}`}
                  />
                  {sp.fieldErrors.price && <p className="text-xs text-destructive mt-1">{sp.fieldErrors.price}</p>}
                </div>
                <div>
                  <Label className="text-sm font-semibold">MRP ({currencySymbol})</Label>
                  <Input
                    type="number"
                    placeholder="Original price"
                    value={sp.formData.mrp}
                    onChange={(e) => sp.setFormData({ ...sp.formData, mrp: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>
              {sp.formData.mrp && sp.formData.price && parseFloat(sp.formData.mrp) > parseFloat(sp.formData.price) && (
                <p className="text-sm text-green-600 font-semibold">
                  🎉 {Math.round(((parseFloat(sp.formData.mrp) - parseFloat(sp.formData.price)) / parseFloat(sp.formData.mrp)) * 100)}% OFF
                </p>
              )}
            </FormSection>

            {/* Section 3: Configuration */}
            <FormSection icon={Settings2} title="Configuration" description="Action type, timing, and options">
              {sp.activeCategoryConfig && (sp.activeCategoryConfig.behavior?.enquiryOnly || sp.formData.action_type !== 'add_to_cart') && (
                <div>
                  <Label className="text-sm font-semibold">Action Type</Label>
                  <Select value={sp.formData.action_type} onValueChange={(v) => sp.setFormData({ ...sp.formData, action_type: v as ProductActionType })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
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
                <div id="edit-prod-contact_phone">
                  <Label className="text-sm font-semibold">Contact Phone *</Label>
                  <Input
                    placeholder="e.g., +91 98765 43210"
                    value={sp.formData.contact_phone}
                    onChange={(e) => {
                      sp.setFormData({ ...sp.formData, contact_phone: e.target.value });
                      if (sp.fieldErrors.contact_phone) sp.setFieldErrors((prev) => { const { contact_phone, ...rest } = prev; return rest; });
                    }}
                    className={`mt-1.5 ${sp.fieldErrors.contact_phone ? 'border-destructive' : ''}`}
                  />
                  {sp.fieldErrors.contact_phone && <p className="text-xs text-destructive mt-1">{sp.fieldErrors.contact_phone}</p>}
                </div>
              )}

              {sp.showVegToggle && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <VegBadge isVeg={sp.formData.is_veg} />
                    <span className="text-sm font-medium">{sp.formData.is_veg ? 'Vegetarian' : 'Non-Vegetarian'}</span>
                  </div>
                  <Switch checked={sp.formData.is_veg} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_veg: checked })} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {sp.showDurationField && (
                  <div>
                    <Label className="text-sm font-semibold">{sp.activeCategoryConfig?.formHints.durationLabel || 'Prep Time (min)'}</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 30"
                      value={sp.formData.prep_time_minutes}
                      onChange={(e) => sp.setFormData({ ...sp.formData, prep_time_minutes: e.target.value })}
                      className="mt-1.5"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Time to prepare once ordered</p>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-semibold">Order Lead Time (hours)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 2"
                    value={sp.formData.lead_time_hours}
                    onChange={(e) => sp.setFormData({ ...sp.formData, lead_time_hours: e.target.value })}
                    className="mt-1.5"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Minimum advance notice buyers need</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div>
                  <span className="text-sm font-medium block">Accept Pre-orders</span>
                  <span className="text-xs text-muted-foreground">Allow buyers to order for future dates</span>
                </div>
                <Switch checked={sp.formData.accepts_preorders} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, accepts_preorders: checked })} />
              </div>
            </FormSection>

            {/* Section 4: Visibility & Stock */}
            <FormSection icon={Eye} title="Visibility & Stock" description="Badges, alerts, and inventory">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div className="flex items-center gap-2">
                  <Star size={16} className="text-amber-500" />
                  <div>
                    <span className="text-sm font-medium block">Bestseller</span>
                    <span className="text-xs text-muted-foreground">Highlight as a bestselling item</span>
                  </div>
                </div>
                <Switch checked={sp.formData.is_bestseller} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_bestseller: checked })} />
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-emerald-500" />
                  <div>
                    <span className="text-sm font-medium block">Recommended</span>
                    <span className="text-xs text-muted-foreground">Show as a recommended product</span>
                  </div>
                </div>
                <Switch checked={sp.formData.is_recommended} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_recommended: checked })} />
              </div>

              <div className="flex items-center justify-between p-3 border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-amber-500" />
                  <div>
                    <span className="text-sm font-medium block">Urgent Order Alert</span>
                    <span className="text-xs text-muted-foreground">3-min timer, auto-cancel if not responded</span>
                  </div>
                </div>
                <Switch checked={sp.formData.is_urgent} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_urgent: checked })} />
              </div>

              <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">📦 Stock Management</p>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium block">Track Stock Quantity</span>
                    <span className="text-xs text-muted-foreground">Auto-marks unavailable when stock hits zero</span>
                  </div>
                  <Switch
                    checked={sp.formData.stock_quantity !== ''}
                    onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, stock_quantity: checked ? '10' : '' })}
                  />
                </div>
                {sp.formData.stock_quantity !== '' && (
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                    <div>
                      <Label className="text-xs">Current Stock</Label>
                      <Input
                        type="number"
                        min="0"
                        value={sp.formData.stock_quantity}
                        onChange={(e) => sp.setFormData({ ...sp.formData, stock_quantity: e.target.value })}
                        className="mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Units available right now</p>
                    </div>
                    <div>
                      <Label className="text-xs">Low Stock Alert</Label>
                      <Input
                        type="number"
                        min="1"
                        value={sp.formData.low_stock_threshold}
                        onChange={(e) => sp.setFormData({ ...sp.formData, low_stock_threshold: e.target.value })}
                        className="mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Alert below this level</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <span className="text-sm font-medium">Available for order</span>
                <Switch checked={sp.formData.is_available} onCheckedChange={(checked) => sp.setFormData({ ...sp.formData, is_available: checked })} />
              </div>
            </FormSection>

            {/* Section 5: Attributes */}
            <FormSection icon={Layers} title="Product Attributes" description="Additional details like size, flavor, etc.">
              <AttributeBlockBuilder
                category={sp.formData.category || null}
                value={sp.attributeBlocks}
                onChange={sp.setAttributeBlocks}
              />
            </FormSection>

            {/* Section 6: Service Config (conditional) */}
            {sp.isCurrentCategoryService && (
              <FormSection icon={Wrench} title="Service Configuration" description="Booking and scheduling settings">
                <ServiceFieldsSection data={sp.serviceFields} onChange={sp.setServiceFields} />
              </FormSection>
            )}

            {/* Mobile Preview */}
            <ProductFormPreviewMobile formData={sp.formData} sellerProfile={sp.sellerProfile} attributeBlocks={sp.attributeBlocks} />
          </div>

          {/* Desktop Preview Panel */}
          <ProductFormPreviewPanel formData={sp.formData} sellerProfile={sp.sellerProfile} attributeBlocks={sp.attributeBlocks} />
        </div>

        {/* Sticky bottom save bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 z-50">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <Button
              variant="outline"
              onClick={() => { sp.resetForm(); navigate('/seller/products'); }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAndGoBack}
              disabled={sp.isSaving}
              className="rounded-xl px-8 font-semibold"
            >
              {sp.isSaving && <Loader2 className="animate-spin mr-2" size={16} />}
              {isEditing ? 'Save Changes' : 'Add Product'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
