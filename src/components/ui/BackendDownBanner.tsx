import { useState, useEffect } from 'react';
import { isBackendDown } from '@/lib/circuitBreaker';
import { AlertTriangle } from 'lucide-react';

export function BackendDownBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => setShow(isBackendDown());
    check();
    const interval = setInterval(check, 5_000);
    return () => clearInterval(interval);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-destructive/90 text-destructive-foreground px-4 py-2 text-center text-xs font-medium flex items-center justify-center gap-2 backdrop-blur-sm">
      <AlertTriangle size={14} className="shrink-0" />
      Our servers are experiencing high load. Some features may be slow.
    </div>
  );
}
