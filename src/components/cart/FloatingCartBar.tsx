import { Link } from 'react-router-dom';
import { ShoppingCart, ChevronRight } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FloatingCartBarProps {
  className?: string;
}

export function FloatingCartBar({ className }: FloatingCartBarProps) {
  const { itemCount, totalAmount } = useCart();

  if (itemCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={cn('fixed bottom-16 left-0 right-0 z-40 px-4 pb-2 safe-bottom', className)}
      >
        <Link to="/cart">
          <motion.div
            className="rounded-xl bg-accent px-4 py-3 flex items-center justify-between shadow-md"
            whileTap={{ scale: 0.97 }}
          >
            <div className="flex items-center gap-3">
              <motion.div
                className="relative"
                key={itemCount}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
              >
                <ShoppingCart size={18} className="text-accent-foreground" />
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-background text-foreground text-[9px] font-bold flex items-center justify-center">
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              </motion.div>
              <div>
                <p className="text-accent-foreground text-sm font-bold">
                  {itemCount} item{itemCount !== 1 ? 's' : ''} · ₹{totalAmount}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 text-accent-foreground font-bold text-sm">
              View Cart
              <ChevronRight size={16} />
            </div>
          </motion.div>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
