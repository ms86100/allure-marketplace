import { useRef, useState, useEffect, ReactNode } from 'react';

/**
 * Defers rendering of children until the wrapper scrolls into view.
 * Prevents below-fold sections from fetching data on mount.
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
      { rootMargin: '200px 0px' } // Start loading 200px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {visible ? children : null}
    </div>
  );
}
