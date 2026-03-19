import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, ChevronRight } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { useCurrency } from '@/hooks/useCurrency';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FloatingCartBarProps {
  className?: string;
}

export function FloatingCartBar({ className }: FloatingCartBarProps) {
  const { itemCount, totalAmount, items } = useCart();
  const { formatPrice } = useCurrency();
  const location = useLocation();

  // Hide on cart page and checkout
  const hiddenPaths = ['/cart', '/checkout'];
  if (itemCount === 0 || hiddenPaths.some(p => location.pathname.startsWith(p))) return null;

  const thumbnails = items
    .filter(i => i.product?.image_url)
    .slice(0, 3)
    .map(i => i.product!.image_url!);

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
        <Link to="/cart">
          <motion.div
            className="rounded-2xl bg-primary px-4 py-3 flex items-center justify-between shadow-[0_4px_24px_-4px_hsl(var(--primary)/0.4)]"
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

            {/* Right: View Cart CTA */}
            <div className="flex items-center gap-1 text-primary-foreground font-bold text-sm">
              View Cart
              <ChevronRight size={16} strokeWidth={2.5} />
            </div>
          </motion.div>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
