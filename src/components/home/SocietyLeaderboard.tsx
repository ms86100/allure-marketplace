import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Star, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';
import { useMarketplaceLabels } from '@/hooks/useMarketplaceLabels';

interface TopSeller {
  id: string;
  business_name: string;
  profile_image_url: string | null;
  rating: number;
  completed_order_count: number;
}

interface TopProduct {
  product_id: string;
  product_name: string;
  image_url: string | null;
  order_count: number;
  seller_name: string;
  seller_id: string;
  price: number;
}

/** Deterministic hue from seller ID */
function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function SocietyLeaderboard() {
  const { effectiveSocietyId } = useAuth();
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const ml = useMarketplaceLabels();
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!effectiveSocietyId) return;
    fetchLeaderboard();
  }, [effectiveSocietyId]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    const sellersPromise = supabase
      .from('seller_profiles')
      .select('id, business_name, profile_image_url, rating, completed_order_count')
      .eq('society_id', effectiveSocietyId!)
      .eq('verification_status', 'approved')
      .gt('completed_order_count', 0)
      .order('completed_order_count', { ascending: false })
      .limit(5);

    const productsPromise = supabase.rpc('get_society_top_products', {
      _society_id: effectiveSocietyId!,
      _limit: 5,
    });

    const [sellersRes, productsRes] = await Promise.all([sellersPromise, productsPromise]);
    setTopSellers((sellersRes.data || []) as TopSeller[]);

    if (productsRes.error) {
      console.warn('[Leaderboard] RPC error:', productsRes.error.message);
      setTopProducts([]);
    } else {
      setTopProducts(
        (productsRes.data || []).map((p: any) => ({
          product_id: p.product_id,
          product_name: p.product_name,
          image_url: p.image_url,
          order_count: Number(p.order_count) || 0,
          seller_name: p.seller_name || '',
          seller_id: p.seller_id || '',
          price: p.price || 0,
        }))
      );
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (topSellers.length === 0 && topProducts.length === 0) return null;

  return (
    <div className="space-y-5 px-4">
      {/* ── Gap #7: Simplified Top Sellers — compact horizontal scroll, no podium ── */}
      {topSellers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-warning/20 flex items-center justify-center">
              <Trophy size={14} className="text-warning" />
            </div>
            <h3 className="font-bold text-sm text-foreground">{ml.label('label_section_leaderboard_sellers')}</h3>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {topSellers.map((s) => {
              const hue = hashToHue(s.id);
              return (
                <div
                  key={s.id}
                  className="shrink-0 flex flex-col items-center gap-1.5 cursor-pointer active:scale-[0.97] transition-transform w-[72px]"
                  onClick={() => navigate(`/seller/${s.id}`)}
                >
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-border">
                    {s.profile_image_url ? (
                      <img src={s.profile_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center font-bold text-white text-sm"
                        style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
                      >
                        {s.business_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] font-semibold text-foreground truncate text-center w-full leading-tight">
                    {s.business_name}
                  </p>
                  <div className="flex items-center gap-0.5">
                    <Star size={9} className="text-warning fill-warning" />
                    <span className="text-[9px] font-medium text-muted-foreground">{s.rating.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Most Ordered Products ── */}
      {topProducts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShoppingBag size={14} className="text-primary" />
            </div>
            <h3 className="font-bold text-sm text-foreground">{ml.label('label_section_leaderboard_products')}</h3>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {topProducts.map((p) => (
              <div key={p.product_id} className="shrink-0 w-[140px] rounded-2xl bg-card border border-border overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/seller/${p.seller_id}`)}>
                <div className="relative aspect-[4/3] bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag size={20} className="text-muted-foreground/40" />
                    </div>
                  )}
                  <span className="absolute bottom-1 right-1 text-[8px] font-bold text-primary-foreground bg-primary/90 backdrop-blur-sm rounded-full px-1.5 py-0.5">{p.order_count}× ordered</span>
                </div>
                <div className="p-2">
                  <p className="text-[10px] font-semibold text-foreground truncate leading-tight">{p.product_name}</p>
                  <p className="text-[9px] text-muted-foreground truncate mt-0.5">{p.seller_name}</p>
                  <p className="text-[10px] font-bold text-primary mt-0.5">{formatPrice(p.price)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
