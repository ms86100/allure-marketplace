import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { VegBadge } from '@/components/ui/veg-badge';
import { ProductImageUpload } from '@/components/ui/product-image-upload';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Trash2, Loader2, Package, Percent, CheckCircle2, Info, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { friendlyError } from '@/lib/utils';
import { AttributeBlockBuilder } from '@/components/seller/AttributeBlockBuilder';
import { type BlockData } from '@/hooks/useAttributeBlocks';
import { useCurrency } from '@/hooks/useCurrency';
import { ServiceFieldsSection, INITIAL_SERVICE_FIELDS, type ServiceFieldsData } from '@/components/seller/ServiceFieldsSection';
import { InlineAvailabilitySchedule, INITIAL_AVAILABILITY_SCHEDULE, type DayScheduleData } from '@/components/seller/InlineAvailabilitySchedule';
import { ProductFormPreviewPanel, ProductFormPreviewMobile } from '@/components/seller/ProductFormPreview';

interface DraftProduct {
  id?: string;
  name: string;
  price: number;
  mrp?: number | null;
  discount_percentage?: number | null;
  description: string;
  category: string;
  is_veg: boolean;
  image_url: string;
  prep_time_minutes?: number | null;
  stock_quantity?: number | null;
  low_stock_threshold?: number | null;
  action_type?: string;
}

interface DraftProductManagerProps {
  sellerId: string;
  categories: string[];
  products: DraftProduct[];
  onProductsChange: (products: DraftProduct[]) => void;
  beforePick?: () => void | Promise<void>;
}

function isServiceCategory(category: string, configs: any[]): boolean {
  if (!category) return false;
  const config = configs.find((c: any) => c.category === category);
  return config?.layoutType === 'service';
}

