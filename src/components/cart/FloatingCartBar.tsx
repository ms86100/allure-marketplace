import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, ChevronRight, ChevronUp, X } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { useCurrency } from '@/hooks/useCurrency';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CART_HIDDEN_ROUTES, isRouteHidden } from '@/lib/visibilityEngine';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
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
  const [showAdded, setShowAdded] = useState(false);

  useEffect(() => {
    const handler = () => {
      controls.start({
        scale: [1, 1.05, 0.97, 1],
        transition: { duration: 0.3, ease: 'easeOut' },
      });
      setShowAdded(true);
      const t = setTimeout(() => setShowAdded(false), 1500);
      return () => clearTimeout(t);
    };
    window.addEventListener('cart-item-added', handler);
    return () => window.removeEventListener('cart-item-added', handler);
  }, [controls]);

  if (itemCount === 0 || isRouteHidden(location.pathname, CART_HIDDEN_ROUTES)) return null;

  const previewItems = items.slice(0, 3);
  const isMomentum = itemCount >= 3;

  return (
    <AnimatePresence>
      <motion.div
        key="floating-cart"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className={cn(
          'fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-4 pb-2',
          className
        )}
      >
        <motion.div
          animate={controls}
          className="rounded-2xl bg-primary shadow-cta overflow-hidden"
        >
          <Link to="/cart">
            <motion.div
              className="px-5 py-3.5 flex items-center justify-between"
              whileTap={{ scale: 0.98 }}
            >
              {/* Left: item count + total */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary-foreground/15 flex items-center justify-center">
                  <ShoppingCart size={16} className="text-primary-foreground" />
                </div>
                <div className="flex flex-col">
                  <AnimatePresence mode="wait">
                    {showAdded ? (
                      <motion.span
                        key="added"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="text-primary-foreground text-sm font-bold leading-tight"
                      >
                        Added ✓
                      </motion.span>
                    ) : (
                      <motion.span
                        key="count"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="text-primary-foreground text-sm font-bold leading-tight"
                      >
                        {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatPrice(totalAmount)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right: CTA */}
              <div className="flex items-center gap-1.5 text-primary-foreground font-bold text-sm">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={isMomentum ? 'checkout' : 'view'}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                  >
                    {isMomentum ? 'Checkout' : 'View Cart'}
                  </motion.span>
                </AnimatePresence>
                <ChevronRight size={18} strokeWidth={2.5} />
              </div>
            </motion.div>
          </Link>
        </motion.div>
      </motion.div>

      {/* Mini Cart Preview Drawer */}
      <Drawer open={previewOpen} onOpenChange={setPreviewOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-3">
            <DrawerTitle className="text-sm font-bold">Cart Preview</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-3 px-4">
            {previewItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-secondary">
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
                <span className="text-sm font-bold tabular-nums">
                  {formatPrice((item.product?.price || 0) * item.quantity)}
                </span>
              </div>
            ))}
            {items.length > 3 && (
              <p className="text-xs text-muted-foreground text-center">+{items.length - 3} more item{items.length - 3 !== 1 ? 's' : ''}</p>
            )}
          </div>
          <Button className="w-full mt-4 rounded-xl" onClick={() => { setPreviewOpen(false); navigate('/cart'); }}>
            View Full Cart · {formatPrice(totalAmount)}
          </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </AnimatePresence>
  );
}
