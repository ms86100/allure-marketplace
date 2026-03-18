import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Star, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';

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
    <div className="space-y-5 px-4">
      {/* ── Top Sellers — Podium Style ── */}
      {topSellers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-warning/20 flex items-center justify-center">
              <Trophy size={14} className="text-warning" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Top Sellers in Your Society</h3>
          </div>

          {/* Podium: top 3 with center elevated */}
          {topSellers.length >= 3 ? (
            <div className="flex items-end justify-center gap-2 mb-3">
              {[topSellers[1], topSellers[0], topSellers[2]].map((s, visualIdx) => {
                const isCenter = visualIdx === 1;
                const rank = isCenter ? 0 : visualIdx === 0 ? 1 : 2;
                const hue = hashToHue(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/seller/${s.id}`)}
                    className={cn(
                      'flex flex-col items-center cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.97]',
                      isCenter ? 'w-28' : 'w-24',
                    )}
                  >
                    <span className="text-lg mb-1">{medals[rank]}</span>
                    <div className={cn(
                      'rounded-full overflow-hidden border-2 mb-1.5',
                      isCenter ? 'w-16 h-16 border-warning' : 'w-12 h-12 border-border',
                    )}>
                      {s.profile_image_url ? (
                        <img src={s.profile_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center font-bold text-white"
                          style={{ backgroundColor: `hsl(${hue}, 55%, 50%)`, fontSize: isCenter ? '18px' : '14px' }}
                        >
                          {s.business_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className={cn('font-semibold text-foreground truncate text-center w-full', isCenter ? 'text-[12px]' : 'text-[10px]')}>
                      {s.business_name}
                    </p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <Star size={9} className="text-warning fill-warning" />
                      <span className="text-[9px] font-medium text-muted-foreground">{s.rating.toFixed(1)}</span>
                    </div>
                    <p className="text-[8px] text-muted-foreground">{s.completed_order_count} orders</p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Remaining sellers (or all if < 3) as horizontal scroll */}
          {(topSellers.length < 3 ? topSellers : topSellers.slice(3)).length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {(topSellers.length < 3 ? topSellers : topSellers.slice(3)).map((s, i) => {
                const rank = topSellers.length < 3 ? i : i + 3;
                const hue = hashToHue(s.id);
                return (
                  <div
                    key={s.id}
                    className="shrink-0 w-28 rounded-2xl bg-card border border-border overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/seller/${s.id}`)}
                  >
                    <div className="p-3 text-center space-y-1">
                      <span className="text-lg">{medals[rank]}</span>
                      {s.profile_image_url ? (
                        <img src={s.profile_image_url} alt="" className="w-10 h-10 rounded-full mx-auto object-cover" />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full mx-auto flex items-center justify-center font-bold text-white"
                          style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
                        >
                          {s.business_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <p className="text-[11px] font-semibold truncate">{s.business_name}</p>
                      <div className="flex items-center justify-center gap-0.5">
                        <Star size={10} className="text-warning fill-warning" />
                        <span className="text-[10px] font-medium">{s.rating.toFixed(1)}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground">{s.completed_order_count} orders</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Most Ordered Products ── */}
      {topProducts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShoppingBag size={14} className="text-primary" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Most Ordered Products</h3>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {topProducts.map((p, i) => (
              <div key={p.product_id} className="shrink-0 w-[155px] rounded-2xl bg-card border border-border overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/seller/${p.seller_id}`)}>
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
