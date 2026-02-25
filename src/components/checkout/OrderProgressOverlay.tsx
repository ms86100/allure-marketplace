import { memo } from 'react';
import { Loader2, CheckCircle, ShoppingCart, CreditCard, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderProgressOverlayProps {
  isVisible: boolean;
  step: 'validating' | 'creating' | 'confirming';
}

const STEPS = [
  { key: 'validating', icon: ShoppingCart, label: 'Validating cart…' },
  { key: 'creating', icon: Package, label: 'Creating order…' },
  { key: 'confirming', icon: CreditCard, label: 'Confirming payment…' },
] as const;

function OrderProgressOverlayInner({ isVisible, step }: OrderProgressOverlayProps) {
  if (!isVisible) return null;

  const currentIdx = STEPS.findIndex(s => s.key === step);

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border border-border rounded-2xl p-6 mx-6 w-full max-w-sm shadow-lg">
        <div className="flex items-center justify-center mb-5">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <h3 className="text-base font-bold text-center mb-4">Placing your order</h3>
        <div className="space-y-3">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = idx === currentIdx;
            const isDone = idx < currentIdx;

            return (
              <div
                key={s.key}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-all',
                  isActive && 'bg-primary/10',
                  isDone && 'opacity-60'
                )}
              >
                {isDone ? (
                  <CheckCircle size={18} className="text-primary shrink-0" />
                ) : isActive ? (
                  <Loader2 size={18} className="animate-spin text-primary shrink-0" />
                ) : (
                  <Icon size={18} className="text-muted-foreground shrink-0" />
                )}
                <span className={cn('text-sm', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">
          Please don't close this screen
        </p>
      </div>
    </div>
  );
}

export const OrderProgressOverlay = memo(OrderProgressOverlayInner);
