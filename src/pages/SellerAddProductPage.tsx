import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { DraftProductManager } from '@/components/seller/DraftProductManager';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { ParentGroup } from '@/types/categories';

export default function SellerAddProductPage() {
  const navigate = useNavigate();
  const { id: productId } = useParams<{ id: string }>();
  const { user, sellerProfiles, currentSellerId } = useAuth();
  const { groupedConfigs } = useCategoryConfigs();

  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [initialProduct, setInitialProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isEditMode = !!productId;

  useEffect(() => {
    if (!user) return;
    const sellerId = currentSellerId || sellerProfiles[0]?.id;
    if (!sellerId) { setIsLoading(false); return; }

    (async () => {
      setIsLoading(true);
      try {
        const { data: profile } = await supabase
          .from('seller_profiles')
          .select('*')
          .eq('id', sellerId)
          .single();
        if (!profile) { setIsLoading(false); return; }
        setSellerProfile(profile);

        if (isEditMode && productId) {
          const { data: product } = await supabase
            .from('products')
            .select('*')
            .eq('id', productId)
            .eq('seller_id', profile.id)
            .single();
          if (!product) {
            setNotFound(true);
          } else {
            setInitialProduct({
              id: product.id,
              name: product.name,
              price: product.price,
              mrp: (product as any).mrp || null,
              discount_percentage: null,
              description: product.description || '',
              category: product.category,
              is_veg: product.is_veg,
              image_url: product.image_url || '',
              prep_time_minutes: (product as any).prep_time_minutes || null,
              stock_quantity: (product as any).stock_quantity || null,
              low_stock_threshold: (product as any).low_stock_threshold || null,
              action_type: (product as any).action_type || 'add_to_cart',
              subcategory_id: (product as any).subcategory_id || null,
              lead_time_hours: (product as any).lead_time_hours || null,
              accepts_preorders: (product as any).accepts_preorders || false,
              approval_status: (product as any).approval_status || 'draft',
            });
          }
        }
      } catch (e) {
        console.error('Error loading product page:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user, currentSellerId, sellerProfiles, productId, isEditMode]);

  const primaryGroup = (sellerProfile as any)?.primary_group as ParentGroup | null;
  const categories = primaryGroup && groupedConfigs[primaryGroup]
    ? groupedConfigs[primaryGroup].map(c => c.category)
    : [];
  const defaultActionType = (sellerProfile as any)?.default_action_type || undefined;

  if (isLoading) {
    return (
      <AppLayout showHeader={false}>
        <div className="p-4">
          <Skeleton className="h-10 w-32 mb-6" />
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (notFound) {
    return (
      <AppLayout showHeader={false}>
        <div className="p-4">
          <Link to="/seller/products" className="flex items-center gap-2 text-muted-foreground mb-6">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0">
              <ArrowLeft size={18} />
            </span>
            <span>Back to Products</span>
          </Link>
          <div className="text-center py-12">
            <p className="text-muted-foreground">Product not found</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!sellerProfile) {
    return (
      <AppLayout showHeader={false}>
        <div className="p-4 text-center py-12">
          <p className="text-muted-foreground">No seller profile found</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showHeader={false}>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/seller/products" className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0">
              <ArrowLeft size={18} />
            </span>
          </Link>
          <div>
            <h1 className="text-xl font-bold">
              {isEditMode ? 'Edit Product' : 'Add Product'}
            </h1>
            <p className="text-xs text-muted-foreground">{sellerProfile.business_name}</p>
          </div>
        </div>

        <DraftProductManager
          sellerId={sellerProfile.id}
          categories={categories}
          products={[]}
          onProductsChange={() => {}}
          defaultActionType={defaultActionType}
          mode="standalone"
          onComplete={() => navigate('/seller/products')}
          initialProduct={isEditMode ? initialProduct : undefined}
          sellerProfileData={sellerProfile}
        />
      </div>
    </AppLayout>
  );
}
