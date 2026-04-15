// @ts-nocheck
import { useRef, useState, useEffect, ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * Defers rendering of children until the wrapper scrolls into view.
 * Collapses to zero height when children render nothing (return null).
 */
export function LazySection({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // When not yet visible, render a minimal sentinel div (no height reservation)
  if (!visible) {
    return <div ref={ref} className={className} />;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
