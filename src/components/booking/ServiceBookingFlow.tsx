import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

interface ServiceBookingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  sellerId: string;
  sellerName: string;
  price: number;
  category: string;
  imageUrl?: string | null;
  durationMinutes?: number;
  locationType?: string;
}

export function ServiceBookingFlow({ open, onOpenChange, productName, sellerName, price }: ServiceBookingFlowProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Calendar size={18} className="text-primary" />
            Book Service
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2 text-center">
          <p className="text-sm text-muted-foreground">Booking for <strong>{productName}</strong> with {sellerName}</p>
          <p className="text-lg font-bold text-foreground">₹{price}</p>
          <Button className="w-full" onClick={() => onOpenChange(false)}>Coming Soon</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
