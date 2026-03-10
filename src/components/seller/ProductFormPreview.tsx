import { useMemo, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { ProductListingCard, ProductWithSeller } from '@/components/product/ProductListingCard';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import type { ProductFormData } from '@/hooks/useSellerProducts';
import type { SellerProfile } from '@/types/database';
import { cn } from '@/lib/utils';

interface ProductFormPreviewProps {
  formData: ProductFormData;
  sellerProfile: SellerProfile | null;
}

function buildMockProduct(formData: ProductFormData, sellerProfile: SellerProfile | null): ProductWithSeller {
  const price = parseFloat(formData.price) || 0;
  const mrp = formData.mrp ? parseFloat(formData.mrp) : null;
  const now = new Date().toISOString();

  return {
    id: 'preview',
    seller_id: sellerProfile?.id || 'preview-seller',
    name: formData.name.trim() || 'Product Name',
    price,
    mrp: mrp && mrp > price ? mrp : null,
    image_url: formData.image_url,
    category: formData.category || 'other',
    is_veg: formData.is_veg,
    is_available: formData.is_available,
    is_bestseller: formData.is_bestseller,
    is_recommended: formData.is_recommended,
    is_urgent: formData.is_urgent,
    description: formData.description || null,
    action_type: formData.action_type,
    contact_phone: formData.contact_phone || null,
    stock_quantity: formData.stock_quantity ? parseInt(formData.stock_quantity) : null,
    prep_time_minutes: formData.prep_time_minutes ? parseInt(formData.prep_time_minutes) : null,
    lead_time_hours: formData.lead_time_hours ? parseInt(formData.lead_time_hours) : null,
    accepts_preorders: formData.accepts_preorders,
    seller_name: sellerProfile?.business_name || 'Your Store',
    seller_verified: true,
    seller_is_available: true,
    created_at: now,
    updated_at: now,
  };
}

/** Desktop sticky preview panel */
export function ProductFormPreviewPanel({ formData, sellerProfile }: ProductFormPreviewProps) {
  const { configs } = useCategoryConfigs();

  const mockProduct = useMemo(
    () => buildMockProduct(formData, sellerProfile),
    [formData, sellerProfile],
  );

  return (
    <div className="hidden lg:flex flex-col items-center sticky top-0">
      <div className="flex items-center gap-1.5 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <Eye size={14} />
        <span>Live Preview</span>
      </div>

      {/* Phone frame */}
      <div className="w-[180px] rounded-2xl border-2 border-border bg-muted/30 p-2 shadow-sm">
        <div className="rounded-xl overflow-hidden">
          <ProductListingCard
            product={mockProduct}
            viewOnly
            categoryConfigs={configs}
          />
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 text-center max-w-[180px] leading-tight">
        This is how buyers will see your listing
      </p>
    </div>
  );
}

/** Mobile floating preview button + drawer */
export function ProductFormPreviewMobile({ formData, sellerProfile }: ProductFormPreviewProps) {
  const [open, setOpen] = useState(false);
  const { configs } = useCategoryConfigs();

  const mockProduct = useMemo(
    () => buildMockProduct(formData, sellerProfile),
    [formData, sellerProfile],
  );

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="lg:hidden fixed bottom-20 right-4 z-[60] rounded-full shadow-lg gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Eye size={14} />
        Preview
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="z-[70]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Eye size={16} />
              Live Preview
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex justify-center pb-6 px-4">
            <div className="w-[180px]">
              <ProductListingCard
                product={mockProduct}
                viewOnly
                categoryConfigs={configs}
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
