import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bell, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { motion, AnimatePresence } from 'framer-motion';
import type { NewOrder } from '@/hooks/useNewOrderAlert';

const AUTO_DISMISS_SECONDS = 30;

interface NewOrderAlertOverlayProps {
  orders: NewOrder[];
  onDismiss: () => void;
  onDismissAll?: () => void;
  onSnooze?: () => void;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'enquired': return '📋 New Enquiry';
    case 'placed': return '🛒 New Order';
    case 'quoted': return '💬 Quote Request';
    default: return '🔔 New Order';
  }
}

export function NewOrderAlertOverlay({ orders, onDismiss, onDismissAll, onSnooze }: NewOrderAlertOverlayProps) {
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);

  const order = orders.length > 0 ? orders[0] : null;
  const queueCount = orders.length;

  // Auto-dismiss countdown
  useEffect(() => {
    if (!order) {
      setCountdown(AUTO_DISMISS_SECONDS);
      return;
    }
    setCountdown(AUTO_DISMISS_SECONDS);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto-dismiss should snooze (re-alert after 60s), not permanently dismiss
          if (onSnooze) onSnooze();
          else onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [order?.id, onDismiss, onSnooze]);

  const handleView = () => {
    const orderId = order?.id;
    if (!orderId) {
      onDismiss();
      return;
    }
    // Navigate FIRST, then dismiss ALL — prevents the multi-store buzzer trap (Bug 5)
    try {
      navigate(`/orders/${orderId}`);
    } catch (e) {
      console.error('[OrderAlert] Navigation failed, falling back:', e);
      navigate('/orders');
    }
    // Dismiss ALL pending alerts since the seller is actively engaging
    if (onDismissAll) {
      onDismissAll();
    } else {
      onDismiss();
    }
  };

  const handleSnooze = () => {
    if (onSnooze) {
      onSnooze();
    } else {
      onDismiss();
    }
  };

  return (
    <AnimatePresence mode="wait">
      {order && (
        <motion.div
          key={`new-order-alert-${order.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.8, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 40 }}
            transition={{ type: 'spring', damping: 20 }}
            className="bg-background rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pulsing bell icon + queue badge */}
            <div className="flex justify-center relative">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center"
              >
                <Bell size={32} className="text-accent" />
              </motion.div>
              {queueCount > 1 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                  {queueCount}
                </span>
              )}
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold text-foreground">{statusLabel(order.status)}</h2>
              {order.total_amount > 0 && (
                <p className="text-2xl font-bold text-accent tabular-nums">{formatPrice(order.total_amount)}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {queueCount > 1
                  ? `${queueCount} orders waiting — tap to view this one`
                  : 'Tap below to view and respond'}
              </p>
            </div>

            <Button
              className="w-full h-12 text-base bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
              onClick={handleView}
            >
              <ShoppingBag size={18} />
              View Order
              <ArrowRight size={16} />
            </Button>

            <div className="flex items-center justify-between">
              <button
                onClick={handleSnooze}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Remind me later
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Auto-dismiss in {countdown}s
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
