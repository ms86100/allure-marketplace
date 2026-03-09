import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Star, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';

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

export function SocietyLeaderboard() {
  const { effectiveSocietyId } = useAuth();
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
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

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  return (
    <div className="space-y-4 px-4">
      {topSellers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={16} className="text-primary" />
            <h3 className="font-bold text-sm">Top Sellers in Your Society</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {topSellers.map((s, i) => (
              <Card key={s.id} className="shrink-0 w-28 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/seller/${s.id}`)}>
                <CardContent className="p-3 text-center space-y-1">
                  <span className="text-lg">{medals[i]}</span>
                  {s.profile_image_url ? (
                    <img src={s.profile_image_url} alt="" className="w-10 h-10 rounded-full mx-auto object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full mx-auto bg-muted flex items-center justify-center">
                      <ShoppingBag size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <p className="text-[11px] font-semibold truncate">{s.business_name}</p>
                  <div className="flex items-center justify-center gap-0.5">
                    <Star size={10} className="text-primary fill-primary" />
                    <span className="text-[10px] font-medium">{s.rating.toFixed(1)}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{s.completed_order_count} orders</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {topProducts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <ShoppingBag size={16} className="text-primary" />
            <h3 className="font-bold text-sm">Most Ordered Products</h3>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {topProducts.map((p, i) => (
              <div key={p.product_id} className="shrink-0 w-[130px] rounded-2xl bg-card border border-border overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/seller/${p.seller_id}`)}>
                <div className="relative aspect-square bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag size={24} className="text-muted-foreground/40" />
                    </div>
                  )}
                  <span className="absolute top-1.5 left-1.5 text-sm leading-none bg-background/80 backdrop-blur-sm rounded-lg px-1.5 py-1">{medals[i]}</span>
                  <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold text-primary-foreground bg-primary/90 backdrop-blur-sm rounded-full px-2 py-0.5">{p.order_count}× ordered</span>
                </div>
                <div className="p-2.5">
                  <p className="text-[11px] font-semibold text-foreground truncate leading-tight">{p.product_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{p.seller_name}</p>
                  <p className="text-[11px] font-bold text-primary mt-1">{formatPrice(p.price)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
