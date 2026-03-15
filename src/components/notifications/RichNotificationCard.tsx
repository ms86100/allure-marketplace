import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Package, Star, Calendar, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { UserNotification } from '@/hooks/queries/useNotifications';
import { useMarkNotificationRead } from '@/hooks/queries/useNotifications';

function getIcon(type: string) {
  switch (type) {
    case 'order_status':
      return <Package className="text-primary" size={28} />;
    case 'review':
      return <Star className="text-amber-500" size={28} />;
    case 'booking':
    case 'reminder':
      return <Calendar className="text-primary" size={28} />;
    default:
      return <Bell className="text-primary" size={28} />;
  }
}

interface Props {
  notification: UserNotification;
  onDismiss?: () => void;
}

export function RichNotificationCard({ notification, onDismiss }: Props) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const action = notification.payload?.action;
  const referencePath = notification.reference_path || (notification.payload?.reference_path as string);

  const handleAction = () => {
    if (!notification.is_read) markRead.mutate(notification.id);
    if (referencePath?.startsWith('/')) {
      navigate(referencePath);
    }
    onDismiss?.();
  };

  const handleDismiss = () => {
    if (!notification.is_read) markRead.mutate(notification.id);
    onDismiss?.();
  };

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-lg">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            {getIcon(notification.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              <h3 className="font-bold text-base text-foreground leading-tight truncate">
                {notification.title}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{notification.body}</p>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>

        {action && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleAction}>
              {String(action)}
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={handleDismiss}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
