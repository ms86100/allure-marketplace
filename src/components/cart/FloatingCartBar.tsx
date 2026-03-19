import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, ChevronRight, ChevronUp, X } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { useCurrency } from '@/hooks/useCurrency';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { CART_HIDDEN_ROUTES, isRouteHidden } from '@/lib/visibilityEngine';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface FloatingCartBarProps {
  className?: string;
}

export function FloatingCartBar({ className }: FloatingCartBarProps) {
  const { itemCount, totalAmount, items } = useCart();
  const { formatPrice } = useCurrency();
  const location = useLocation();
  const navigate = useNavigate();
  const controls = useAnimation();
  const [previewOpen, setPreviewOpen] = useState(false);

  // Listen for centralized cart-item-added event → bounce pill
  useEffect(() => {
    const handler = () => {
      controls.start({
        scale: [1, 1.06, 0.97, 1],
        transition: { duration: 0.35, ease: 'easeOut' },
      });
    };
    window.addEventListener('cart-item-added', handler);
    return () => window.removeEventListener('cart-item-added', handler);
  }, [controls]);

  // Visibility engine: hide on cart/checkout pages
  if (itemCount === 0 || isRouteHidden(location.pathname, CART_HIDDEN_ROUTES)) return null;

  const thumbnails = items
    .filter(i => i.product?.image_url)
    .slice(0, 3)
    .map(i => i.product!.image_url!);

  const previewItems = items.slice(0, 3);
  const isMomentum = itemCount >= 3;

  return (
    <AnimatePresence>
      <motion.div
        key="floating-cart"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={cn(
          'fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-3 pb-2',
          className
        )}
      >
        <motion.div
          animate={controls}
          className="rounded-2xl bg-primary shadow-[0_4px_24px_-4px_hsl(var(--primary)/0.4)] overflow-hidden"
        >
          <Link to="/cart">
            <motion.div
              className="px-4 py-3 flex items-center justify-between"
              whileTap={{ scale: 0.97 }}
            >
              {/* Left: thumbnails + item count */}
              <div className="flex items-center gap-3">
                {thumbnails.length > 0 && (
                  <div className="flex -space-x-2">
                    {thumbnails.map((url, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="w-8 h-8 rounded-full border-2 border-primary-foreground/20 overflow-hidden product-image-bg"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </motion.div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-primary-foreground text-[13px] font-extrabold leading-tight">
                    {itemCount} item{itemCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-primary-foreground/70 text-[11px] font-semibold leading-tight">
                    {formatPrice(totalAmount)}
                  </span>
                </div>
              </div>

              {/* Right: CTA with momentum text */}
              <div className="flex items-center gap-1 text-primary-foreground font-bold text-sm">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={isMomentum ? 'checkout' : 'view'}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isMomentum ? 'Checkout' : 'View Cart'}
                  </motion.span>
                </AnimatePresence>
                <ChevronRight size={16} strokeWidth={2.5} />
              </div>
            </motion.div>
          </Link>

          {/* Mini preview expand trigger */}
          <button
            onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
            className="w-full flex items-center justify-center py-1 border-t border-primary-foreground/10 text-primary-foreground/50 hover:text-primary-foreground/70 transition-colors"
          >
            <ChevronUp size={14} />
          </button>
        </motion.div>
      </motion.div>

      {/* Mini Cart Preview Sheet */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6">
          <SheetHeader className="pb-3">
            <SheetTitle className="text-sm font-bold">Cart Preview</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            {previewItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-muted">
                  {item.product?.image_url ? (
                    <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm">🛍️</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.product?.name || 'Item'}</p>
                  <p className="text-xs text-muted-foreground">×{item.quantity}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {formatPrice((item.product?.price || 0) * item.quantity)}
                </span>
              </div>
            ))}
            {items.length > 3 && (
              <p className="text-xs text-muted-foreground text-center">+{items.length - 3} more item{items.length - 3 !== 1 ? 's' : ''}</p>
            )}
          </div>
          <Button className="w-full mt-4" onClick={() => { setPreviewOpen(false); navigate('/cart'); }}>
            View Full Cart · {formatPrice(totalAmount)}
          </Button>
        </SheetContent>
      </Sheet>
    </AnimatePresence>
  );
}
