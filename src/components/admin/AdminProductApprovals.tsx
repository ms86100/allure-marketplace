import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';

interface PendingProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string | null;
  image_url: string | null;
  is_veg: boolean;
  approval_status: string;
  created_at: string;
  seller: {
    business_name: string;
    society_id: string;
  } | null;
}

export function AdminProductApprovals() {
  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, price, category, description, image_url, is_veg, approval_status, created_at, seller:seller_profiles!products_seller_id_fkey(business_name, society_id)')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true });
    setProducts((data as any) || []);
    setIsLoading(false);
  };

  const handleApprove = async (id: string) => {
    setActionId(id);
    const { error } = await supabase.from('products').update({ approval_status: 'approved' } as any).eq('id', id);
    if (error) { toast.error('Failed to approve'); setActionId(null); return; }
    await logAudit('product_approved', 'product', id, '', {});
    toast.success('Product approved');
    setActionId(null);
    fetchPending();
  };

  const handleReject = async (id: string) => {
    setActionId(id);
    const { error } = await supabase.from('products').update({ approval_status: 'rejected' } as any).eq('id', id);
    if (error) { toast.error('Failed to reject'); setActionId(null); return; }
    await logAudit('product_rejected', 'product', id, '', { reason: rejectionNote });
    toast.success('Product rejected');
    setActionId(null);
    setRejectingId(null);
    setRejectionNote('');
    fetchPending();
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <Package size={14} />
        Pending Products ({products.length})
      </h3>

      {products.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">No products awaiting approval</p>
      ) : (
        products.map((product) => (
          <Card key={product.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package size={20} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-sm truncate">{product.name}</h4>
                    <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                  </div>
                  <p className="text-sm font-semibold text-primary">₹{product.price}</p>
                  {product.seller && (
                    <p className="text-xs text-muted-foreground mt-0.5">by {product.seller.business_name}</p>
                  )}
                  {product.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                  )}
                </div>
              </div>

              {rejectingId === product.id ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Rejection reason (optional)..."
                    value={rejectionNote}
                    onChange={(e) => setRejectionNote(e.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectionNote(''); }}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="destructive" disabled={actionId === product.id} onClick={() => handleReject(product.id)}>
                      {actionId === product.id && <Loader2 size={14} className="animate-spin mr-1" />}
                      Confirm Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRejectingId(product.id)} disabled={!!actionId}>
                    <X size={14} className="mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => handleApprove(product.id)} disabled={!!actionId}>
                    {actionId === product.id && <Loader2 size={14} className="animate-spin mr-1" />}
                    <Check size={14} className="mr-1" /> Approve
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
