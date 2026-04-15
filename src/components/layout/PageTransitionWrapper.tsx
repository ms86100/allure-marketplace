// @ts-nocheck
import { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * Lightweight page transition — fades content in on each route change.
 * Uses AnimatePresence with mode="wait" for smooth transitions.
 * The key uses location.pathname + location.hash to avoid unnecessary
 * remounts while still animating between routes.
 */
export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const controls = useAnimation();

  useEffect(() => {
    controls.set({ opacity: 0.985, y: 2 });
    controls.start({
      opacity: 1,
      y: 0,
      transition: { duration: 0.12, ease: 'easeOut' },
    }).catch(() => undefined);
  }, [controls, location.pathname]);

  return (
    <motion.div initial={false} animate={controls} style={{ minHeight: '100%' }}>
      {children}
    </motion.div>
  );
}
