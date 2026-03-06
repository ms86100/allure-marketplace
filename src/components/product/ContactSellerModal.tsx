import { Phone, X, User, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ContactSellerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerName: string;
  phone: string;
}

export function ContactSellerModal({ open, onOpenChange, sellerName, phone }: ContactSellerModalProps) {
  const handleCall = () => {
    window.location.href = `tel:${phone}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Store size={18} className="text-primary" />
            Contact Seller
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{sellerName}</p>
              <p className="text-sm text-muted-foreground">{phone}</p>
            </div>
          </div>

          <Button onClick={handleCall} className="w-full gap-2">
            <Phone size={16} />
            Call Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
