// @ts-nocheck
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * Lightweight page transition — fades content in on each route change.
 * Uses key={location.key} so AnimatePresence isn't needed (avoids blank-screen
 * issues with HashRouter where pathname is always "/").
 */
export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <motion.div
      key={location.key}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  );
}
