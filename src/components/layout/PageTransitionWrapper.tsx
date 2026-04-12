// @ts-nocheck
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * Lightweight page transition — fades content in on each route change.
 * Uses AnimatePresence with mode="wait" for smooth transitions.
 * The key uses location.pathname + location.hash to avoid unnecessary
 * remounts while still animating between routes.
 */
export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // Use pathname from hash router (everything after #)
  const routeKey = location.pathname;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, ease: 'easeOut' }}
        style={{ minHeight: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
