import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProximityMessages {
  at_doorstep_title?: string;
  arriving_title?: string;
  subtitle?: string;
}

interface DeliveryArrivalOverlayProps {
  distance: number | null;
  eta: number | null;
  riderName: string | null;
  riderPhone: string | null;
  status: string | null;
  onDismiss: () => void;
  deliveryCode?: string | null;
  /** DB-backed proximity messages */
  proximityMessages?: ProximityMessages;
}

export function DeliveryArrivalOverlay({
  distance,
  eta,
  riderName,
  riderPhone,
  status,
  onDismiss,
  deliveryCode,
  proximityMessages,
}: DeliveryArrivalOverlayProps) {
  const [dismissed, setDismissed] = useState(false);

  // Show only when distance < 200m and in transit
  const isImminent = distance !== null && distance < 200 &&
    ['picked_up', 'on_the_way', 'at_gate'].includes(status || '');

  const visible = isImminent && !dismissed;

  useEffect(() => {
    // Reset dismissed when distance goes above threshold
    if (!isImminent) setDismissed(false);
  }, [isImminent]);

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-24 pt-4 bg-background/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="w-full max-w-md bg-card border-2 border-primary/30 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Pulsing header */}
            <div className="bg-primary/10 p-4 text-center relative">
              <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-muted flex items-center justify-center"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3"
              >
                <MapPin size={28} className="text-primary" />
              </motion.div>
              <h2 className="text-lg font-bold text-foreground">
                {distance !== null && distance < 50
                  ? (proximityMessages?.at_doorstep_title || '🏠 At your doorstep!')
                  : (proximityMessages?.arriving_title || '🏃 Driver arriving now!')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {proximityMessages?.subtitle || 'Please get ready to receive your order'}
              </p>
            </div>

            {/* Info */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Distance</span>
                <span className="font-semibold text-foreground">
                  {distance !== null ? (distance < 100 ? `${distance}m` : `${(distance / 1000).toFixed(1)} km`) : '—'}
                </span>
              </div>
              {eta != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ETA</span>
                  <span className="font-semibold text-primary">{eta} min</span>
                </div>
              )}
              {riderName && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Partner</span>
                  <span className="font-semibold text-foreground">{riderName}</span>
                </div>
              )}

              {riderPhone && (
                <a href={`tel:${riderPhone}`} className="block">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Phone size={14} />
                    Call Delivery Partner
                  </Button>
                </a>
              )}

              {/* Gap A: Show OTP in arrival overlay */}
              {deliveryCode && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Your Delivery OTP</p>
                  <p className="text-2xl font-bold tracking-[0.3em] text-primary">{deliveryCode}</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
