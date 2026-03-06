import { OrderItem, ItemStatus } from '@/types/database';
import { useStatusLabels } from '@/hooks/useStatusLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';

interface OrderItemCardProps {
  item: OrderItem;
  isSellerView: boolean;
  orderStatus: string;
  onStatusUpdate?: (itemId: string, newStatus: ItemStatus) => void;
}

export function OrderItemCard({ item, isSellerView, orderStatus }: OrderItemCardProps) {
  const { formatPrice } = useCurrency();
  const { getItemStatus } = useStatusLabels();
  const currentStatus = (item.status || 'pending') as ItemStatus;
  const statusInfo = getItemStatus(currentStatus);

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium truncate">{item.product_name}</p>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full shrink-0', statusInfo.color)}>
              {statusInfo.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatPrice(item.unit_price)} × {item.quantity} = {formatPrice(item.unit_price * item.quantity)}
          </p>
        </div>
      </div>
    </div>
  );
}