export function DraftProductManager({
  sellerId,
  categories,
  products,
  onProductsChange,
  beforePick,
}: DraftProductManagerProps) {
  const { user } = useAuth();
  const DRAFT_KEY = `draft-product-form-${sellerId}`;

  // Restore persisted draft from localStorage on mount
  const restoredDraft = useMemo(() => {
    try {
      // Try localStorage first, fall back to sessionStorage for migration
      const raw = localStorage.getItem(DRAFT_KEY) || sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        // Clean up legacy sessionStorage
        sessionStorage.removeItem(DRAFT_KEY);
        const parsed = JSON.parse(raw);
        // Validate editingIndex bounds
        if (parsed?.editingIndex != null && parsed.editingIndex >= products.length) {
          parsed.editingIndex = null; // out of bounds → treat as new
        }
        // Validate category
        if (parsed?.newProduct?.category && categories.length > 0 && !categories.includes(parsed.newProduct.category)) {
          parsed.newProduct.category = categories[0] || '';
        }
        return parsed;
      }
    } catch { /* ignore */ }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isAdding, setIsAdding] = useState(restoredDraft?.isAdding ?? false);
  const [editingIndex, setEditingIndex] = useState<number | null>(restoredDraft?.editingIndex ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [attributeBlocks, setAttributeBlocks] = useState<BlockData[]>(restoredDraft?.attributeBlocks ?? []);
  const [serviceFields, setServiceFields] = useState<ServiceFieldsData>(restoredDraft?.serviceFields ?? INITIAL_SERVICE_FIELDS);
  const [availabilitySchedule, setAvailabilitySchedule] = useState<DayScheduleData[]>(restoredDraft?.availabilitySchedule ?? INITIAL_AVAILABILITY_SCHEDULE);
  const { configs } = useCategoryConfigs();
  const { formatPrice, currencySymbol } = useCurrency();
  const [newProduct, setNewProduct] = useState<DraftProduct>(restoredDraft?.newProduct ?? {
    name: '',
    price: 0,
    mrp: null,
    discount_percentage: null,
    description: '',
    category: categories[0] || '',
    is_veg: true,
    image_url: '',
    prep_time_minutes: null,
  });

  // Auto-persist product form draft to localStorage with debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!isAdding) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          isAdding, editingIndex, newProduct, attributeBlocks, serviceFields, availabilitySchedule,
        }));
      } catch { /* quota exceeded — non-critical */ }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [isAdding, editingIndex, newProduct, attributeBlocks, serviceFields, availabilitySchedule, DRAFT_KEY]);

  // Get form hints for the selected category
  const activeConfig = useMemo(() => {
    return configs.find(c => c.category === newProduct.category) || null;
  }, [configs, newProduct.category]);

  const showVegToggle = activeConfig?.formHints.showVegToggle ?? false;
  const showDurationField = activeConfig?.formHints.showDurationField ?? false;
  const isService = useMemo(() => isServiceCategory(newProduct.category, configs), [newProduct.category, configs]);

  const supportsAddons = (activeConfig as any)?.supportsAddons ?? false;
  const supportsRecurring = (activeConfig as any)?.supportsRecurring ?? false;
  const supportsStaffAssignment = (activeConfig as any)?.supportsStaffAssignment ?? false;

  const requiresPrice = useMemo(() => {
    if (!activeConfig) return true;
    return activeConfig.behavior.supportsCart || !activeConfig.behavior.enquiryOnly;
  }, [activeConfig]);

  // Auto-compute discount when MRP or price changes
  const computedDiscount = useMemo(() => {
    if (newProduct.mrp && newProduct.mrp > 0 && newProduct.price > 0 && newProduct.mrp > newProduct.price) {
      return Math.round(((newProduct.mrp - newProduct.price) / newProduct.mrp) * 100);
    }
    return null;
  }, [newProduct.mrp, newProduct.price]);

  // Adapter: map DraftProduct → ProductFormData for preview components
  const previewFormData = useMemo(() => ({
    name: newProduct.name,
    description: newProduct.description,
    price: newProduct.price ? String(newProduct.price) : '',
    mrp: newProduct.mrp ? String(newProduct.mrp) : '',
    prep_time_minutes: newProduct.prep_time_minutes ? String(newProduct.prep_time_minutes) : '',
    category: (newProduct.category || '') as any,
    is_veg: newProduct.is_veg,
    is_available: true,
    is_bestseller: false,
    is_recommended: false,
    is_urgent: false,
    image_url: newProduct.image_url || null,
    action_type: (newProduct.action_type || 'add_to_cart') as any,
    contact_phone: '',
    stock_quantity: '',
    low_stock_threshold: '5',
    subcategory_id: '',
    lead_time_hours: '',
    accepts_preorders: false,
  }), [newProduct]);

  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) {
      toast.error('Product name is required');
      return;
    }
    if (requiresPrice && newProduct.price <= 0) {
      toast.error('Price must be greater than 0');
      return;
    }
    if (newProduct.mrp && newProduct.mrp > 0 && newProduct.price > newProduct.mrp) {
      toast.error('Price cannot be higher than MRP');
      return;
    }
    if (!newProduct.image_url.trim()) {
      toast.error('Product image is required. Please upload or generate an image.');
      return;
    }

    setIsSaving(true);
    const isEditing = editingIndex !== null;
    const existingId = isEditing ? products[editingIndex]?.id : undefined;

    try {
      const productPayload = {
        seller_id: sellerId,
        name: newProduct.name.trim(),
        price: newProduct.price || 0,
        mrp: newProduct.mrp && newProduct.mrp > 0 ? newProduct.mrp : null,
        description: newProduct.description.trim() || null,
        category: newProduct.category,
        is_veg: newProduct.is_veg,
        image_url: newProduct.image_url.trim() || null,
        is_available: false,
        approval_status: 'draft',
        prep_time_minutes: newProduct.prep_time_minutes || null,
        specifications: attributeBlocks.length > 0 ? { blocks: attributeBlocks } : null,
        stock_quantity: newProduct.stock_quantity && newProduct.stock_quantity > 0 ? newProduct.stock_quantity : null,
        low_stock_threshold: newProduct.low_stock_threshold && newProduct.low_stock_threshold > 0 ? newProduct.low_stock_threshold : null,
        action_type: newProduct.action_type || 'add_to_cart',
      };

      let savedProductId: string;

      if (isEditing && existingId) {
        // Update existing product
        const { data, error } = await supabase
          .from('products')
          .update(productPayload as any)
          .eq('id', existingId)
          .select()
          .single();
        if (error) throw error;
        savedProductId = data.id;
      } else {
        // Insert new product
        const { data, error } = await supabase
          .from('products')
          .insert(productPayload as any)
          .select()
          .single();
        if (error) throw error;
        savedProductId = data.id;
      }

      // Save service listing if service category
      if (isService && savedProductId) {
        const { error: slError } = await supabase.from('service_listings').upsert({
          product_id: savedProductId,
          service_type: serviceFields.service_type,
          location_type: serviceFields.location_type,
          duration_minutes: parseInt(serviceFields.duration_minutes) || 60,
          buffer_minutes: parseInt(serviceFields.buffer_minutes) || 0,
          max_bookings_per_slot: parseInt(serviceFields.max_bookings_per_slot) || 1,
          cancellation_notice_hours: parseInt(serviceFields.cancellation_notice_hours) || 24,
          rescheduling_notice_hours: parseInt(serviceFields.rescheduling_notice_hours) || 12,
        } as any, { onConflict: 'product_id' });

        if (slError) {
          console.error('Service listing upsert failed:', slError);
          toast.error('Product saved but service settings failed.');
        }

        // Save availability schedules
        const activeDays = availabilitySchedule.filter(d => d.is_active);
        if (activeDays.length > 0) {
          const scheduleRows = activeDays.map(d => ({
            seller_id: sellerId,
            product_id: savedProductId,
            day_of_week: d.day_of_week,
            start_time: d.start_time,
            end_time: d.end_time,
            is_active: true,
          }));

          const { error: schedErr } = await supabase
            .from('service_availability_schedules')
            .upsert(scheduleRows as any[], {
              onConflict: 'seller_id,product_id,day_of_week',
            });

          if (schedErr) {
            console.error('Availability schedule save failed:', schedErr);
          }
        }
      }

      if (isEditing) {
        const updated = [...products];
        updated[editingIndex] = { ...newProduct, id: savedProductId, discount_percentage: computedDiscount };
        onProductsChange(updated);
        toast.success('Product updated');
      } else {
        onProductsChange([...products, { ...newProduct, id: savedProductId, discount_percentage: computedDiscount }]);
        toast.success('Product added');
      }

      resetForm();
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast.error(friendlyError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveProduct = async (index: number) => {
    const product = products[index];
    if (product.id) {
      try {
        await supabase.from('products').delete().eq('id', product.id);
      } catch (e) {
        console.error('Error deleting product:', e);
      }
    }
    const updated = products.filter((_, i) => i !== index);
    onProductsChange(updated);
  };

  const handleEditProduct = async (index: number) => {
    const product = products[index];
    setNewProduct({ ...product });
    setEditingIndex(index);
    setIsAdding(true);

    // Load saved attribute blocks from DB
    if (product.id) {
      try {
        const { data } = await supabase
          .from('products')
          .select('specifications')
          .eq('id', product.id)
          .single();
        const specs = data?.specifications as any;
        if (specs?.blocks && Array.isArray(specs.blocks)) {
          setAttributeBlocks(specs.blocks);
        } else {
          setAttributeBlocks([]);
        }
      } catch {
        setAttributeBlocks([]);
      }

      // Load service fields if service category
      if (isServiceCategory(product.category, configs)) {
        try {
          const { data: sl } = await supabase
            .from('service_listings')
            .select('*')
            .eq('product_id', product.id)
            .maybeSingle();
          if (sl) {
            setServiceFields({
              service_type: sl.service_type || 'one_time',
              location_type: sl.location_type || 'onsite',
              duration_minutes: String(sl.duration_minutes || 60),
              buffer_minutes: String(sl.buffer_minutes || 0),
              max_bookings_per_slot: String(sl.max_bookings_per_slot || 1),
              cancellation_notice_hours: String(sl.cancellation_notice_hours || 24),
              rescheduling_notice_hours: String(sl.rescheduling_notice_hours || 12),
              preparation_instructions: (sl as any).preparation_instructions || '',
            });
          }
        } catch {
          // keep defaults
        }
      }
    }
  };

  const resetForm = () => {
    setNewProduct({
      name: '',
      price: 0,
      mrp: null,
      discount_percentage: null,
      description: '',
      category: categories[0] || '',
      is_veg: true,
      image_url: '',
      prep_time_minutes: null,
      stock_quantity: null,
      low_stock_threshold: null,
      action_type: 'add_to_cart',
    });
    setIsAdding(false);
    setEditingIndex(null);
    setAttributeBlocks([]);
    setServiceFields(INITIAL_SERVICE_FIELDS);
    setAvailabilitySchedule(INITIAL_AVAILABILITY_SCHEDULE);
    localStorage.removeItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Your Products / Services</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {products.length === 0
              ? 'Add at least one item to continue'
              : `${products.length} item${products.length !== 1 ? 's' : ''} added`}
          </p>
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {products.length} item{products.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Friendly empty state */}
      {products.length === 0 && !isAdding && (
        <div className="flex flex-col items-center justify-center py-8 px-4 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Package size={28} className="text-primary" />
          </div>
          <p className="font-medium text-sm mb-1">Your catalog is empty</p>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            Add your first product — even one item is enough to get started!
          </p>
        </div>
      )}

      {/* Success encouragement after first product */}
      {products.length > 0 && products.length <= 2 && !isAdding && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/20">
          <CheckCircle2 size={16} className="text-success flex-shrink-0" />
          <p className="text-xs text-success">
            {products.length === 1
              ? "Great start! Add more items or continue to review."
              : "You're on your way! Add more or continue when ready."}
          </p>
        </div>
      )}

      {/* Existing Products */}
      {products.map((product, index) => {
        const prodConfig = configs.find(c => c.category === product.category);
        const showVeg = prodConfig?.formHints.showVegToggle ?? false;
        return (
          <Card key={product.id || index} className="bg-muted/30">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package size={20} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {showVeg && <VegBadge isVeg={product.is_veg} size="sm" />}
                    <span className="font-medium text-sm truncate">{product.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm font-bold text-primary">
                      {product.price > 0 ? formatPrice(product.price) : 'Price on request'}
                    </p>
                    {product.mrp && product.mrp > product.price && (
                      <>
                        <span className="text-xs text-muted-foreground line-through">{formatPrice(product.mrp)}</span>
                        <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded">
                          {product.discount_percentage}% OFF
                        </span>
                      </>
                    )}
                  </div>
                  {product.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{product.description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => handleEditProduct(index)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleRemoveProduct(index)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Add New Product Form */}
      {isAdding ? (
        <>
        <div className="flex gap-6 items-start">
          <Card className="border-primary/30 flex-1 min-w-0">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-medium text-sm">{editingIndex !== null ? 'Edit Product / Service' : 'New Product / Service'}</h4>
              <div className="space-y-2">
                <Label htmlFor="prod-name" className="text-xs">Name *</Label>
                <Input
                  id="prod-name"
                  placeholder={activeConfig?.formHints.namePlaceholder || "e.g., Product Name"}
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                />
              </div>

              {/* Price + MRP Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="prod-price" className="text-xs">
                    {activeConfig?.formHints.priceLabel || 'Selling Price'} ({currencySymbol}) {requiresPrice ? '*' : ''}
                  </Label>
                  <Input
                    id="prod-price"
                    type="number"
                    min={0}
                    placeholder={requiresPrice ? '150' : '0 = On request'}
                    value={newProduct.price || ''}
                    onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prod-mrp" className="text-xs">MRP ({currencySymbol}) <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="prod-mrp"
                    type="number"
                    min={0}
                    placeholder="e.g., 200"
                    value={newProduct.mrp || ''}
                    onChange={(e) => setNewProduct({ ...newProduct, mrp: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>

              {/* Auto-computed discount display */}
              {computedDiscount !== null && computedDiscount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/20">
                  <Percent size={14} className="text-success" />
                  <span className="text-sm font-semibold text-success">{computedDiscount}% OFF</span>
                  <span className="text-xs text-muted-foreground">({formatPrice(newProduct.mrp! - newProduct.price)} savings)</span>
                </div>
              )}

              {categories.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-xs">Category</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  >
                    {categories.map((c) => {
                      const catConfig = configs.find(cfg => cfg.category === c);
                      return (
                        <option key={c} value={c}>
                          {catConfig ? catConfig.displayName : c.replace(/_/g, ' ')}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="prod-desc" className="text-xs">Description</Label>
                <Textarea
                  id="prod-desc"
                  placeholder={activeConfig?.formHints.descriptionPlaceholder || "Short description..."}
                  rows={2}
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                />
              </div>

              {/* Product Image */}
              <div className="space-y-2">
                <Label className="text-xs">Product Image <span className="text-destructive">*</span></Label>
                {user ? (
                  <ProductImageUpload
                    value={newProduct.image_url || null}
                    onChange={(url) => setNewProduct({ ...newProduct, image_url: url || '' })}
                    userId={user.id}
                    productName={newProduct.name}
                    categoryName={newProduct.category}
                    description={newProduct.description}
                    beforePick={beforePick}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Sign in to upload images</p>
                )}
              </div>

              {showVegToggle && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={newProduct.is_veg}
                    onCheckedChange={(checked) => setNewProduct({ ...newProduct, is_veg: checked as boolean })}
                  />
                  <span className="text-sm">Vegetarian</span>
                </label>
              )}

              {/* Attribute Block Builder */}
              <AttributeBlockBuilder
                category={newProduct.category || null}
                value={attributeBlocks}
                onChange={setAttributeBlocks}
              />

              {/* Service Configuration Section */}
              {isService && (
                <>
                  <ServiceFieldsSection data={serviceFields} onChange={setServiceFields} />

                  {/* Feature Flags */}
                  <div className="space-y-1 px-3 py-2 bg-muted/50 rounded-lg">
                    <p className="text-xs font-semibold text-primary">Enabled for this category</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Info size={10} />
                      <span>Service Add-ons {supportsAddons ? 'enabled' : 'not enabled'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Info size={10} />
                      <span>Recurring Bookings {supportsRecurring ? 'enabled' : 'not enabled'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Info size={10} />
                      <span>Staff Assignment {supportsStaffAssignment ? 'enabled' : 'not enabled'}</span>
                    </div>
                  </div>

                  {/* Availability Schedule */}
                  <InlineAvailabilitySchedule
                    schedule={availabilitySchedule}
                    onChange={setAvailabilitySchedule}
                  />
                </>
              )}

              {showDurationField && !isService && (
                <div className="space-y-2">
                  <Label htmlFor="prod-prep" className="text-xs">{activeConfig?.formHints.durationLabel || 'Prep Time (min)'}</Label>
                  <Input
                    id="prod-prep"
                    type="number"
                    min={1}
                    placeholder="e.g., 30"
                    value={newProduct.prep_time_minutes || ''}
                    onChange={(e) => setNewProduct({ ...newProduct, prep_time_minutes: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={resetForm}>Cancel</Button>
                <Button size="sm" className="flex-1" onClick={handleAddProduct} disabled={isSaving}>
                  {isSaving && <Loader2 size={14} className="animate-spin mr-1" />}
                  {editingIndex !== null ? 'Update Product' : 'Save Product'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Desktop sticky preview */}
          <ProductFormPreviewPanel formData={previewFormData} sellerProfile={null} attributeBlocks={attributeBlocks} />
        </div>

        {/* Mobile floating preview */}
        <ProductFormPreviewMobile formData={previewFormData} sellerProfile={null} attributeBlocks={attributeBlocks} />
        </>
      ) : (
        <Button variant="outline" className="w-full border-dashed" onClick={() => setIsAdding(true)}>
          <Plus size={16} className="mr-2" />
          Add Product / Service
        </Button>
      )}
    </div>
  );
}
